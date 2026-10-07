-- 0005 · Reporte semanal
--
-- El historial (tabla alerts) ahora guarda dos tipos de correo:
--   'stock_bajo'       el aviso de siempre, cuando un producto cae bajo su mínimo
--   'reporte_semanal'  un resumen de todo el inventario y sus movimientos
--
-- Al usar la misma tabla, el reporte hereda lo que ya funciona para las
-- alertas: los estados (pendiente, enviado, simulado, error), el reclamo que
-- evita correos dobles y el botón "Reintentar envío".
--
-- Las alertas que ya existían quedan como 'stock_bajo' automáticamente.

alter table alerts
  add column tipo text not null default 'stock_bajo'
  check (tipo in ('stock_bajo', 'reporte_semanal'));

-- Crear el reporte semanal --------------------------------------------------
-- La llama el bot. Toma una "foto" del inventario en este momento y de los
-- movimientos de los últimos 7 días, la guarda en el historial y devuelve su id.
-- El correo con tablas se arma después, a partir de esa foto.
--
-- Las fechas del asunto se escriben en la hora del centro de México.
create function crear_reporte_semanal()
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_zona constant text := 'America/Mexico_City';
  v_hasta timestamptz := now();
  v_desde timestamptz := now() - interval '7 days';
  v_resumen resumen_inventario;
  v_productos jsonb;
  v_movimientos jsonb;
  v_cuantos integer;
  v_entradas bigint;
  v_salidas bigint;
  v_bajos text;
  v_periodo text;
  v_id bigint;
begin
  select * into v_resumen from resumen_inventario;

  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', p.codigo, 'nombre', p.nombre, 'categoria', p.categoria,
           'stock_actual', p.stock_actual, 'stock_minimo', p.stock_minimo,
           'costo', p.costo, 'valor', p.stock_actual * p.costo,
           'bajo', p.stock_actual < p.stock_minimo
         ) order by lower(p.nombre), p.id), '[]'::jsonb),
         string_agg(format('• %s — %s: actual %s, mínimo %s', p.codigo, p.nombre, p.stock_actual, p.stock_minimo),
                    E'\n' order by lower(p.nombre), p.id) filter (where p.stock_actual < p.stock_minimo)
  into v_productos, v_bajos
  from products p;

  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', m.created_at, 'codigo', m.product_code, 'nombre', m.product_name,
           'tipo', m.tipo, 'cantidad', m.cantidad,
           'stock_anterior', m.stock_anterior, 'stock_nuevo', m.stock_nuevo
         ) order by m.created_at desc, m.id desc), '[]'::jsonb),
         count(*),
         coalesce(sum(m.cantidad) filter (where m.tipo = 'entrada'), 0),
         coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0)
  into v_movimientos, v_cuantos, v_entradas, v_salidas
  from movements m
  where m.created_at >= v_desde;

  v_periodo := to_char(v_desde at time zone v_zona, 'DD/MM/YYYY')
               || ' al ' || to_char(v_hasta at time zone v_zona, 'DD/MM/YYYY');

  insert into alerts (tipo, items, subject, body, status)
  values (
    'reporte_semanal',
    jsonb_build_object(
      'desde', v_desde, 'hasta', v_hasta,
      'resumen', jsonb_build_object('total', v_resumen.total, 'bajos', v_resumen.bajos,
                                    'valor', v_resumen.valor, 'reponer', v_resumen.reponer),
      'productos', v_productos,
      'movimientos', v_movimientos,
      'entradas', v_entradas, 'salidas', v_salidas
    ),
    'Reporte semanal de inventario: ' || v_periodo,
    -- Versión de texto, para los lectores de correo que no muestran tablas.
    E'Reporte semanal de inventario\nPeriodo: ' || v_periodo
      || E'\n\nProductos: ' || v_resumen.total
      || E'\nCon stock bajo: ' || v_resumen.bajos
      || E'\nValor del inventario: ' || dinero(v_resumen.valor)
      || E'\nCosto de reponer al mínimo: ' || dinero(v_resumen.reponer)
      || E'\n\nMovimientos de la semana: ' || v_cuantos
      || ' (entradas: ' || v_entradas || ' u., salidas: ' || v_salidas || ' u.)'
      || E'\n\n' || coalesce(E'Productos con stock bajo:\n' || v_bajos, 'Ningún producto está por debajo de su mínimo.')
      || E'\n\nGenerado por Control inteligente de inventario y alertas de stock.',
    'pendiente'
  )
  returning id into v_id;

  return v_id;
end $$;

-- Solo el bot puede crear reportes (igual que las alertas).
revoke all on function crear_reporte_semanal() from public, anon, authenticated;
grant execute on function crear_reporte_semanal() to service_role;
