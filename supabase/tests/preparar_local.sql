-- Solo para probar en un Postgres normal (fuera de Supabase).
-- Supabase ya trae estos tres roles; aquí se crean si no existen.
--   anon          = visitante sin sesión
--   authenticated = usuario con sesión iniciada
--   service_role  = el bot (Edge Function); se salta RLS
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase da permisos amplios por defecto a estos roles sobre todo lo que se
-- crea en "public". Se imita aquí para que las pruebas de seguridad sean
-- realistas: la migración 0003 tiene que QUITAR lo que sobra.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
