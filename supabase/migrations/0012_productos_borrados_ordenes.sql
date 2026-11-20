-- Conserva los datos visibles de una línea de compra aunque se elimine
-- el producto del catálogo.
alter table orden_lineas add column product_code text;
alter table orden_lineas add column product_name text;

update orden_lineas l set
  product_code = p.codigo,
  product_name = p.nombre
from products p
where p.id = l.product_id;

alter table orden_lineas alter column product_code set not null;
alter table orden_lineas alter column product_name set not null;
alter table orden_lineas alter column product_id drop not null;
alter table orden_lineas drop constraint orden_lineas_product_id_fkey;
alter table orden_lineas add constraint orden_lineas_product_id_fkey
  foreign key (product_id) references products(id) on delete set null;

create function guardar_snapshot_producto_orden_linea() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op='INSERT' then
    if new.product_id is not null then
      select codigo,nombre into new.product_code,new.product_name
      from products where id=new.product_id;
    end if;
  elsif new.product_id is distinct from old.product_id and new.product_id is not null then
    select codigo,nombre into new.product_code,new.product_name
    from products where id=new.product_id;
  end if;
  return new;
end $$;
create trigger orden_lineas_snapshot_producto
before insert or update of product_id on orden_lineas
for each row execute function guardar_snapshot_producto_orden_linea();

-- Los correos de borradores todavía no preparados también usan el snapshot.
create or replace function preparar_correo_orden(p_orden_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orden ordenes_compra;
  v_proveedor proveedores;
  v_items jsonb;
  v_lineas text;
  v_id bigint;
  v_asunto text;
  v_body text;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  select * into v_orden from ordenes_compra where id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_orden.email_alert_id is not null then
    return jsonb_build_object('alert_id',v_orden.email_alert_id,'reutilizada',true);
  end if;
  if v_orden.estado <> 'borrador' then raise exception 'Solo se pueden enviar borradores.'; end if;
  select * into v_proveedor from proveedores where id=v_orden.proveedor_id and activo;
  if not found then raise exception 'El proveedor no existe o está inactivo.'; end if;
  select jsonb_agg(jsonb_build_object(
      'codigo',coalesce(l.product_code,p.codigo),'nombre',coalesce(l.product_name,p.nombre),
      'cantidad',l.cantidad,'costo_unitario',l.costo_unitario,'subtotal',l.cantidad*l.costo_unitario
    ) order by coalesce(l.product_name,p.nombre)),
    string_agg(format('• %s — %s: %s u. × %s = %s',
      coalesce(l.product_code,p.codigo),coalesce(l.product_name,p.nombre),l.cantidad,
      dinero(l.costo_unitario),dinero(l.cantidad*l.costo_unitario)),
      E'\n' order by coalesce(l.product_name,p.nombre))
  into v_items,v_lineas
  from orden_lineas l left join products p on p.id=l.product_id
  where l.orden_id=p_orden_id;
  if v_items is null then raise exception 'La orden no tiene líneas.'; end if;
  v_asunto := format('Orden de compra %s',v_orden.folio);
  v_body := format('Hola %s,\n\nSolicitamos confirmar la siguiente orden:\n%s\n\nGracias.',
    v_proveedor.nombre,coalesce(v_lineas,'Sin líneas.'));
  insert into alerts(tipo,orden_id,proveedor_id,recipient,items,subject,body,status,delivery_status)
    values('orden_compra',p_orden_id,v_proveedor.id,v_proveedor.correo,v_items,v_asunto,v_body,'pendiente','pendiente')
    returning id into v_id;
  update ordenes_compra set email_alert_id=v_id where id=p_orden_id;
  return jsonb_build_object('alert_id',v_id,'reutilizada',false,'recipient',v_proveedor.correo);
end $$;
grant execute on function preparar_correo_orden(bigint) to authenticated, service_role;

-- Si se vuelve a registrar el mismo código, permite completar la orden usando
-- el producto nuevo. Si no existe, explica por qué no se puede recibir.
create or replace function recibir_linea_orden(p_linea_id bigint, p_cantidad integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_linea orden_lineas;
  v_producto_id bigint;
  v_stock integer;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','almacen']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'cantidad: debe ser mayor que cero.'; end if;
  select * into v_linea from orden_lineas where id=p_linea_id for update;
  if not found then raise exception 'La línea de la orden no existe.'; end if;
  if v_linea.recibida + p_cantidad > v_linea.cantidad then
    raise exception 'La recepción supera las unidades pendientes.';
  end if;
  if exists(select 1 from ordenes_compra where id=v_linea.orden_id and estado='cancelada') then
    raise exception 'La orden está cancelada.';
  end if;
  v_producto_id := v_linea.product_id;
  if v_producto_id is null then
    select id into v_producto_id from products where codigo=v_linea.product_code;
    if v_producto_id is null then
      raise exception 'El producto % fue eliminado. Regístralo de nuevo con el mismo código antes de recibir la orden.',v_linea.product_code;
    end if;
    update orden_lineas set product_id=v_producto_id where id=p_linea_id;
  end if;
  v_stock := registrar_movimiento(v_producto_id,'entrada',p_cantidad,'otro');
  update orden_lineas set recibida=recibida+p_cantidad where id=p_linea_id;
  update ordenes_compra o set
    estado=case when not exists(select 1 from orden_lineas l where l.orden_id=o.id and l.recibida<l.cantidad)
      then 'recibida' else 'recibida parcial' end,
    received_at=case when not exists(select 1 from orden_lineas l where l.orden_id=o.id and l.recibida<l.cantidad)
      then now() else null end
  where o.id=v_linea.orden_id;
  return v_stock;
end $$;
grant execute on function recibir_linea_orden(bigint,integer) to authenticated, service_role;
