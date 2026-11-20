-- Deja de aumentar las líneas para alcanzar minimo_compra del proveedor.
-- Conserva el mínimo de unidades configurado por producto y proveedor.
create or replace function crear_ordenes_desde_alerta(p_alerta_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_proveedor bigint;
  v_orden bigint;
  v_creadas integer := 0;
  v_pid bigint;
  v_cantidad integer;
  v_costo numeric;
  v_lead integer;
begin
  if auth.uid() is not null and not tiene_rol(array['admin','compras']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;

  for v_item in
    select value from alerts a, jsonb_array_elements(a.items) value where a.id = p_alerta_id
  loop
    v_pid := (v_item->>'id')::bigint;
    select pp.proveedor_id, p.costo, pp.minimo_unidades, pr.lead_time_dias
      into v_proveedor, v_costo, v_cantidad, v_lead
    from products p
    join proveedor_productos pp on pp.product_id = p.id
    join proveedores pr on pr.id = pp.proveedor_id and pr.activo
    where p.id = v_pid
    order by pp.costo_unitario
    limit 1;
    if v_proveedor is null then continue; end if;

    select id into v_orden from ordenes_compra
    where alerta_id = p_alerta_id and proveedor_id = v_proveedor and estado = 'borrador'
    limit 1;
    if v_orden is null then
      insert into ordenes_compra(folio, proveedor_id, creada_por, alerta_id)
      values (
        'OC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval(pg_get_serial_sequence('ordenes_compra', 'id'))::text, 6, '0'),
        v_proveedor, auth.uid(), p_alerta_id
      ) returning id into v_orden;
      v_creadas := v_creadas + 1;
    end if;

    v_cantidad := greatest(
      coalesce((v_item->>'faltante')::integer, 0),
      ceil(
        coalesce((v_item->>'demanda_diaria_esperada')::numeric, 0) * coalesce(v_lead, 7)
        + coalesce((v_item->>'stock_minimo')::integer, 0)
        - coalesce((v_item->>'stock_actual')::integer, 0)
      )::integer,
      v_cantidad,
      coalesce((v_item->>'cantidad_sugerida')::integer, 1)
    );
    insert into orden_lineas(orden_id, product_id, cantidad, costo_unitario)
    values (v_orden, v_pid, v_cantidad, coalesce(v_costo, (v_item->>'costo')::numeric, 0))
    on conflict (orden_id, product_id) do update
      set cantidad = greatest(orden_lineas.cantidad, excluded.cantidad);
    v_proveedor := null;
  end loop;
  return v_creadas;
end $$;

grant execute on function crear_ordenes_desde_alerta(bigint) to authenticated, service_role;
