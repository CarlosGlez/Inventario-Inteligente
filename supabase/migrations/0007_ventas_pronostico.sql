-- 0007 · Motivo de movimiento y origen de ventas para pronóstico.
-- Historial existente conserva su semántica: no se convierte silenciosamente
-- una salida antigua en venta.
alter table movements
  add column motivo text not null default 'sin_clasificar'
  check (motivo in ('sin_clasificar', 'venta', 'merma', 'ajuste', 'devolucion', 'otro'));
alter table movements add constraint movements_motivo_tipo_check
  check ((tipo = 'salida' and motivo <> 'devolucion') or (tipo = 'entrada' and motivo in ('sin_clasificar','otro')));

create index movements_ventas_fecha_producto
  on movements (created_at, product_code) where tipo = 'salida' and motivo = 'venta';

-- Sobrecarga compatible: el RPC de tres argumentos sigue disponible para
-- clientes heredados; la versión nueva permite clasificar las salidas.
create function registrar_movimiento(p_producto_id bigint, p_tipo text, p_cantidad integer, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_producto products;
  v_nuevo integer;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','almacen']) then raise exception 'Permiso denegado.' using errcode = '42501'; end if;
  if p_tipo is null or p_tipo not in ('entrada', 'salida') then
    raise exception 'El movimiento debe ser entrada o salida.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad: debe ser mayor que cero.';
  end if;
  if p_motivo is null or p_motivo not in ('sin_clasificar', 'venta', 'merma', 'ajuste', 'devolucion', 'otro') then
    raise exception 'El motivo del movimiento no es válido.';
  end if;
  if p_tipo = 'entrada' and p_motivo <> 'otro' then
    raise exception 'Las entradas deben usar el motivo otro.';
  end if;
  if p_tipo = 'salida' and p_motivo = 'devolucion' then
    raise exception 'Una devolución debe registrarse como entrada.';
  end if;

  select * into v_producto from products where id = p_producto_id for update;
  if not found then raise exception 'El producto ya no existe.'; end if;
  v_nuevo := v_producto.stock_actual + case when p_tipo = 'entrada' then p_cantidad else -p_cantidad end;
  if v_nuevo < 0 then raise exception 'La salida supera el stock disponible; el inventario no puede quedar negativo.'; end if;
  update products set stock_actual = v_nuevo where id = p_producto_id;
  insert into movements (product_code, product_name, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
  values (v_producto.codigo, v_producto.nombre, p_tipo, p_cantidad, v_producto.stock_actual, v_nuevo, p_motivo);
  return v_nuevo;
end $$;

create view ventas_diarias_365d with (security_invoker = true) as
select product_code, (created_at at time zone 'UTC')::date as fecha, sum(cantidad)::integer as cantidad
from movements
where tipo = 'salida' and motivo = 'venta' and created_at >= now() - interval '365 days'
group by product_code, (created_at at time zone 'UTC')::date;

grant select on ventas_diarias_365d to authenticated, service_role;
grant execute on function registrar_movimiento(bigint, text, integer, text) to authenticated, service_role;
