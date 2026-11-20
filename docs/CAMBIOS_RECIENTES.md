# Cambios recientes

## Historial de alertas y codificación

- La reposición hasta el mínimo se calcula como faltante por costo unitario del catálogo. El costo sugerido por pronóstico queda separado.
- Las órdenes usan `products.costo` como costo de compra consistente; las alertas y órdenes guardadas se actualizan en la migración `0011_costos_alertas_utf8.sql`.
- El correo, las respuestas JSON y la exportación CSV declaran o conservan UTF-8; el CSV incorpora BOM.
- El historial incorpora filtros por tipo, estado, fechas y producto, agrupación diaria, resumen de criticidad, barras de nivel y estados más visibles.
- El banner de modo simulado consulta el estado actual del backend.

Verificación registrada: `npm.cmd test` (166 pruebas) y `npm.cmd run build` completaron correctamente antes de estos commits.
