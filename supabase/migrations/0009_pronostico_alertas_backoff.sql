-- 0009 · Las alertas incorporan el pronóstico de venta y respetan backoff.
create or replace function reclamar_alerta(p_id bigint)
returns setof alerts language sql security definer set search_path = public as $$
  update alerts
  set status = 'enviando', attempts = attempts + 1, last_attempt_at = now(), error = null
  where id = p_id and (
    status = 'pendiente'
    or (status = 'error' and coalesce(last_attempt_at, created_at) < now() - make_interval(mins => least(60, power(2, least(attempts, 6))::integer)))
    or (status = 'enviando' and last_attempt_at < now() - interval '5 minutes')
  ) returning *;
$$;

-- El scheduler toma la media ponderada de ventas identificadas. Si aún no hay
-- ventas clasificadas, degrada al consumo heredado de 30 días. La regla de
-- activación (stock bajo) sigue intacta; cambia la recomendación y su contexto.
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
  insert into settings(key, value) values ('last_check', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
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
    select f.*, greatest(f.stock_minimo - f.stock_actual, ceil(f.diario * 14)::integer - f.stock_actual, 0) as sugerido
    from forecast f where f.stock_actual < f.stock_minimo and not f.low_active
  )
  select jsonb_agg(jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'stock_actual', i.stock_actual,
      'stock_minimo', i.stock_minimo, 'costo', i.costo, 'faltante', i.stock_minimo-i.stock_actual,
      'modelo_pronostico', i.modelo, 'demanda_diaria_esperada', round(i.diario, 2),
      'fecha_agotamiento_estimada', case when i.diario > 0 then current_date + floor(i.stock_actual / i.diario)::integer else null end,
      'cantidad_sugerida', i.sugerido, 'costo_reponer', i.sugerido * i.costo
    ) order by lower(i.nombre), i.id),
    string_agg(format('• %s — %s: stock %s, demanda estimada %s u./día, sugerencia %s u. (%s)',
      i.codigo, i.nombre, i.stock_actual, round(i.diario,2), i.sugerido, dinero(i.sugerido*i.costo)), E'\n' order by lower(i.nombre), i.id),
    sum(i.sugerido*i.costo), count(*)
  into v_items, v_lineas, v_total, v_cantidad from items i;
  if v_cantidad = 0 then return null; end if;

  insert into alerts(items, subject, body, status)
  values(v_items, format('Alerta de inventario: %s producto(s) con stock bajo', v_cantidad),
    E'Productos por debajo del stock mínimo:\n\n' || v_lineas || E'\n\nCosto sugerido de reposición: ' || dinero(v_total)
    || E'\n\nEl modelo y fecha estimada son orientativos; revise existencias y proveedor antes de comprar.', 'pendiente')
  returning id into v_id;
  update products set low_active = true where id in (select (x->>'id')::bigint from jsonb_array_elements(v_items) x);
  return v_id;
end $$;
