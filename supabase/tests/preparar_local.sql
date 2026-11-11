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

-- Suficiente para probar las referencias a auth.users fuera de Supabase.
-- En un proyecto Supabase estos objetos ya existen y no se reemplazan.
do $$
begin
  if to_regclass('auth.users') is null then
    execute 'create schema if not exists auth';
    execute 'create table auth.users (id uuid primary key, email text unique)';
  end if;
  if to_regprocedure('auth.uid()') is null then
    execute $fn$create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'$fn$;
  end if;
end $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase da permisos amplios por defecto a estos roles sobre todo lo que se
-- crea en "public". Se imita aquí para que las pruebas de seguridad sean
-- realistas: la migración 0003 tiene que QUITAR lo que sobra.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
