# Cambios recientes

## Historial de alertas y codificación

- La reposición hasta el mínimo se calcula como faltante por costo unitario del catálogo. El costo sugerido por pronóstico queda separado.
- Las órdenes usan `products.costo` como costo de compra consistente; las alertas y órdenes guardadas se actualizan en la migración `0011_costos_alertas_utf8.sql`.
- El correo, las respuestas JSON y la exportación CSV declaran o conservan UTF-8; el CSV incorpora BOM.
- El historial incorpora filtros por tipo, estado, fechas y producto, agrupación diaria, resumen de criticidad, barras de nivel y estados más visibles.
- El banner de modo simulado consulta el estado actual del backend.

Verificación registrada: `npm.cmd test` (166 pruebas) y `npm.cmd run build` completaron correctamente antes de estos commits.

## Eliminación de productos con historial de compra

- La migración `0012_productos_borrados_ordenes.sql` guarda código y nombre en cada línea de orden y cambia la referencia al producto a `ON DELETE SET NULL`.
- La página de órdenes muestra esos snapshots cuando el producto ya no está en el catálogo.
- Al recibir una línea sin producto enlazado, el sistema busca un producto re-creado con el mismo código; si no existe, muestra un error claro.

## Borrado masivo del inventario

- La pantalla de inventario ofrece el borrado masivo solo al rol administrador.
- Requiere aceptar una confirmación con el número de productos y escribir `ELIMINAR` en el segundo paso.
- La operación se ejecuta como una sola petición y muestra cuántos productos eliminó; movimientos y snapshots de órdenes permanecen.

## Eliminación de proveedores

- La lista de proveedores muestra la acción de borrar solo a administradores y pide confirmación antes de proceder.
- Si hay órdenes asociadas, la clave foránea impide el borrado y la interfaz explica que conserva el proveedor para proteger el historial.
- La migración `0013_eliminar_proveedores_admin.sql` mantiene la gestión de alta/edición para compras, pero reserva el permiso DELETE al rol administrador.
