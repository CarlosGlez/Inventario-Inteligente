-- Prueba local solamente: ejecutar después de preparar_local.sql y migraciones 0001–0010.
-- preparar_local.sql simula auth.users/auth.uid; no ejecutes este archivo en prod.
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000444','consulta@example.invalid') on conflict do nothing;
update profiles set role='consulta',active=true where user_id='00000000-0000-4000-8000-000000000444';
insert into products(codigo,nombre,categoria,stock_actual,stock_minimo,costo) values('RBAC','Permisos','Test',5,1,1) on conflict do nothing;

create function pg_temp.assert_403(p_sql text) returns void language plpgsql as $$
declare v_codigo text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics v_codigo = returned_sqlstate; end;
  if v_codigo is distinct from '42501' then raise exception 'Se esperaba 42501 y se obtuvo % al ejecutar %',v_codigo,p_sql; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000444',true);
set local role authenticated;
select pg_temp.assert_403($q$select registrar_movimiento((select id from products where codigo='RBAC'),'salida',1)$q$);
select pg_temp.assert_403($q$select registrar_movimiento((select id from products where codigo='RBAC'),'salida',1,'venta')$q$);
select pg_temp.assert_403('select crear_ordenes_desde_alerta(-1)');
select pg_temp.assert_403('select recibir_linea_orden(-1,1)');
reset role;
rollback;
