-- 0004 · Programar el bot
--
-- pg_cron es un "reloj" dentro de Postgres: ejecuta una instrucción cada cierto
-- tiempo. pg_net le permite a Postgres hacer llamadas HTTP. Juntos llaman a la
-- Edge Function cada minuto, aunque nadie tenga la página abierta.
--
-- ANTES de correr este archivo:
--   1. Despliega la función "revisar-inventario" y configura sus secrets.
--   2. Guarda en Vault la dirección del proyecto y el secreto del cron
--      (cambia los dos valores; el secreto debe ser igual al secret CRON_SECRET
--      de la función):
--
--        select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
--        select vault.create_secret('EL-MISMO-VALOR-QUE-CRON_SECRET', 'cron_secret');
--
-- Vault guarda esos valores cifrados, así no quedan escritos en este archivo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Si la tarea ya existía, se quita para poder correr este archivo otra vez.
select cron.unschedule('revisar-inventario')
where exists (select 1 from cron.job where jobname = 'revisar-inventario');

-- '* * * * *' significa "cada minuto".
select cron.schedule(
  'revisar-inventario',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/revisar-inventario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Comandos útiles (quita los guiones para usarlos) ---------------------------
--
-- Ver la tarea programada:
--   select jobname, schedule, active from cron.job;
--
-- Ver las últimas ejecuciones y si fallaron:
--   select start_time, status, return_message from cron.job_run_details order by start_time desc limit 10;
--
-- Ver la respuesta de la función (200 = bien, 401 = el secreto no coincide):
--   select created, status_code, content from net._http_response order by created desc limit 10;
--
-- Cambiar el intervalo a cada 5 minutos:
--   select cron.alter_job((select jobid from cron.job where jobname = 'revisar-inventario'), schedule := '*/5 * * * *');
--
-- Pausar el bot:
--   select cron.alter_job((select jobid from cron.job where jobname = 'revisar-inventario'), active := false);
--
-- Reanudar el bot:
--   select cron.alter_job((select jobid from cron.job where jobname = 'revisar-inventario'), active := true);
--
-- Quitar el bot:
--   select cron.unschedule('revisar-inventario');
--
-- Limpiar el registro de ejecuciones (crece unas 1440 filas por día):
--   delete from cron.job_run_details where end_time < now() - interval '7 days';
