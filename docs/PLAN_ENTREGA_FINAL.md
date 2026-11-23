# Plan de trabajo para la entrega final

**Actualizado:** 2026-11-22
**Rama base del equipo:** `main` de `Galoforito/Inventario-Inteligente`  
**Propósito:** fuente de verdad para que integrantes e IAs continúen el trabajo en colaboración sin repetir funciones ya hechas ni mezclar cambios del repositorio original de Carlosglez.

Lee este documento junto con `README.md` y `docs/ARQUITECTURA.md` antes de modificar el proyecto. Este archivo consolida lo implementado y los requisitos acordados por el equipo. Las decisiones aún abiertas están al final; no inventes su comportamiento.

## Reglas de colaboración

- `main` del fork es la base del equipo. Crear una rama corta `feat/...`, `fix/...` o `docs/...` para cada cambio; integrar mediante pull request.
- Mantener una migración nueva por cambio de esquema y conservar la secuencia actual. No editar migraciones aplicadas.
- Antes de aplicar una migración remota, revisar el historial de Supabase y coordinar una sola persona para aplicarla.
- No enviar correos reales durante desarrollo o demo sin configurar y verificar el servicio de correo. No incluir secretos ni archivos `.env*` en commits.
- Marcar algo como **cubierto** solo cuando el comportamiento está implementado y la verificación pertinente se ejecutó. Distinguir pruebas locales de despliegue real.
- Reutilizar los datos y cálculos expuestos por la base y la lógica de pronóstico existente. No mantener cálculos duplicados en el Dashboard.

## Alcance consolidado y estado

| Área | Estado | Requisito acordado / siguiente trabajo |
|---|---|---|
| Compra mínima del proveedor | **Cubierto** | No forma parte del flujo actual. La aplicación ignora el campo heredado y no debe volver a presentarlo como requisito. |
| Órdenes por proveedor | **Cubierto** | Cada orden pertenece a un solo proveedor; sus líneas pueden incluir varios productos de ese proveedor. Al armar órdenes desde alertas, agrupar por proveedor. Nunca mezclar proveedores en una orden. |
| SKU incremental e inmutable | **Cubierto** | El SKU lo genera la base y el formulario no permite editarlo. Migración `0015_codigos_producto_automaticos.sql` confirmada aplicada por el usuario. |
| Categorías en productos y Excel | **En rama, no integrada a `main`** | `main` ya permite elegir o crear categoría al registrar producto, pero la lista deriva de categorías usadas. La rama `feat/catalogo-categorias-persistente` (commit `dc0ad82`) añade un catálogo persistente, conserva `products.categoria` y acepta Excel sin columna categoría usando `Sin categoría`. La migración no está aplicada/verificada en Supabase. |
| Alta y movimientos | **Cubierto para el alcance especificado** | Ya hay entradas/salidas, motivos ajustados al tipo de movimiento, validaciones y SKU no editable. La solicitud general de “perfeccionar alta y salidas” se retira como tarea independiente; no se inventan cambios adicionales. |
| Proveedor por producto | **Pendiente** | Cada producto tendrá exactamente un proveedor activo y será obligatorio asignarlo al registrar el producto. Se podrá asignar desde el formulario/sección de Inventario y desde Proveedores, en la opción “Asignar producto”. Bloquear el archivo del proveedor único hasta reasignar el producto. |
| Reabastecimiento desde alertas | **Parcial** | El flujo manual actual es el correcto: no crear órdenes automáticamente por movimientos. Compras/admin puede armar órdenes desde productos/alertas y deben agruparse por proveedor. El botón del aviso de stock crea directamente un borrador para ese producto; conservar las órdenes separadas por proveedor. |
| Envío y recepción de órdenes | **Pendiente; restricción funcional** | Solo permitir registrar recepción después de que la orden esté confirmada. Una orden cuyo envío se simula en demo cuenta como enviada, pero aún requiere confirmación manual de Compras/admin antes de recibir. Aplicar la regla tanto en interfaz como en RPC/base de datos. |
| Correo de alertas | **Pendiente** | El aviso de stock se envía a personal interno y debe incluir una acción/botón para iniciar el flujo de orden del producto. Se requiere correo real; la simulación no cumple la aceptación final. Mantener distinto el correo de alerta del correo de envío de la orden. |
| Historial y pronóstico | **Parcial** | Añadir selector de historial 30/60/90 días para unidades vendidas y promedio diario. El promedio divide entre todos los días calendario del periodo, incluidos los días sin ventas. El pronóstico se basa solo en ventas. Añadir horizonte de pronóstico 7/30/90 días en Dashboard. |
| Visual actual de pronóstico en Inventario | **Retirar/mover** | Eliminar el visual compacto actual de pronóstico en la tabla de Inventario. La presentación estadística y la gráfica de pronóstico vivirán en Dashboard, según el diseño especificado abajo. |
| Importación de movimientos | **Pendiente** | Añadir importación mediante el mismo tipo de archivo/flujo de Excel que productos, con columnas propias de movimiento. Recalcular stock al importar. Si el archivo combina filas repetidas y nuevas, importar solo las nuevas. Propuesta de columnas: SKU, fecha, tipo (entrada/salida), motivo y cantidad. |
| Dashboard de inventario | **Pendiente; especificación acordada** | Añadir una pestaña Dashboard en React + Vite + Supabase. Reutilizar pronósticos y datos de la base, sin duplicar lógica. Seguir fórmulas, reglas y orden de contenido de la sección siguiente. |
| PDF de órdenes | **Pendiente; diseño acordado, datos de negocio por confirmar** | Convertir el PDF actual basado en impresión HTML en una orden profesional. Incluir los campos propuestos y la información comercial disponible; no inventar datos fiscales, moneda ni términos que el negocio no haya proporcionado. |
| Google Sheets / Teams | **Fuera de alcance** | Sheets ya no es requisito. No añadir integración con Sheets o Teams como parte de esta entrega. |
| Roles, permisos y aceptación | **Parcial** | Redactar y validar una matriz según roles y permisos existentes en el repositorio. `consulta` solo lectura; `compras` y `admin` pueden crear/gestionar órdenes; `almacén` opera movimientos y recepción según permisos actuales. Revisar rutas, UI, RLS y RPC; resolver discrepancia de visibilidad de órdenes para Consulta indicada al final. |

## Prerrequisito y esquema de categorías

La instrucción original pide `0011_categorias.sql` y una columna `category text not null default 'Sin categoría'`. El repositorio contradice esa premisa: `products.categoria` ya existe y `0011` ya está ocupada por `0011_costos_alertas_utf8.sql`; la secuencia llega hasta `0017`. No crear una columna duplicada en inglés ni reutilizar el número de migración.

Propuesta compatible con el esquema actual: conservar `products.categoria` como la categoría asignada al producto, crear una tabla de catálogo persistente en una migración nueva `0018_categorias.sql`, sembrarla con las categorías existentes e incluir `Sin categoría`. El catálogo debe conservar categorías aunque temporalmente ningún producto las use. Mantener compatibilidad con hojas Excel antiguas; categoría será opcional al importar.

El usuario confirmó esta propuesta: conservar `products.categoria` y añadir el catálogo persistente con la siguiente migración disponible, sin duplicar el campo ni reutilizar el número `0011`.

## Especificación del Dashboard

### Definiciones y cálculos

- **Abasto/cobertura:** días de cobertura = stock ÷ consumo diario. El consumo diario para cobertura es el promedio de ventas de los últimos 30 días calendario.
- **Valor del inventario:** stock × costo del producto.
- **Cobertura por categoría:** suma de stock de la categoría ÷ suma del consumo diario de sus productos. No promediar coberturas individuales.
- **Consumo cero:** mostrar “Sin rotación”; excluir de los cálculos y semáforo de cobertura y sumar el valor de su stock por separado como valor inmovilizado. Es un estado neutro separado: no se clasifica como exceso ni como atención solo por no tener ventas.
- **Clasificación del producto, usando la primera regla aplicable:**
  1. **Crítico (rojo):** stock = 0 o cobertura < 7 días.
  2. **Atención (ámbar):** bajo mínimo o cobertura entre 7 y 14 días inclusive.
  3. **Exceso (azul):** cobertura > 90 días.
  4. **Saludable (verde):** cualquier otro caso con consumo distinto de cero.
- **Prioridad dentro de cada color:** costo del faltante = cantidad sugerida de compra × costo.
- **Categoría que requiere atención:** tiene al menos un producto crítico o más de 25 % de sus productos en ámbar/rojo.
- El selector de historial muestra periodos 30/60/90. El pronóstico tiene un selector de horizonte 7/30/90. La definición de cobertura de abasto permanece basada en los últimos 30 días.

### Contenido, de arriba abajo

1. Tarjetas: productos agotados, productos bajo mínimo, valor total del inventario y costo total del faltante.
2. Barras horizontales de cobertura por categoría, con estado legible además del color. Al seleccionar una barra se filtra todo el Dashboard.
3. Tabla “Requiere atención”: producto, categoría, stock, mínimo, días de cobertura, fecha estimada de agotamiento, cantidad sugerida, costo del faltante, proveedor y botón de orden de compra.
4. Pronóstico del producto seleccionado: ventas reales, estimación, banda de confianza, fecha estimada de agotamiento marcada y selector de horizonte 7/30/90 días.
5. Distribución del valor del inventario por categoría.

### Reglas de interfaz y permisos

- `consulta` solo ve. `compras` y `admin` pueden usar el botón de orden.
- Mostrar estados vacíos comprensibles para falta de ventas, falta de categoría y falta de proveedor.
- En celular, apilar tarjetas y presentar la tabla como tarjetas.
- No indicar estado solo mediante color: incluir etiqueta o icono con texto accesible.
- Los números deben coincidir con los que muestra Inventario para las mismas entidades y periodos.
- Pruebas unitarias requeridas para consumo cero, categoría vacía, stock cero y redondeo de cobertura.

## Importación de movimientos

Reutilizar el formato de archivo Excel y el flujo de carga/validación de la importación de productos, con una plantilla/hoja de movimientos adecuada a sus datos. Columnas propuestas: `codigo` (SKU), `fecha`, `tipo`, `motivo`, `cantidad`. La importación debe validar producto, fecha, tipo, motivo y cantidad antes de aplicar filas; al aceptarlas, registrar movimientos y actualizar stock una sola vez. Si se carga un archivo con filas duplicadas y nuevas, importar únicamente las nuevas y mostrar un resumen de filas nuevas y omitidas.

## Proveedor y ciclo de la orden

- Para registrar un producto se debe elegir un proveedor activo. Debe ser posible asignarlo/editarlos desde Inventario y desde Proveedores → Asignar producto.
- Un producto solo tiene un proveedor activo asignado y el alta lo requiere. Se podrá asignar desde Inventario y desde Proveedores → Asignar producto. Bloquear el archivo del proveedor único hasta que el producto se reasigne.
- Las órdenes continúan siendo manuales; no se generan automáticamente por movimientos. El botón en el aviso de stock crea directamente un borrador para ese producto. Agrupar productos solo si tienen el mismo proveedor.
- Una orden no puede recibirse hasta que esté confirmada. Un envío simulado de demo cuenta como enviado, pero Compras/admin debe registrar manualmente la confirmación del proveedor. La base de datos debe impedir recepción prematura, aunque se invoque la RPC directamente.
- El correo de alerta de stock debe ofrecer una acción que cree directamente un borrador de orden para el producto asociado. Requiere entrega real en aceptación; el correo de alerta y el correo de envío al proveedor son flujos distintos.

## PDF de orden de compra

Diseño profesional con jerarquía visual, tipografía legible, tablas alineadas, importes y totales claros, paginación y formato apto para impresión. Incluir identidad del negocio (nombre, RFC y dirección), logo si está disponible, folio y fechas, datos del proveedor, productos/SKU, cantidades, costo unitario, subtotales, total, responsable, estado y espacio para autorización y recepción/firmas. El total debe coincidir con la orden. Los datos de negocio deben provenir de configuración/datos reales; no inventar RFC, dirección, impuestos, moneda ni condiciones de pago.

## Roles y validación de entrega

Usar el modelo existente como base y verificar cada operación tanto en la interfaz como en RLS/RPC:

| Rol | Alcance a validar |
|---|---|
| `admin` | Administración completa, usuarios, catálogo, proveedores, productos, movimientos y ciclo de órdenes. |
| `compras` | Proveedores y asignación producto-proveedor; creación y envío de órdenes; confirmación y seguimiento de recepción conforme al flujo definido. |
| `almacen` | Consulta operativa de inventario y registro de entradas/salidas; recepción solo en estado permitido. No administrar usuarios ni enviar órdenes salvo que las políticas vigentes lo permitan expresamente. |
| `consulta` | Lectura únicamente, incluyendo el listado y detalle de órdenes; sin mutaciones de productos, proveedores, movimientos u órdenes. |

La aceptación debe documentar: recorrido de cada rol, restricciones denegadas en UI y backend, importación y deduplicación, cálculos de dashboard frente a Inventario, ciclo de orden (borrador → envío → confirmación → recepción), migraciones remotas aplicadas y correo SMTP real aceptado por el proveedor de correo. Guardar evidencia sin secretos. Un `message_id` o respuesta SMTP acredita aceptación por el servidor, no necesariamente que el destinatario lo haya leído.

La cuenta/datos demo deben verificarse con el seed existente y documentarse para el entorno de entrega; no asumir que el seed local está cargado en Supabase remoto.

## Mapa de código para continuar

- Inventario, alta, sugerencias y roles: `web/src/paginas/Inventario.jsx`, `web/src/componentes/FormularioProducto.jsx`, `web/src/componentes/Prioridad.jsx`.
- Pronóstico/ventas: `web/src/lib/pronostico.js`, `web/src/lib/pronostico-avanzado.js`, `web/src/lib/api.js`; vistas SQL en `supabase/migrations/0002_funciones.sql` y `0007_ventas_pronostico.sql`.
- Proveedor por producto: `web/src/paginas/Proveedores.jsx`, tabla `proveedor_productos` en `supabase/migrations/0008_proveedores_compras_roles.sql`.
- Órdenes, PDF y recepción: `web/src/paginas/Ordenes.jsx`, `supabase/functions/revisar-inventario/index.ts`, migraciones de órdenes existentes hasta `0017`.
- Alertas SMTP: `supabase/functions/revisar-inventario/{correo,entrega,index}.ts` y `docs/CONFIGURAR_CORREO.md`.
- Rutas/roles: `web/src/App.jsx`, `web/src/componentes/Encabezado.jsx`; políticas y RPC en migraciones `0008` en adelante.
- Excel productos: `web/src/componentes/ImportarExcel.jsx`, `web/src/lib/excel.js`, `web/src/lib/validar.js`; el importador actual no cubre movimientos.

## Estado de migraciones y verificación

- El usuario confirmó aplicadas las migraciones `0015_codigos_producto_automaticos.sql`, `0016_ignorar_compra_minima_proveedor.sql` y `0017_orden_rapida_producto_agotado.sql`.
- `0011_costos_alertas_utf8.sql` ya ocupa la secuencia `0011`. `0018_categorias.sql` existe en `feat/catalogo-categorias-persistente`; aún no forma parte de `main` ni consta aplicada en Supabase remoto.
- La verificación web previa dio 164/166: dos expectativas antiguas buscaban el campo editable `Código` y el valor interno `sin_clasificar`; el build pasó en esa ejecución. Esto es evidencia histórica, no resultado vigente de la entrega.
- No hay en este plan evidencia de ejecución de pruebas SQL remotas ni de correo real. Registrar resultados nuevos al completar cada etapa.
