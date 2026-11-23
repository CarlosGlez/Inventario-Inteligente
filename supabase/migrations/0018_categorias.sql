-- Catálogo persistente de categorías.
-- products.categoria ya existe; se conserva para no duplicar el dato.
create table categorias (
  nombre text primary key
    check (btrim(nombre) <> '' and char_length(nombre) <= 120),
  created_at timestamptz not null default now()
);

insert into categorias (nombre)
select distinct btrim(categoria)
from products
where btrim(categoria) <> ''
on conflict (nombre) do nothing;

insert into categorias (nombre)
values ('Sin categoría')
on conflict (nombre) do nothing;

alter table products alter column categoria set default 'Sin categoría';

alter table categorias enable row level security;
revoke all on table categorias from public, anon, authenticated;
create policy "roles activos leen categorías" on categorias
  for select to authenticated
  using (tiene_rol(array['admin','almacen','compras','consulta']));
grant select on categorias to authenticated;
grant all on categorias to service_role;

-- La categoría se conserva aunque luego se elimine o reasigne su último producto.
-- El alta/importación de productos mantiene el catálogo desde cualquier ruta de escritura.
create function registrar_categoria_producto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.categoria := coalesce(nullif(btrim(new.categoria), ''), 'Sin categoría');
  insert into categorias (nombre) values (new.categoria)
  on conflict (nombre) do nothing;
  return new;
end $$;

create trigger products_registrar_categoria
before insert or update on products
for each row execute function registrar_categoria_producto();

revoke all on function registrar_categoria_producto() from public, anon, authenticated;
