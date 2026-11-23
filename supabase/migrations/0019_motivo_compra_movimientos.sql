-- 0014 amplió movements_motivo_tipo_check con 'compra', pero dejó vigente la
-- restricción de columna creada en 0007 (movements_motivo_check), que no lo
-- incluye. Resultado: una entrada con motivo 'compra' seguía siendo rechazada.
-- Se reemplaza por la lista completa de motivos que acepta registrar_movimiento.
alter table movements drop constraint if exists movements_motivo_check;
alter table movements add constraint movements_motivo_check
  check (motivo in ('sin_clasificar', 'compra', 'devolucion', 'venta', 'merma', 'ajuste', 'otro'));
