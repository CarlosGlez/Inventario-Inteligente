-- 0003 · Seguridad: quién puede hacer qué
--
-- Supabase tiene tres "roles" (tipos de visitante):
--   anon           alguien SIN sesión iniciada
--   authenticated  alguien CON sesión iniciada (el equipo)
--   service_role   el bot (la Edge Function). Tiene llave maestra.
--
-- Hay dos candados, uno encima del otro:
--   1. Permisos (GRANT/REVOKE): qué operaciones puede intentar cada rol.
--   2. RLS (Row Level Security): qué FILAS puede ver o tocar cada rol.
--
-- Resultado:
--   tabla       con sesión                      bot
--   products    leer, crear, editar, eliminar   todo
--   movements   solo leer                       todo
--   alerts      solo leer                       todo
--   settings    solo leer                       todo
--   sin sesión: nada.

-- 1. Activar RLS. Con RLS activo y sin políticas, nadie ve ninguna fila.
alter table products  enable row level security;
alter table movements enable row level security;
alter table alerts    enable row level security;
alter table settings  enable row level security;

-- 2. Empezar de cero: Supabase da permisos por defecto a anon y authenticated
--    sobre todo lo que se crea. Se quitan todos y después se da solo lo necesario.
revoke all on table products, movements, alerts, settings, resumen_inventario, consumo_30d
  from public, anon, authenticated;
revoke all on function registrar_movimiento(bigint, text, integer) from public, anon, authenticated;
revoke all on function importar_productos(jsonb)                   from public, anon, authenticated;
revoke all on function crear_alerta_stock_bajo()                   from public, anon, authenticated;
revoke all on function reclamar_alerta(bigint)                     from public, anon, authenticated;

-- 3. Permisos del usuario con sesión.
grant select, insert, update, delete on table products to authenticated;
grant select on table movements, alerts, settings, resumen_inventario, consumo_30d to authenticated;
grant execute on function registrar_movimiento(bigint, text, integer) to authenticated;
grant execute on function importar_productos(jsonb) to authenticated;

-- 4. Permisos del bot.
grant all on table products, movements, alerts, settings to service_role;
grant select on table resumen_inventario, consumo_30d to service_role;
grant execute on function registrar_movimiento(bigint, text, integer) to service_role;
grant execute on function importar_productos(jsonb) to service_role;
grant execute on function crear_alerta_stock_bajo() to service_role;
grant execute on function reclamar_alerta(bigint) to service_role;

-- 5. Políticas RLS: qué filas ve el usuario con sesión. "using (true)" = todas.
--    No hay política para anon, así que sin sesión no se ve ninguna fila.
create policy "con sesion: leer productos"     on products for select to authenticated using (true);
create policy "con sesion: crear productos"    on products for insert to authenticated with check (true);
create policy "con sesion: editar productos"   on products for update to authenticated using (true) with check (true);
create policy "con sesion: eliminar productos" on products for delete to authenticated using (true);

create policy "con sesion: leer movimientos" on movements for select to authenticated using (true);
create policy "con sesion: leer alertas"     on alerts    for select to authenticated using (true);
create policy "con sesion: leer ajustes"     on settings  for select to authenticated using (true);

-- Los movimientos se escriben solo con registrar_movimiento(), y las alertas
-- solo con las funciones del bot. Esas funciones son "security definer":
-- corren con los permisos de quien las creó, no de quien las llama.
