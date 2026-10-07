-- 0006 · Programar el reporte semanal
--
-- Un segundo reloj de pg_cron llama a la misma Edge Function una vez por
-- semana, pidiéndole la acción "reporte". Usa los mismos dos valores de Vault
-- que el reloj de las alertas (project_url y cron_secret); no hay que crear nada nuevo.
--
-- ANTES de correr este archivo:
--   1. Corre 0005_reporte_semanal.sql.
--   2. Vuelve a desplegar la función: npx supabase functions deploy revisar-inventario
--
-- Horario: pg_cron trabaja en hora UTC. El centro de México está 6 horas atrás
-- todo el año, así que las 8:00 am del lunes son las 14:00 UTC del lunes.
--   '0 14 * * 1'  =  minuto 0, hora 14, cualquier día del mes, cualquier mes, lunes (1)

-- Si la tarea ya existía, se quita para poder correr este archivo otra vez.
select cron.unschedule('reporte-semanal')
where exists (select 1 from cron.job where jobname = 'reporte-semanal');

select cron.schedule(
  'reporte-semanal',
  '0 14 * * 1',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/revisar-inventario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"accion": "reporte"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Comandos útiles (quita los guiones para usarlos) ---------------------------
--
-- Ver las dos tareas programadas:
--   select jobname, schedule, active from cron.job;
--
-- Cambiar el día o la hora (ejemplo: viernes 5:00 pm de México = viernes 23:00 UTC):
--   select cron.alter_job((select jobid from cron.job where jobname = 'reporte-semanal'), schedule := '0 23 * * 5');
--
-- Pausar el reporte semanal:
--   select cron.alter_job((select jobid from cron.job where jobname = 'reporte-semanal'), active := false);
--
-- Quitar el reporte semanal:
--   select cron.unschedule('reporte-semanal');
--
-- Para probarlo sin esperar al lunes, usa el botón "Enviar reporte ahora" de la página.
