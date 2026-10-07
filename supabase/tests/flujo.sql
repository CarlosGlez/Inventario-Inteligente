-- Pruebas de la base de datos.
--
-- Cómo correrlas: pega TODO este archivo en el SQL Editor de Supabase y pulsa Run.
-- Si todo está bien, el resultado es una fila que dice TODAS LAS PRUEBAS PASARON.
-- Si algo falla, aparece el nombre de la prueba (T01, T02, ...) y el motivo.
--
-- No deja rastro: todo corre dentro de una transacción que termina en ROLLBACK,
-- así que tus datos reales quedan exactamente como estaban.

begin;

-- Las pruebas necesitan tablas vacías para que las cuentas sean exactas.
delete from movements;
delete from alerts;
delete from settings;
delete from products;

-- Ayudante: ejecuta una instrucción que DEBE fallar con cierto código de error.
--   23514 = CHECK no cumplido      23505 = valor repetido (UNIQUE)
--   42501 = sin permiso            P0001 = error lanzado por nuestras funciones
create function pg_temp.debe_fallar(p_prueba text, p_sql text, p_codigo text, p_patron text default null)
returns void language plpgsql as $$
declare
  v_fallo boolean := false;
  v_codigo text;
  v_mensaje text;
begin
  begin
    execute p_sql;
  exception when others then
    v_fallo := true;
    v_codigo := sqlstate;
    v_mensaje := sqlerrm;
  end;
  if not v_fallo then
    raise exception '%: se esperaba un error y la instrucción fue aceptada: %', p_prueba, p_sql;
  end if;
  if v_codigo <> p_codigo then
    raise exception '%: se esperaba el error % y llegó % (%)', p_prueba, p_codigo, v_codigo, v_mensaje;
  end if;
  if p_patron is not null and v_mensaje not like p_patron then
    raise exception '%: el mensaje "%" no coincide con "%"', p_prueba, v_mensaje, p_patron;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- TABLAS Y RESTRICCIONES
-- ---------------------------------------------------------------------------

-- T01: stock y costo nunca pueden ser negativos.
select pg_temp.debe_fallar('T01 stock_actual', $q$insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('T01', 'Prueba', 'Clase', -1, 0, 0)$q$, '23514');
select pg_temp.debe_fallar('T01 stock_minimo', $q$insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('T01', 'Prueba', 'Clase', 0, -1, 0)$q$, '23514');
select pg_temp.debe_fallar('T01 costo', $q$insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('T01', 'Prueba', 'Clase', 0, 0, -1)$q$, '23514');

-- T02: el código es único.
insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('T02', 'Uno', 'Clase', 1, 1, 1);
select pg_temp.debe_fallar('T02', $q$insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('T02', 'Dos', 'Clase', 1, 1, 1)$q$, '23505');

-- T03: el costo se guarda con dos decimales exactos.
insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('T03', 'Decimales', 'Clase', 1, 1, 12.345);
do $$
begin
  assert (select costo from products where codigo = 'T03') = 12.35, 'T03: 12.345 debió guardarse como 12.35';
end $$;

-- T04: código, nombre y categoría son obligatorios y de máximo 120 caracteres.
do $$
declare
  v_campo text;
  v_malo text;
  v_valores text;
begin
  foreach v_campo in array array['codigo', 'nombre', 'categoria'] loop
    foreach v_malo in array array['', '   ', repeat('x', 121)] loop
      v_valores := format('%L, %L, %L',
        case when v_campo = 'codigo' then v_malo else 'T04' end,
        case when v_campo = 'nombre' then v_malo else 'Prueba' end,
        case when v_campo = 'categoria' then v_malo else 'Clase' end);
      perform pg_temp.debe_fallar('T04 ' || v_campo,
        'insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values (' || v_valores || ', 1, 1, 1)',
        '23514');
    end loop;
  end loop;
end $$;

-- T05: los movimientos y las alertas solo aceptan valores válidos.
select pg_temp.debe_fallar('T05 tipo', $q$insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo) values ('T05', 'Prueba', 'otro', 1, 0, 1)$q$, '23514');
select pg_temp.debe_fallar('T05 cantidad', $q$insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo) values ('T05', 'Prueba', 'entrada', 0, 0, 0)$q$, '23514');
select pg_temp.debe_fallar('T05 status', $q$insert into alerts (items, subject, body, status) values ('[]', 'Asunto', 'Cuerpo', 'otro')$q$, '23514');

-- ---------------------------------------------------------------------------
-- FUNCIONES, TRIGGER Y VISTAS
-- ---------------------------------------------------------------------------

create function pg_temp.limpiar() returns void language sql as $$
  delete from movements; delete from alerts; delete from settings; delete from products;
$$;

create function pg_temp.producto(p_codigo text, p_nombre text, p_stock integer, p_minimo integer, p_costo numeric)
returns bigint language sql as $$
  insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo)
  values (p_codigo, p_nombre, 'Clase', p_stock, p_minimo, p_costo)
  returning id;
$$;

-- T10: al recuperarse el stock, la marca "ya avisé" (low_active) se apaga sola.
do $$
declare
  v_id bigint;
begin
  perform pg_temp.limpiar();
  insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo, low_active)
  values ('T10', 'Prueba', 'Clase', 1, 5, 0, true) returning id into v_id;

  update products set stock_actual = 4 where id = v_id;
  assert (select low_active from products where id = v_id), 'T10: mientras siga bajo, low_active debe seguir en true';

  update products set stock_actual = 5 where id = v_id;
  assert not (select low_active from products where id = v_id), 'T10: con stock igual al mínimo, low_active debe apagarse';

  insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo, low_active)
  values ('T10B', 'Prueba', 'Clase', 9, 5, 0, true);
  assert not (select low_active from products where codigo = 'T10B'), 'T10: un producto nuevo con stock suficiente no puede nacer con low_active';
end $$;

-- T11: una salida no puede dejar el stock negativo; una entrada sí se registra.
do $$
declare
  v_id bigint;
begin
  perform pg_temp.limpiar();
  v_id := pg_temp.producto('X1', 'Prueba', 2, 5, 10);

  perform pg_temp.debe_fallar('T11', format('select registrar_movimiento(%s, ''salida'', 3)', v_id),
    'P0001', 'La salida supera el stock disponible; el inventario no puede quedar negativo.');
  assert (select stock_actual from products where id = v_id) = 2, 'T11: el stock debió quedar en 2';
  assert (select count(*) from movements) = 0, 'T11: una salida rechazada no debe dejar movimiento';

  assert registrar_movimiento(v_id, 'entrada', 3) = 5, 'T11: la entrada debió devolver 5';
  assert (select stock_actual from products where id = v_id) = 5, 'T11: el stock debió quedar en 5';
  assert (select count(*) from movements
          where product_code = 'X1' and product_name = 'Prueba' and tipo = 'entrada'
            and cantidad = 3 and stock_anterior = 2 and stock_nuevo = 5) = 1,
         'T11: falta el movimiento con stock anterior 2 y nuevo 5';
end $$;

-- T12: mensajes de error de registrar_movimiento.
do $$
declare
  v_id bigint;
begin
  perform pg_temp.limpiar();
  v_id := pg_temp.producto('X1', 'Prueba', 2, 5, 10);
  perform pg_temp.debe_fallar('T12 tipo', format('select registrar_movimiento(%s, ''otro'', 1)', v_id),
    'P0001', 'El movimiento debe ser entrada o salida.');
  perform pg_temp.debe_fallar('T12 cero', format('select registrar_movimiento(%s, ''entrada'', 0)', v_id),
    'P0001', 'cantidad: debe ser mayor que cero.');
  perform pg_temp.debe_fallar('T12 negativa', format('select registrar_movimiento(%s, ''entrada'', -4)', v_id),
    'P0001', 'cantidad: debe ser mayor que cero.');
  perform pg_temp.debe_fallar('T12 inexistente', 'select registrar_movimiento(-1, ''entrada'', 1)',
    'P0001', 'El producto ya no existe.');
end $$;

-- T13: el historial se conserva aunque se elimine el producto.
do $$
declare
  v_id bigint;
begin
  perform pg_temp.limpiar();
  v_id := pg_temp.producto('X1', 'Prueba', 2, 5, 10);
  perform registrar_movimiento(v_id, 'entrada', 1);
  delete from products where id = v_id;
  assert (select count(*) from movements where product_code = 'X1') = 1, 'T13: el movimiento debió conservarse';
end $$;

-- T14: una alerta por episodio. No se repite mientras siga bajo; tras
-- recuperarse y volver a caer, se crea una alerta nueva.
do $$
declare
  v_id bigint;
  v_primera bigint;
  v_segunda bigint;
begin
  perform pg_temp.limpiar();
  v_id := pg_temp.producto('X1', 'Prueba', 2, 5, 10);
  perform pg_temp.producto('IGUAL', 'Justo en el mínimo', 5, 5, 10);

  v_primera := crear_alerta_stock_bajo();
  assert v_primera is not null, 'T14: la primera revisión debió crear una alerta';
  assert (select status from alerts where id = v_primera) = 'pendiente', 'T14: la alerta nace pendiente';
  assert (select jsonb_array_length(items) from alerts where id = v_primera) = 1,
         'T14: stock igual al mínimo no cuenta como bajo';
  assert (select low_active from products where id = v_id), 'T14: el producto debió quedar marcado';

  assert crear_alerta_stock_bajo() is null, 'T14: la segunda revisión no debe repetir el aviso';
  assert (select count(*) from alerts) = 1, 'T14: debe haber una sola alerta';

  perform registrar_movimiento(v_id, 'entrada', 3);
  assert (select bajos from resumen_inventario) = 0, 'T14: tras la entrada no debe haber productos bajos';
  assert crear_alerta_stock_bajo() is null, 'T14: recuperado, no hay nada que avisar';

  perform registrar_movimiento(v_id, 'salida', 1);
  v_segunda := crear_alerta_stock_bajo();
  assert v_segunda is not null and v_segunda <> v_primera, 'T14: la nueva caída debió crear otra alerta';
  assert (select count(*) from alerts) = 2, 'T14: debe haber dos alertas';
  assert (select ultima_revision from resumen_inventario) is not null, 'T14: falta la fecha de la última revisión';
end $$;

-- T15: costos, valor del inventario y texto exacto del correo.
do $$
declare
  v_alerta alerts;
  v_resumen resumen_inventario;
  v_id bigint;
begin
  perform pg_temp.limpiar();
  insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values
    ('C1', 'Tóner', 'Oficina', 1, 4, 1250.50),
    ('C2', 'Hojas', 'Oficina', 10, 2, 99.99);

  select * into v_resumen from resumen_inventario;
  assert v_resumen.total = 2, 'T15: total';
  assert v_resumen.bajos = 1, 'T15: bajos';
  assert v_resumen.valor = 2250.40, 'T15: valor del inventario, llegó ' || v_resumen.valor;
  assert v_resumen.reponer = 3751.50, 'T15: costo de reponer, llegó ' || v_resumen.reponer;

  v_id := crear_alerta_stock_bajo();
  select * into v_alerta from alerts where id = v_id;
  assert v_alerta.items -> 0 ->> 'codigo' = 'C1', 'T15: producto de la alerta';
  assert v_alerta.items -> 0 ->> 'faltante' = '3', 'T15: faltante';
  assert v_alerta.items -> 0 ->> 'costo' = '1250.50', 'T15: costo unitario';
  assert v_alerta.items -> 0 ->> 'costo_reponer' = '3751.50', 'T15: costo de reposición';
  assert v_alerta.subject = 'Alerta de inventario: 1 producto(s) con stock bajo', 'T15: asunto "' || v_alerta.subject || '"';
  assert v_alerta.body =
    E'Productos por debajo del stock mínimo:\n\n'
    || E'• C1 — Tóner: actual 1, mínimo 4. Reponer 3 u. × $1,250.50 = $3,751.50\n\n'
    || E'Costo estimado para llegar al mínimo: $3,751.50\n\n'
    || 'Generado por Control inteligente de inventario y alertas de stock.',
    'T15: cuerpo del correo distinto: ' || v_alerta.body;
  assert dinero(0) = '$0.00' and dinero(12.5) = '$12.50' and dinero(1234567.8) = '$1,234,567.80', 'T15: formato de dinero';
end $$;

-- T15b: un número enorme capturado por error no debe tumbar el resumen ni el correo.
do $$
declare
  v_id bigint;
begin
  perform pg_temp.limpiar();
  insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values
    ('G1', 'Gigante', 'Clase', 2000000000, 0, 9999999999.99),
    ('G2', 'Faltante gigante', 'Clase', 0, 2147483647, 9999999999.99);
  assert (select valor from resumen_inventario) = 2000000000 * 9999999999.99, 'T15b: valor con números enormes';
  assert (select reponer from resumen_inventario) = 2147483647 * 9999999999.99, 'T15b: reponer con números enormes';
  v_id := crear_alerta_stock_bajo();
  assert (select body from alerts where id = v_id) like '%= $21,474,836,469,978,525,163.53%',
         'T15b: el importe enorme debe verse completo en el correo: ' || (select body from alerts where id = v_id);
end $$;

-- T16: importar crea y actualiza sin duplicar, y es todo o nada.
do $$
begin
  perform pg_temp.limpiar();
  assert importar_productos('[
    {"codigo": "P001", "nombre": "Cuaderno", "categoria": "Papelería", "stock_actual": 3, "stock_minimo": 8, "costo": 45},
    {"codigo": "P002", "nombre": "Lápiz HB", "categoria": "Papelería", "stock_actual": 40, "stock_minimo": 15, "costo": 6.5}
  ]') = 2, 'T16: debió importar 2';

  update products set low_active = true where codigo = 'P001';
  assert importar_productos('[
    {"codigo": " P001 ", "nombre": "Cuaderno nuevo", "categoria": "Papelería", "stock_actual": 20, "stock_minimo": 10, "costo": 50}
  ]') = 1, 'T16: debió actualizar 1';
  assert (select count(*) from products) = 2, 'T16: no debe duplicar productos';
  assert (select nombre from products where codigo = 'P001') = 'Cuaderno nuevo', 'T16: el nombre debió actualizarse';
  assert (select costo from products where codigo = 'P001') = 50, 'T16: el costo debió actualizarse';
  assert not (select low_active from products where codigo = 'P001'), 'T16: al recuperarse por importación se apaga low_active';

  perform pg_temp.debe_fallar('T16', $q$select importar_productos('[
    {"codigo": "P020", "nombre": "Bien", "categoria": "Otra", "stock_actual": 1, "stock_minimo": 2, "costo": 1},
    {"codigo": "P021", "nombre": "Mal", "categoria": "Otra", "stock_actual": -1, "stock_minimo": 2, "costo": 1}
  ]')$q$, '23514');
  assert not exists (select from products where codigo = 'P020'), 'T16: si una fila falla no se guarda ninguna';
end $$;

-- T17: un Excel viejo sin costo conserva el costo de los productos existentes.
do $$
begin
  perform pg_temp.limpiar();
  perform importar_productos('[{"codigo": "L1", "nombre": "Viejo", "categoria": "Otra", "stock_actual": 5, "stock_minimo": 1, "costo": 30}]');
  assert importar_productos('[
    {"codigo": "L1", "nombre": "Viejo", "categoria": "Otra", "stock_actual": 8, "stock_minimo": 1, "costo": null},
    {"codigo": "L2", "nombre": "Nuevo", "categoria": "Otra", "stock_actual": 2, "stock_minimo": 1}
  ]') = 2, 'T17: debió importar 2';
  assert (select costo from products where codigo = 'L1') = 30.00, 'T17: L1 debe conservar su costo';
  assert (select stock_actual from products where codigo = 'L1') = 8, 'T17: L1 debió actualizar su stock';
  assert (select costo from products where codigo = 'L2') = 0.00, 'T17: L2 nace con costo 0';
end $$;

-- T18: códigos repetidos o lista vacía.
do $$
begin
  perform pg_temp.limpiar();
  perform pg_temp.debe_fallar('T18 repetido', $q$select importar_productos('[
    {"codigo": "P001", "nombre": "A", "categoria": "Otra", "stock_actual": 1, "stock_minimo": 1, "costo": 1},
    {"codigo": "P001", "nombre": "B", "categoria": "Otra", "stock_actual": 1, "stock_minimo": 1, "costo": 1}
  ]')$q$, 'P0001', 'codigo: ''P001'' aparece más de una vez en el archivo.');
  assert (select count(*) from products) = 0, 'T18: no debió guardar nada';
  perform pg_temp.debe_fallar('T18 vacío', $q$select importar_productos('[]')$q$, 'P0001', 'El archivo no contiene productos.');
  perform pg_temp.debe_fallar('T18 nulo', $q$select importar_productos(null)$q$, 'P0001', 'El archivo no contiene productos.');
  perform pg_temp.debe_fallar('T18 no lista', $q$select importar_productos('{"codigo": "P1"}')$q$, 'P0001', 'El archivo no contiene productos.');
end $$;

-- T19: reclamar una alerta para enviarla. Solo un proceso la obtiene.
do $$
declare
  v_id bigint;
begin
  perform pg_temp.limpiar();
  perform pg_temp.producto('X2', 'Prueba', 0, 1, 0);
  v_id := crear_alerta_stock_bajo();

  assert (select count(*) from reclamar_alerta(v_id)) = 1, 'T19: la primera vez debe reclamarla';
  assert (select status = 'enviando' and attempts = 1 and last_attempt_at is not null from alerts where id = v_id),
         'T19: debió quedar enviando con 1 intento';
  assert (select count(*) from reclamar_alerta(v_id)) = 0, 'T19: mientras se envía nadie más puede reclamarla';
  assert (select attempts from alerts where id = v_id) = 1, 'T19: un reclamo rechazado no suma intentos';

  update alerts set status = 'error', error = 'falló' where id = v_id;
  assert (select count(*) from reclamar_alerta(v_id)) = 1, 'T19: una alerta con error se puede reintentar';
  assert (select attempts = 2 and error is null from alerts where id = v_id), 'T19: 2 intentos y error limpio';

  update alerts set last_attempt_at = now() - interval '4 minutes' where id = v_id;
  assert (select count(*) from reclamar_alerta(v_id)) = 0, 'T19: con 4 minutos enviando todavía no se libera';

  update alerts set last_attempt_at = now() - interval '6 minutes' where id = v_id;
  assert (select count(*) from reclamar_alerta(v_id)) = 1, 'T19: con más de 5 minutos atorada se puede reintentar';
  assert (select attempts from alerts where id = v_id) = 3, 'T19: 3 intentos';

  update alerts set status = 'enviado' where id = v_id;
  assert (select count(*) from reclamar_alerta(v_id)) = 0, 'T19: una alerta enviada no se reenvía';
  update alerts set status = 'simulado' where id = v_id;
  assert (select count(*) from reclamar_alerta(v_id)) = 0, 'T19: una alerta simulada no se reenvía';
  assert (select count(*) from reclamar_alerta(-1)) = 0, 'T19: una alerta inexistente no devuelve nada';
end $$;

-- T20: el consumo solo cuenta salidas de los últimos 30 días.
do $$
begin
  perform pg_temp.limpiar();
  insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo, created_at) values
    ('F1', 'Rápido', 'salida', 5, 100, 95, now() - interval '40 days'),
    ('F1', 'Rápido', 'salida', 10, 95, 85, now() - interval '10 days'),
    ('F1', 'Rápido', 'salida', 20, 85, 65, now() - interval '2 days'),
    ('F1', 'Rápido', 'entrada', 50, 65, 115, now() - interval '1 day'),
    ('F2', 'Lento', 'salida', 1, 10, 9, now() - interval '35 days');
  assert (select count(*) from consumo_30d) = 1, 'T20: solo F1 tiene salidas recientes';
  assert (select total from consumo_30d where product_code = 'F1') = 30, 'T20: total de salidas recientes';
  assert (select primera from consumo_30d where product_code = 'F1') = now() - interval '10 days', 'T20: fecha de la primera salida';
end $$;

-- T20b: muchas salidas grandes no deben tumbar el consumo (y con él, la página).
do $$
begin
  perform pg_temp.limpiar();
  insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo, created_at) values
    ('H1', 'Enorme', 'salida', 2000000000, 2147483647, 147483647, now() - interval '2 days'),
    ('H1', 'Enorme', 'salida', 2000000000, 2147483647, 147483647, now() - interval '1 day');
  assert (select total from consumo_30d where product_code = 'H1') = 4000000000, 'T20b: total mayor al límite de integer';
end $$;

-- ---------------------------------------------------------------------------
-- SEGURIDAD (RLS Y PERMISOS)
-- "set local role" hace que las instrucciones siguientes corran como ese rol:
--   anon = visitante sin sesión · authenticated = usuario con sesión · service_role = el bot
-- ---------------------------------------------------------------------------

-- T30: las cuatro tablas tienen RLS activado.
do $$
begin
  assert (select count(*) from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in ('products', 'movements', 'alerts', 'settings')
            and relrowsecurity) = 4,
         'T30: las cuatro tablas deben tener RLS activado';
end $$;

-- Datos de apoyo, creados con permisos completos.
select pg_temp.limpiar();
insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('S1', 'Seguridad', 'Clase', 0, 5, 10);
insert into settings (key, value) values ('last_check', '2026-01-01T00:00:00Z');
select crear_alerta_stock_bajo();

-- T31: sin sesión no se puede leer ni ejecutar nada.
set local role anon;
select pg_temp.debe_fallar('T31 products', 'select count(*) from products', '42501');
select pg_temp.debe_fallar('T31 movements', 'select count(*) from movements', '42501');
select pg_temp.debe_fallar('T31 alerts', 'select count(*) from alerts', '42501');
select pg_temp.debe_fallar('T31 settings', 'select count(*) from settings', '42501');
select pg_temp.debe_fallar('T31 resumen', 'select * from resumen_inventario', '42501');
select pg_temp.debe_fallar('T31 consumo', 'select * from consumo_30d', '42501');
select pg_temp.debe_fallar('T31 insertar', $q$insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo) values ('H', 'H', 'H', 1, 1, 1)$q$, '42501');
select pg_temp.debe_fallar('T31 movimiento', 'select registrar_movimiento(1, ''entrada'', 1)', '42501');
select pg_temp.debe_fallar('T31 importar', $q$select importar_productos('[]')$q$, '42501');
select pg_temp.debe_fallar('T31 crear alerta', 'select crear_alerta_stock_bajo()', '42501');
select pg_temp.debe_fallar('T31 reclamar', 'select reclamar_alerta(1)', '42501');
reset role;

-- T32: con sesión se administra el inventario, pero el historial y las alertas
-- solo se leen, y las funciones del bot están prohibidas.
set local role authenticated;
do $$
declare
  v_id bigint;
begin
  insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo)
  values ('S2', 'Con sesión', 'Clase', 3, 1, 5) returning id into v_id;
  update products set nombre = 'Editado' where id = v_id;
  assert (select nombre from products where id = v_id) = 'Editado', 'T32: debe poder editar productos';
  assert registrar_movimiento(v_id, 'entrada', 2) = 5, 'T32: debe poder registrar movimientos';
  assert importar_productos('[{"codigo": "S3", "nombre": "Importado", "categoria": "Clase", "stock_actual": 1, "stock_minimo": 1, "costo": 1}]') = 1,
         'T32: debe poder importar';
  assert (select count(*) from products) = 3, 'T32: debe ver los 3 productos';
  assert (select count(*) from movements) = 1, 'T32: debe poder leer movimientos';
  assert (select count(*) from alerts) = 1, 'T32: debe poder leer alertas';
  assert (select count(*) from settings) = 1, 'T32: debe poder leer ajustes';
  assert (select total from resumen_inventario) = 3, 'T32: debe poder leer el resumen';
  assert (select count(*) from consumo_30d) = 0, 'T32: debe poder leer el consumo';
  delete from products where id = v_id;
  assert (select count(*) from products) = 2, 'T32: debe poder eliminar productos';
end $$;
select pg_temp.debe_fallar('T32 insertar movimiento', $q$insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo) values ('S1', 'X', 'entrada', 1, 0, 1)$q$, '42501');
select pg_temp.debe_fallar('T32 editar movimiento', 'update movements set cantidad = 99', '42501');
select pg_temp.debe_fallar('T32 borrar movimiento', 'delete from movements', '42501');
select pg_temp.debe_fallar('T32 editar alerta', $q$update alerts set status = 'enviado'$q$, '42501');
select pg_temp.debe_fallar('T32 borrar alerta', 'delete from alerts', '42501');
select pg_temp.debe_fallar('T32 editar ajustes', $q$update settings set value = 'x'$q$, '42501');
select pg_temp.debe_fallar('T32 crear alerta', 'select crear_alerta_stock_bajo()', '42501');
select pg_temp.debe_fallar('T32 reclamar', 'select reclamar_alerta(1)', '42501');
reset role;

-- T33: el bot puede crear, reclamar y cerrar alertas.
set local role service_role;
do $$
declare
  v_id bigint;
begin
  update products set stock_actual = 9 where codigo = 'S1';
  update products set stock_actual = 0 where codigo = 'S1';
  v_id := crear_alerta_stock_bajo();
  assert v_id is not null, 'T33: el bot debe poder crear alertas';
  assert (select count(*) from reclamar_alerta(v_id)) = 1, 'T33: el bot debe poder reclamar';
  update alerts set status = 'enviado' where id = v_id;
  assert (select status from alerts where id = v_id) = 'enviado', 'T33: el bot debe poder cerrar la alerta';
  assert (select count(*) from alerts where status = 'pendiente') = 1, 'T33: el bot debe poder listar pendientes';
end $$;
reset role;

-- ---------------------------------------------------------------------------
select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
