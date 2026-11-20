-- Compras puede seguir registrando y editando proveedores, pero el borrado
-- queda restringido al administrador.
drop policy if exists "compras gestiona proveedores" on proveedores;
drop policy if exists "roles leen proveedores" on proveedores;
drop policy if exists "compras crea proveedores" on proveedores;
drop policy if exists "compras edita proveedores" on proveedores;
drop policy if exists "admin elimina proveedores" on proveedores;

create policy "roles leen proveedores"
on proveedores for select to authenticated
using (tiene_rol(array['admin','compras','consulta','almacen']));

create policy "compras crea proveedores"
on proveedores for insert to authenticated
with check (tiene_rol(array['admin','compras']));

create policy "compras edita proveedores"
on proveedores for update to authenticated
using (tiene_rol(array['admin','compras']))
with check (tiene_rol(array['admin','compras']));

create policy "admin elimina proveedores"
on proveedores for delete to authenticated
using (tiene_rol(array['admin']));
