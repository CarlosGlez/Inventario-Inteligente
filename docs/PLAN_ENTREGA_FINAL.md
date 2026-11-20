# Plan de trabajo para la entrega final

**Actualizado:** 2026-11-20  
**Rama base del equipo:** `main` de `Galoforito/Inventario-Inteligente`  
**Propósito:** fuente de verdad para que integrantes e IAs continúen el trabajo sin repetir funciones ya hechas ni mezclar cambios del repositorio original de Carlosglez.

Lee este documento junto con `README.md` y `docs/ARQUITECTURA.md` antes de modificar el proyecto. Los estados describen el código del repositorio; una migración local no demuestra que ya esté aplicada en Supabase.

## Reglas de colaboración

- `main` del fork es la base del equipo. No trabajar directamente en `main`.
- Crear una rama corta por cambio: `feat/...`, `fix/...` o `docs/...`; abrir un pull request y actualizar este plan al integrar.
- Mantener una sola migración nueva por cambio de esquema y conservar el orden numérico existente (`0018_...`, `0019_...`). No editar migraciones ya aplicadas.
- Antes de aplicar una migración remota, revisar el historial de Supabase. El equipo debe coordinar una sola persona para aplicarlas.
- No enviar correos reales durante desarrollo o demo. Mantener modo simulado salvo prueba privada autorizada.
- No incluir secretos ni archivos `.env*` en commits.
- Marcar algo como **cubierto** solo cuando el comportamiento está implementado y la verificación pertinente se ejecutó. Distinguir pruebas locales de despliegue real.

## Requisitos consolidados y estado actual

| Área consolidada | Estado | Situación actual y trabajo restante |
|---|---|---|
| Compra mínima del proveedor | **Cubierto** | El formulario y directorio ya no muestran ni envían `minimo_compra`; la generación de órdenes deja de ajustar cantidades por ese monto. La columna heredada permanece en la base, pero la aplicación la ignora. La migración `0016_ignorar_compra_minima_proveedor.sql` debe constar aplicada en el entorno destino. |
| Una orden pertenece a un proveedor | **Cubierto** | `ordenes_compra` tiene un solo `proveedor_id`; sus líneas pueden contener varios productos de ese proveedor. Las órdenes generadas desde alertas se separan por proveedor. No se necesita otra funcionalidad para este requisito. |
| Código SKU incremental e inmutable | **Cubierto** | El formulario no pide código; la base lo asigna con secuencia y rechaza modificaciones. Los códigos existentes se conservaron. El usuario confirmó aplicada la migración `0015_codigos_producto_automaticos.sql`. |
| Elegir categoría existente o crear una | **Cubierto con límite conocido** | El alta reutiliza categorías existentes o permite crear una al registrar producto. La lista se deriva de las categorías usadas por productos; no es una tabla independiente y una categoría desaparece de la lista si ya ningún producto la usa. La retroalimentación marcó este punto como listo. |
| Alta y movimientos de inventario | **Parcial** | Alta, validaciones, entradas y salidas están implementadas; los motivos se adaptan a entrada/salida y el código es de solo lectura. “Perfeccionar la alta y salidas” no especifica más criterios: no rehacer lo existente hasta concretar qué falta. |
| Pronóstico, temporalidades y claridad visual | **Parcial** | Hay ventas clasificadas, consumo reciente, modelos de pronóstico y una gráfica pequeña en la tabla. Se requiere una presentación más legible y definir la ventana temporal solicitada. La evaluación cuantitativa contra el baseline todavía debe ejecutarse y documentarse. Las salidas históricas sin motivo de venta no se reinterpretan automáticamente. |
| Métricas de ventas y días de inventario | **Parcial** | La base expone ventas por día hasta 365 días y hay consumo de 30 días; la interfaz no ofrece selector de 30/60/90 días ni presenta juntas las unidades vendidas, promedio diario y cobertura de stock. Aclarar si 30–90 días es la ventana de análisis o el horizonte de pronóstico. |
| Importar historial de movimientos | **Pendiente** | Excel actualmente importa/actualiza productos; no hay importación de movimientos. Definir columnas, deduplicación y si importar movimientos históricos también debe modificar el stock actual. |
| Dashboard por categorías y abastecimiento | **Pendiente** | No existe pestaña Dashboard. Hace falta definir qué significa “más abasto” y cómo medir “requiere mejor resolución”. Propuesta inicial: stock en unidades y valor, cobertura en días, productos agotados/bajo mínimo y faltante/sugerencia, agrupados por categoría. |
| Proveedor asignado a cada producto | **Parcial** | Existe `proveedor_productos` y Compras puede vincular productos desde Proveedores. El inventario no muestra qué productos carecen de proveedor ni permite asignarlo ahí; un producto puede quedar sin proveedor activo. La orden rápida falla con un mensaje si no encuentra proveedor activo. |
| Reabastecimiento automático a partir de movimientos | **Parcial** | El scheduler detecta stock bajo y crea alertas. Compras/admin puede crear un borrador desde una alerta o usar **Armar orden** en un producto agotado. Ninguna de esas acciones crea automáticamente un borrador cuando un movimiento cruza el umbral; tampoco envía órdenes automáticamente. Definir el evento y el nivel de automatización. |
| Enviar orden antes de recibir | **Pendiente; error funcional conocido** | La interfaz ofrece “Registrar recepción” incluso en borradores y `recibir_linea_orden` solo rechaza canceladas, por lo que el backend permite recibir antes de enviar. Restringir UI y RPC a órdenes enviadas/confirmadas y definir cómo cuenta el estado simulado de demo. |
| Alertas por correo | **Parcial** | El correo de alerta de inventario usa el destinatario global `ALERT_TO`; el correo de una orden se dirige al correo del proveedor cuando Compras/admin la envía. Sin SMTP activo, los envíos pueden quedar simulados. Aclarar si una alerta de stock debe llegar al personal interno, al proveedor del producto o a ambos. |
| Integración con Google Sheets o Teams | **Pendiente/por confirmar alcance** | No hay integración implementada en el código actual. La lista original proponía una integración, pero no identifica cuál ni qué flujo/datos debe sincronizarse. |
| Roles y cuenta/demo | **Parcial** | Existen roles, restricciones de UI/RLS/RPC y script de seed demo. No está verificado en el proyecto remoto el recorrido completo de los roles ni la carga del seed; las pruebas SQL de roles cubren principalmente denegaciones de Consulta. |
| PDF de órdenes | **Parcial** | La acción actual abre una página HTML para imprimir/guardar como PDF. Mejorar diseño y contenido; acordar qué campos y elementos de marca hacen falta. |
| Validación y acotamiento | **Proceso transversal pendiente** | Hay validaciones de UI, SQL/RLS/RPC y pruebas, pero falta una matriz final de aceptación por rol y comprobarla contra el Supabase desplegado. La suite web ejecutada anteriormente dio 164/166: dos expectativas antiguas aún buscan el campo editable `Código` y el valor interno `sin_clasificar`. El build pasó en esa ejecución. No se ejecutaron pruebas SQL remotas. Repetir y registrar los resultados vigentes antes de la entrega. |

## Mapa de código para continuar

- Inventario, alta, sugerencias y roles: `web/src/paginas/Inventario.jsx`, `web/src/componentes/FormularioProducto.jsx`, `web/src/componentes/Prioridad.jsx`.
- Pronóstico/ventas: `web/src/lib/pronostico.js`, `web/src/lib/pronostico-avanzado.js`, `web/src/lib/api.js`; vistas SQL en `supabase/migrations/0002_funciones.sql` y `0007_ventas_pronostico.sql`.
- Proveedor por producto: `web/src/paginas/Proveedores.jsx`, `proveedor_productos` en `supabase/migrations/0008_proveedores_compras_roles.sql`.
- Órdenes, PDF y recepción: `web/src/paginas/Ordenes.jsx`, `supabase/functions/revisar-inventario/index.ts`, `supabase/migrations/0012_productos_borrados_ordenes.sql`, `0017_orden_rapida_producto_agotado.sql`.
- Alerta SMTP: `supabase/functions/revisar-inventario/{correo,entrega,index}.ts` y `docs/CONFIGURAR_CORREO.md`.
- Rutas y roles visuales: `web/src/App.jsx`, `web/src/componentes/Encabezado.jsx`; políticas y RPC: migraciones `0008` en adelante.
- Importación actual de productos: `web/src/componentes/ImportarExcel.jsx`, `web/src/lib/excel.js`, `web/src/lib/validar.js`; no es importador de movimientos.

## Trabajo propuesto por etapas

### 1. Corregir el ciclo de vida de órdenes

- No permitir registrar recepción mientras la orden está en `borrador`.
- Enforzar la misma regla en `recibir_linea_orden`, no solo ocultar el botón.
- Definir transiciones: `borrador → enviada → recibida parcial → recibida`; decidir si `confirmada` es un paso manual separado.
- Acordar si una orden en modo simulado permite probar recepciones sin correo real.
- Aceptación: ningún rol ni llamada RPC puede aumentar stock antes del estado permitido; una orden cancelada sigue bloqueada.

### 2. Hacer visible y gestionable el proveedor por producto

- Mostrar en Inventario un estado claro: proveedor activo asignado o falta asignación.
- Permitir a Compras/admin vincular proveedor desde esa pantalla, con datos por producto (costo cotizado y mínimo de unidades si continúa siendo necesario).
- Definir cómo se migra/repara el catálogo existente y qué ocurre al archivar el único proveedor asignado.
- Aceptación: Compras puede identificar todos los productos sin proveedor activo y resolverlos; el rol Almacén conserva los permisos acordados.

### 3. Definir y construir el reabastecimiento automático

- Reutilizar el umbral de stock/alerta ya existente y evitar órdenes duplicadas ante movimientos o revisiones repetidas.
- Propuesta segura: crear automáticamente **borradores**, uno por proveedor, y dejar el envío sujeto a aprobación de Compras. No enviar correos de compra automáticamente sin autorización explícita.
- Determinar qué motivos cuentan como demanda: probablemente solo `salida/venta`, no merma ni ajuste; validar con el usuario.
- Aceptación: al cruzar el umbral se genera una orden por proveedor con productos asociados, se conserva idempotencia y se puede enviar desde la sección Órdenes.

### 4. Importar movimientos y completar análisis de 30–90 días

- Proponer plantilla con código SKU, fecha/hora, entrada/salida, motivo y cantidad; validar códigos, rangos y filas duplicadas.
- Decidir si la importación inserta historial y recalcula stock, o importa solo historial sin tocar el stock actual. No implementar hasta resolverlo.
- Añadir selector de 30, 60 o 90 días con unidades vendidas, promedio diario y días de cobertura por producto.
- Definir promedio diario sobre todos los días calendario (incluidos días sin venta) o solo días con venta.
- Aceptación: ventas se distinguen de merma/ajuste; al importar de nuevo el mismo archivo no se duplican movimientos ni se altera stock dos veces.

### 5. Dashboard de abastecimiento por categoría y pronóstico visual

- Crear pestaña Dashboard con filtros de categoría y periodo.
- Métricas propuestas por categoría: productos, unidades y valor en stock; cobertura promedio/mediana; productos agotados o bajo mínimo; unidades/costo sugerido para reponer.
- Mostrar ventas reales y pronóstico en una gráfica temporal, con horizonte y banda de incertidumbre claramente rotulados; separar dato observado de estimación.
- Aceptación: se puede comparar qué categorías tienen más cobertura y cuáles concentran faltantes, y navegar desde el resumen al producto afectado.

### 6. Mejorar PDF, alta/salidas y cierre de calidad

- Acordar contenido del PDF: folio, fecha, proveedor/datos de contacto, partidas, cantidad, costo unitario, subtotal, total y espacio de autorización/recepción si se requiere.
- Convertir “perfeccionar la alta y salidas” en cambios observables; evitar duplicar SKU automático, categoría y motivos por tipo, que ya existen.
- Mantener un checklist de roles: admin, Compras, Almacén y Consulta; probar permisos tanto en interfaz como en RPC/RLS.
- Actualizar README, arquitectura, mapa de requisitos y resultados medidos; el listado de migraciones en README actualmente no enumera hasta `0017`.

## Preguntas para precisar antes de implementar lo ambiguo

1. **Automatización:** ¿al bajar del mínimo se debe crear un borrador automáticamente y pedir aprobación antes de enviar, o enviar la orden automáticamente al proveedor?
2. **Motivos que activan reabastecimiento:** ¿solo una venta, cualquier salida o cualquier movimiento que deje el stock bajo?
3. **Proveedor obligatorio:** ¿cada producto necesita exactamente un proveedor activo o puede tener varios y elegir el de menor costo? ¿Debe impedirse guardar/importar un producto sin proveedor?
4. **Correo de alerta:** ¿el aviso de stock bajo va a `ALERT_TO`, al proveedor asignado, o a ambos?
5. **Ventana 30–90 días:** ¿quieres un selector de ventana de ventas de 30/60/90 días, un pronóstico de hasta 90 días, o ambos?
6. **Importar movimientos:** ¿al importar el historial se debe cambiar el stock actual? ¿Qué formato/columnas tiene el archivo de origen?
7. **Dashboard:** ¿“más abasto” significa más unidades, más valor en dinero o más días de cobertura? Para “mejor resolución”, ¿qué indicador debe ordenar las categorías: productos agotados, faltante, costo sugerido u otro?
8. **PDF y alta/salidas:** ¿qué campos/elementos faltan en el PDF y qué parte concreta del alta o de registrar entradas/salidas debe cambiar?
9. **Integración:** ¿la entrega requiere Google Sheets o Teams? ¿Qué datos deben enviarse/consultarse y en qué momento?

## Estado de migraciones y verificación remota

- El usuario confirmó que `0015_codigos_producto_automaticos.sql` quedó aplicada.
- La aplicación de `0016_ignorar_compra_minima_proveedor.sql` y `0017_orden_rapida_producto_agotado.sql` no está confirmada en este plan. Verificar la tabla de historial de migraciones del proyecto antes de asumir que las RPC existen.
- Los cambios de esquema futuros se hacen con migraciones en ramas, se revisan y se aplican de forma coordinada; actualizar este apartado al comprobar el entorno.
