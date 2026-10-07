-- 0002 · Reglas automáticas, funciones y vistas
--
-- Una función de Postgres corre COMPLETA o no corre: si algo falla a la mitad,
-- la base deshace todo lo que la función había hecho. Eso es lo que significa
-- "atómico", y por eso las operaciones delicadas viven aquí y no en la página.

-- Formato de dinero para el correo: 3751.5 -> $3,751.50 -----------------------
create function dinero(v numeric) returns text
language sql immutable as $$
  select '$' || to_char(coalesce(v, 0), 'FM999,999,999,999,999,999,999,990.00');
$$;

-- Regla de recuperación (trigger) --------------------------------------------
-- Cada vez que un producto se crea o cambia, si su stock ya alcanza el mínimo
-- se apaga la marca low_active. Así, si vuelve a caer, se avisa otra vez.
-- Al estar en la base, la regla aplica igual al editar, mover o importar.
create function products_recuperacion() returns trigger
language plpgsql as $$
begin
  if new.stock_actual >= new.stock_minimo then
    new.low_active := false;
  end if;
  return new;
end $$;

create trigger products_recuperacion
  before insert or update on products
  for each row execute function products_recuperacion();

-- Registrar una entrada o salida ---------------------------------------------
-- Devuelve el stock nuevo. "for update" bloquea la fila del producto mientras
-- dura la operación: si dos personas registran una salida al mismo tiempo, la
-- segunda espera a la primera y ve el stock ya actualizado.
create function registrar_movimiento(p_producto_id bigint, p_tipo text, p_cantidad integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_producto products;
  v_nuevo integer;
begin
  if p_tipo is null or p_tipo not in ('entrada', 'salida') then
    raise exception 'El movimiento debe ser entrada o salida.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad: debe ser mayor que cero.';
  end if;

  select * into v_producto from products where id = p_producto_id for update;
  if not found then
    raise exception 'El producto ya no existe.';
  end if;

  v_nuevo := v_producto.stock_actual + case when p_tipo = 'entrada' then p_cantidad else -p_cantidad end;
  if v_nuevo < 0 then
    raise exception 'La salida supera el stock disponible; el inventario no puede quedar negativo.';
  end if;

  update products set stock_actual = v_nuevo where id = p_producto_id;
  insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo)
  values (v_producto.codigo, v_producto.nombre, p_tipo, p_cantidad, v_producto.stock_actual, v_nuevo);
  return v_nuevo;
end $$;

-- Importar la lista completa del Excel ---------------------------------------
-- Recibe una lista JSON de productos y devuelve cuántos guardó.
-- Código nuevo -> se crea. Código existente -> se actualiza.
-- Si "costo" viene vacío (Excel viejo): el nuevo queda en 0, el existente conserva el suyo.
-- Si cualquier fila rompe una regla, la función falla y no se guarda NINGUNA.
create function importar_productos(p_items jsonb)
returns integer
language plpgsql as $$
declare
  v_fila record;
  v_repetido text;
  v_total integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El archivo no contiene productos.';
  end if;

  select btrim(x.codigo) into v_repetido
  from jsonb_to_recordset(p_items) as x(codigo text)
  group by btrim(x.codigo)
  having count(*) > 1
  limit 1;
  if v_repetido is not null then
    raise exception 'codigo: ''%'' aparece más de una vez en el archivo.', v_repetido;
  end if;

  for v_fila in
    select btrim(x.codigo) as codigo, btrim(x.nombre) as nombre, btrim(x.categoria) as categoria,
           x.stock_actual, x.stock_minimo, x.costo
    from jsonb_to_recordset(p_items)
      as x(codigo text, nombre text, categoria text, stock_actual integer, stock_minimo integer, costo numeric)
  loop
    insert into products (codigo, nombre, categoria, stock_actual, stock_minimo, costo)
    values (v_fila.codigo, v_fila.nombre, v_fila.categoria, v_fila.stock_actual, v_fila.stock_minimo,
            coalesce(v_fila.costo, 0))
    on conflict (codigo) do update set
      nombre = excluded.nombre,
      categoria = excluded.categoria,
      stock_actual = excluded.stock_actual,
      stock_minimo = excluded.stock_minimo,
      costo = case when v_fila.costo is null then products.costo else excluded.costo end;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- Crear la alerta de un nuevo episodio de stock bajo -------------------------
-- La llama el bot. Devuelve el id de la alerta, o null si no hay nada nuevo.
--   1. Toma un candado: si dos revisiones llegan a la vez, la segunda espera.
--   2. Anota la hora de la revisión.
--   3. Busca productos bajos de los que todavía NO se ha avisado.
--   4. Si hay, guarda UNA alerta con el correo ya redactado y los marca como avisados.
create function crear_alerta_stock_bajo()
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_lineas text;
  v_total numeric;
  v_cantidad integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('crear_alerta_stock_bajo'));

  insert into settings (key, value)
  values ('last_check', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict (key) do update set value = excluded.value;

  select
    jsonb_agg(jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'nombre', p.nombre,
      'stock_actual', p.stock_actual, 'stock_minimo', p.stock_minimo, 'costo', p.costo,
      'faltante', p.stock_minimo - p.stock_actual,
      'costo_reponer', (p.stock_minimo - p.stock_actual) * p.costo
    ) order by lower(p.nombre), p.id),
    string_agg(format('• %s — %s: actual %s, mínimo %s. Reponer %s u. × %s = %s',
      p.codigo, p.nombre, p.stock_actual, p.stock_minimo, p.stock_minimo - p.stock_actual,
      dinero(p.costo), dinero((p.stock_minimo - p.stock_actual) * p.costo)
    ), E'\n' order by lower(p.nombre), p.id),
    sum((p.stock_minimo - p.stock_actual) * p.costo),
    count(*)
  into v_items, v_lineas, v_total, v_cantidad
  from products p
  where p.stock_actual < p.stock_minimo and not p.low_active;

  if v_cantidad = 0 then
    return null;
  end if;

  insert into alerts (items, subject, body, status)
  values (
    v_items,
    format('Alerta de inventario: %s producto(s) con stock bajo', v_cantidad),
    E'Productos por debajo del stock mínimo:\n\n'
      || v_lineas
      || E'\n\nCosto estimado para llegar al mínimo: ' || dinero(v_total)
      || E'\n\nGenerado por Control inteligente de inventario y alertas de stock.',
    'pendiente'
  )
  returning id into v_id;

  -- Solo se marcan los productos que entraron en ESTA alerta.
  update products set low_active = true
  where id in (select (e ->> 'id')::bigint from jsonb_array_elements(v_items) as e);

  return v_id;
end $$;

-- Reclamar una alerta para enviarla ------------------------------------------
-- Antes de mandar el correo, el bot "aparta" la alerta pasándola a 'enviando'.
-- Solo lo logra si estaba pendiente, con error, o atorada en 'enviando' más de
-- 5 minutos. Si dos procesos lo intentan a la vez, solo uno recibe la fila; el
-- otro recibe una lista vacía y no envía nada. Así no sale un correo doble.
create function reclamar_alerta(p_id bigint)
returns setof alerts
language sql security definer set search_path = public as $$
  update alerts
  set status = 'enviando', attempts = attempts + 1, last_attempt_at = now(), error = null
  where id = p_id
    and (status in ('pendiente', 'error')
         or (status = 'enviando' and last_attempt_at < now() - interval '5 minutes'))
  returning *;
$$;

-- Vistas ----------------------------------------------------------------------
-- Una vista es una consulta guardada con nombre. "security_invoker" hace que
-- respete los permisos de quien la consulta, igual que las tablas.

-- Resumen de la parte superior de la página. Siempre devuelve una fila.
create view resumen_inventario with (security_invoker = true) as
select
  count(*)::integer as total,
  (count(*) filter (where stock_actual < stock_minimo))::integer as bajos,
  round(coalesce(sum(stock_actual * costo), 0), 2) as valor,
  round(coalesce(sum((stock_minimo - stock_actual) * costo) filter (where stock_actual < stock_minimo), 0), 2) as reponer,
  (select value from settings where key = 'last_check') as ultima_revision
from products;

-- Consumo reciente por producto: total de salidas de los últimos 30 días y
-- fecha de la primera. Con esto la página calcula el pronóstico.
create view consumo_30d with (security_invoker = true) as
select product_code, sum(cantidad) as total, min(created_at) as primera
from movements
where tipo = 'salida' and created_at >= now() - interval '30 days'
group by product_code;
