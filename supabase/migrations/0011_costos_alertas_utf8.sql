-- Los avisos muestran la reposición hasta el mínimo; su importe debe usar
-- exactamente ese faltante. El pronóstico a 14 días queda como dato adicional.
create or replace function crear_alerta_stock_bajo()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_lineas text;
  v_total numeric;
  v_cantidad integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('crear_alerta_stock_bajo'));
  insert into settings(key, value)
  values ('last_check', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict(key) do update set value = excluded.value;

  with ponderado as (
    select p.id, sum(m.cantidad * (29 - d.day_offset))::numeric / sum(29 - d.day_offset) as diario
    from products p
    cross join generate_series(0, 27) as d(day_offset)
    left join movements m on m.product_code = p.codigo and m.tipo = 'salida' and m.motivo = 'venta'
      and (m.created_at at time zone 'UTC')::date = current_date - d.day_offset
    group by p.id
  ), forecast as (
    select p.*, coalesce(nullif(w.diario, 0), c.total::numeric / greatest(1, (current_date - c.primera::date)), 0) as diario,
      case when w.diario > 0 then 'ponderado_28d_ventas' when c.total > 0 then 'baseline30_sin_clasificar' else 'sin_historial' end as modelo
    from products p left join ponderado w on w.id = p.id
    left join consumo_30d c on c.product_code = p.codigo
  ), items as (
    select f.*, greatest(f.stock_minimo - f.stock_actual, ceil(f.diario * 14)::integer - f.stock_actual, 0) as sugerido,
      f.stock_minimo - f.stock_actual as faltante
    from forecast f where f.stock_actual < f.stock_minimo and not f.low_active
  )
  select jsonb_agg(jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'stock_actual', i.stock_actual,
      'stock_minimo', i.stock_minimo, 'costo', i.costo, 'faltante', i.faltante,
      'modelo_pronostico', i.modelo, 'demanda_diaria_esperada', round(i.diario, 2),
      'fecha_agotamiento_estimada', case when i.diario > 0 then current_date + floor(i.stock_actual / i.diario)::integer else null end,
      'cantidad_sugerida', i.sugerido, 'costo_reponer', i.faltante * i.costo,
      'costo_sugerido', i.sugerido * i.costo
    ) order by lower(i.nombre), i.id),
    string_agg(format('• %s — %s: actual %s, mínimo %s · reponer %s u. × %s = %s',
      i.codigo, i.nombre, i.stock_actual, i.stock_minimo, i.faltante,
      dinero(i.costo), dinero(i.faltante * i.costo)), E'\n' order by lower(i.nombre), i.id),
    sum(i.faltante * i.costo), count(*)
  into v_items, v_lineas, v_total, v_cantidad from items i;
  if v_cantidad = 0 then return null; end if;

  insert into alerts(items, subject, body, status)
  values(v_items, format('Alerta de inventario: %s producto(s) con stock bajo', v_cantidad),
    E'Productos por debajo del stock mínimo:\n\n' || v_lineas || E'\n\nCosto estimado para llegar al mínimo: ' || dinero(v_total)
    || E'\n\nGenerado por Control inteligente de inventario y alertas de stock.', 'pendiente')
  returning id into v_id;
  update products set low_active = true where id in (select (x->>'id')::bigint from jsonb_array_elements(v_items) x);
  return v_id;
end $$;

-- El catálogo mantiene costo de adquisición; no sustituirlo por una cotización
-- de proveedor posiblemente desactualizada al crear una orden desde la alerta.
create or replace function crear_ordenes_desde_alerta(p_alerta_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_proveedor bigint; v_orden bigint; v_creadas integer := 0;
  v_pid bigint; v_cantidad integer; v_costo numeric; v_lead integer;
  v_linea_id bigint; v_minimo numeric; v_total numeric;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then raise exception 'Permiso denegado.' using errcode = '42501'; end if;
  for v_item in select value from alerts a, jsonb_array_elements(a.items) value where a.id = p_alerta_id
  loop
    v_pid := (v_item->>'id')::bigint;
    select pp.proveedor_id, p.costo, pp.minimo_unidades, pr.lead_time_dias
      into v_proveedor, v_costo, v_cantidad, v_lead
    from products p join proveedor_productos pp on pp.product_id=p.id
      join proveedores pr on pr.id=pp.proveedor_id and pr.activo
    where p.id=v_pid order by pp.costo_unitario limit 1;
    if v_proveedor is null then continue; end if;
    select id into v_orden from ordenes_compra where alerta_id=p_alerta_id and proveedor_id=v_proveedor and estado='borrador' limit 1;
    if v_orden is null then
      insert into ordenes_compra(folio, proveedor_id, creada_por, alerta_id)
      values ('OC-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval(pg_get_serial_sequence('ordenes_compra','id'))::text, 6, '0'), v_proveedor, auth.uid(), p_alerta_id)
      returning id into v_orden;
      v_creadas := v_creadas + 1;
    end if;
    v_cantidad := greatest(coalesce((v_item->>'faltante')::integer,0),
      ceil(coalesce((v_item->>'demanda_diaria_esperada')::numeric,0)*coalesce(v_lead,7)
        + coalesce((v_item->>'stock_minimo')::integer,0)-coalesce((v_item->>'stock_actual')::integer,0))::integer,
      v_cantidad, coalesce((v_item->>'cantidad_sugerida')::integer,1));
    insert into orden_lineas(orden_id, product_id, cantidad, costo_unitario)
    values(v_orden,v_pid,v_cantidad,v_costo)
    on conflict(orden_id,product_id) do update set cantidad=greatest(orden_lineas.cantidad,excluded.cantidad),
      costo_unitario=excluded.costo_unitario;
    v_proveedor := null;
  end loop;
  for v_orden in select id from ordenes_compra where alerta_id=p_alerta_id and estado='borrador' loop
    select p.minimo_compra, coalesce(sum(l.cantidad*l.costo_unitario),0) into v_minimo,v_total
      from ordenes_compra o join proveedores p on p.id=o.proveedor_id left join orden_lineas l on l.orden_id=o.id
      where o.id=v_orden group by p.minimo_compra;
    if v_total < v_minimo then
      select id,costo_unitario into v_linea_id,v_costo from orden_lineas
        where orden_id=v_orden and costo_unitario>0 order by costo_unitario desc limit 1;
      if v_linea_id is null then raise exception 'No se puede cumplir la compra mínima: faltan costos unitarios.'; end if;
      update orden_lineas set cantidad=cantidad+ceil((v_minimo-v_total)/v_costo)::integer where id=v_linea_id;
    end if;
  end loop;
  return v_creadas;
end $$;

-- products.costo es el costo unitario de adquisición del catálogo. Mantener las
-- órdenes existentes y sus correos alineados; las cotizaciones de proveedor
-- quedan como referencia, pero no alteran el costo contabilizado del producto.
update orden_lineas l set costo_unitario=p.costo
from products p where p.id=l.product_id and l.costo_unitario is distinct from p.costo;

with detalles as (
  select a.id, o.id as orden_id, pr.nombre as proveedor,
    jsonb_agg(jsonb_build_object('codigo',p.codigo,'nombre',p.nombre,'cantidad',l.cantidad,
      'costo_unitario',l.costo_unitario,'subtotal',l.cantidad*l.costo_unitario) order by p.nombre) as items,
    string_agg(format('• %s — %s: %s u. × %s = %s',p.codigo,p.nombre,l.cantidad,
      dinero(l.costo_unitario),dinero(l.cantidad*l.costo_unitario)),E'\n' order by p.nombre) as lineas
  from alerts a join ordenes_compra o on o.id=a.orden_id
    join proveedores pr on pr.id=o.proveedor_id
    join orden_lineas l on l.orden_id=o.id join products p on p.id=l.product_id
  where a.tipo='orden_compra' group by a.id,o.id,pr.nombre
)
update alerts a set items=d.items,
  body=format('Hola %s,\n\nSolicitamos confirmar la siguiente orden:\n%s\n\nGracias.',d.proveedor,d.lineas)
from detalles d where d.id=a.id;

-- Reparar acentos conocidos en snapshots demo guardados como texto.
update products set nombre=replace(replace(replace(nombre,'Bol?grafo','Bolígrafo'),'b?sica','básica'),'tama?o','tamaño'),
  categoria=replace(replace(replace(categoria,'Bol?grafo','Bolígrafo'),'b?sica','básica'),'tama?o','tamaño')
where nombre like '%?%' or categoria like '%?%';
update movements set product_name=replace(replace(replace(product_name,'Bol?grafo','Bolígrafo'),'b?sica','básica'),'tama?o','tamaño')
where product_name like '%?%';
update alerts set body=replace(replace(replace(body,'Bol?grafo','Bolígrafo'),'b?sica','básica'),'tama?o','tamaño'),
  items=replace(replace(replace(items::text,'Bol?grafo','Bolígrafo'),'b?sica','básica'),'tama?o','tamaño')::jsonb
where body like '%?%' or items::text like '%?%';

-- Corrige también los importes de reposición guardados en alertas históricas.
with lineas as (
  select a.id, x.item,
    coalesce((x.item->>'faltante')::numeric,
      (x.item->>'stock_minimo')::numeric - (x.item->>'stock_actual')::numeric) as faltante,
    coalesce((x.item->>'costo')::numeric,0) as costo
  from alerts a cross join lateral jsonb_array_elements(
    case when jsonb_typeof(a.items)='array' then a.items else '[]'::jsonb end
  ) x(item)
  where a.tipo='stock_bajo' and jsonb_typeof(a.items)='array'
), corregidas as (
  select id,
    jsonb_agg(jsonb_set(jsonb_set(item,'{faltante}',to_jsonb(faltante)),
      '{costo_reponer}',to_jsonb(faltante*costo)) order by item->>'nombre') as items,
    string_agg(format('• %s — %s: actual %s, mínimo %s · reponer %s u. × %s = %s',
      item->>'codigo',item->>'nombre',item->>'stock_actual',item->>'stock_minimo',
      faltante,dinero(costo),dinero(faltante*costo)),E'\n' order by item->>'nombre') as detalle,
    sum(faltante*costo) as total
  from lineas group by id
)
update alerts a set items=c.items,
  body=E'Productos por debajo del stock mínimo:\n\n'||c.detalle
    ||E'\n\nCosto estimado para llegar al mínimo: '||dinero(c.total)
    ||E'\n\nGenerado por Control inteligente de inventario y alertas de stock.'
from corregidas c where c.id=a.id;
