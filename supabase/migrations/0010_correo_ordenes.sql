-- 0010 · Notificación al proveedor con idempotencia por orden.
alter table alerts drop constraint if exists alerts_tipo_check;
alter table alerts add constraint alerts_tipo_check check (tipo in ('stock_bajo','reporte_semanal','orden_compra','prueba_correo'));
alter table alerts add column orden_id bigint references ordenes_compra(id) on delete set null;
create unique index alerts_orden_email_unico on alerts (orden_id) where orden_id is not null;
alter table ordenes_compra add column email_alert_id bigint references alerts(id) on delete set null;

create function preparar_correo_orden(p_orden_id bigint) returns jsonb
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
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then raise exception 'Permiso denegado.' using errcode = '42501'; end if;
  select * into v_orden from ordenes_compra where id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_orden.email_alert_id is not null then
    return jsonb_build_object('alert_id',v_orden.email_alert_id,'reutilizada',true);
  end if;
  if v_orden.estado <> 'borrador' then raise exception 'Solo se pueden enviar borradores.'; end if;
  select * into v_proveedor from proveedores where id=v_orden.proveedor_id and activo;
  if not found then raise exception 'El proveedor no existe o está inactivo.'; end if;
  select jsonb_agg(jsonb_build_object('codigo',p.codigo,'nombre',p.nombre,'cantidad',l.cantidad,
      'costo_unitario',l.costo_unitario,'subtotal',l.cantidad*l.costo_unitario) order by p.nombre),
    string_agg(format('• %s — %s: %s u. × %s = %s',p.codigo,p.nombre,l.cantidad,dinero(l.costo_unitario),dinero(l.cantidad*l.costo_unitario)),E'\n' order by p.nombre)
  into v_items,v_lineas from orden_lineas l join products p on p.id=l.product_id where l.orden_id=p_orden_id;
  if v_items is null then raise exception 'La orden no tiene líneas.'; end if;
  v_asunto := format('Orden de compra %s',v_orden.folio);
  v_body := format('Hola %s,\n\nSolicitamos confirmar la siguiente orden:\n%s\n\nGracias.',v_proveedor.nombre,coalesce(v_lineas,'Sin líneas.'));
  insert into alerts(tipo,orden_id,proveedor_id,recipient,items,subject,body,status,delivery_status)
    values('orden_compra',p_orden_id,v_proveedor.id,v_proveedor.correo,coalesce(v_items,'[]'::jsonb),v_asunto,v_body,'pendiente','pendiente')
    returning id into v_id;
  update ordenes_compra set email_alert_id=v_id where id=p_orden_id;
  return jsonb_build_object('alert_id',v_id,'reutilizada',false,'recipient',v_proveedor.correo);
end $$;
grant execute on function preparar_correo_orden(bigint) to authenticated, service_role;
