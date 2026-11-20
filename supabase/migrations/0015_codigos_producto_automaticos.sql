-- Los productos nuevos reciben un código secuencial administrado por la base.
-- Los códigos existentes se conservan para no romper movimientos y órdenes históricas.
create sequence product_codigo_seq;

do $$
declare
  v_siguiente bigint;
begin
  select greatest(
    (select count(*) from products),
    coalesce((select max(substring(codigo from '^PROD-([0-9]+)$')::bigint) from products), 0)
  ) + 1 into v_siguiente;
  perform setval('public.product_codigo_seq', v_siguiente, false);
end $$;

create function asignar_codigo_producto()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_numero bigint;
begin
  v_numero := nextval('public.product_codigo_seq');
  new.codigo := 'PROD-' || case when v_numero < 1000000
    then lpad(v_numero::text, 6, '0') else v_numero::text end;
  return new;
end $$;

create trigger products_codigo_automatico_insert
before insert on products
for each row execute function asignar_codigo_producto();

create function impedir_cambio_codigo_producto()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'El código del producto es automático y no se puede modificar.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger products_codigo_inmutable_update
before update of codigo on products
for each row execute function impedir_cambio_codigo_producto();

-- En las importaciones, un código conocido identifica la fila que se actualizará.
-- Un código desconocido no se conserva: el trigger asigna uno nuevo automáticamente.
create or replace function importar_productos(p_items jsonb)
returns integer
language plpgsql as $$
declare
  v_fila record;
  v_repetido text;
  v_producto_id bigint;
  v_total integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El archivo no contiene productos.';
  end if;

  select nullif(btrim(x.codigo), '') into v_repetido
  from jsonb_to_recordset(p_items) as x(codigo text)
  where nullif(btrim(x.codigo), '') is not null
  group by nullif(btrim(x.codigo), '')
  having count(*) > 1
  limit 1;
  if v_repetido is not null then
    raise exception 'codigo: ''%'' aparece más de una vez en el archivo.', v_repetido;
  end if;

  for v_fila in
    select nullif(btrim(x.codigo), '') as codigo, btrim(x.nombre) as nombre, btrim(x.categoria) as categoria,
           x.stock_actual, x.stock_minimo, x.costo
    from jsonb_to_recordset(p_items)
      as x(codigo text, nombre text, categoria text, stock_actual integer, stock_minimo integer, costo numeric)
  loop
    select id into v_producto_id from products where codigo = v_fila.codigo;
    if found then
      update products set nombre = v_fila.nombre, categoria = v_fila.categoria,
        stock_actual = v_fila.stock_actual, stock_minimo = v_fila.stock_minimo,
        costo = coalesce(v_fila.costo, costo)
      where id = v_producto_id;
    else
      insert into products (nombre, categoria, stock_actual, stock_minimo, costo)
      values (v_fila.nombre, v_fila.categoria, v_fila.stock_actual, v_fila.stock_minimo,
              coalesce(v_fila.costo, 0));
    end if;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
