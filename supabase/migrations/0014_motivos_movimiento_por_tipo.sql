-- Permite motivos de entrada y salida adecuados a su sentido.
-- Conserva los motivos históricos para no reinterpretar el historial.
alter table movements drop constraint if exists movements_motivo_tipo_check;
alter table movements add constraint movements_motivo_tipo_check
  check (
    (tipo = 'entrada' and motivo in ('sin_clasificar', 'compra', 'devolucion', 'ajuste', 'otro'))
    or (tipo = 'salida' and motivo in ('sin_clasificar', 'venta', 'merma', 'ajuste', 'otro'))
  );

create or replace function registrar_movimiento(p_producto_id bigint, p_tipo text, p_cantidad integer, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_producto products;
  v_nuevo integer;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','almacen']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('entrada', 'salida') then
    raise exception 'El movimiento debe ser entrada o salida.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad: debe ser mayor que cero.';
  end if;
  if p_motivo is null or p_motivo not in ('sin_clasificar', 'compra', 'devolucion', 'venta', 'merma', 'ajuste', 'otro') then
    raise exception 'El motivo del movimiento no es válido.';
  end if;
  if p_tipo = 'entrada' and p_motivo not in ('sin_clasificar', 'compra', 'devolucion', 'ajuste', 'otro') then
    raise exception 'El motivo no corresponde a una entrada.';
  end if;
  if p_tipo = 'salida' and p_motivo not in ('sin_clasificar', 'venta', 'merma', 'ajuste', 'otro') then
    raise exception 'El motivo no corresponde a una salida.';
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

grant execute on function registrar_movimiento(bigint, text, integer, text) to authenticated, service_role;
