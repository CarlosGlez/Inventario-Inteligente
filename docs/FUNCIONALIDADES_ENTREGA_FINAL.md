# Inventario de funcionalidades para la entrega final

**Actualizado:** 2026-11-22  
**Fuentes:** estado del repositorio, historial Git, `docs/PLAN_ENTREGA_FINAL.md`, `docs/ARQUITECTURA.md`, `README.md` y la presentación `Entrega_Final_Temas_de_Vanguardia-1.pptx`.

Este documento ayuda al equipo a explicar qué ofrece la aplicación, qué se heredó, qué amplió el equipo actual y qué falta. Los requisitos académicos de la presentación se separan de las funciones del producto: una instrucción para exponer o documentar no se debe convertir en una función de la app.

## Estado y criterio de lectura

- **Heredado:** funcionalidades observadas en el miniproyecto original Flask/SQLite y conservadas en la versión actual React/Supabase.
- **Nuevo equipo, integrado en `main`:** cambios de ampliación que ya están en `main` del fork, con último commit de integración `a92a395`.
- **Rama pendiente de integrar:** catálogo persistente de categorías, commit `dc0ad82` en `feat/catalogo-categorias-persistente`. Está publicado en GitHub, pero no se ha integrado a `main` y la migración remota `0018_categorias.sql` no se ha aplicado/verificado.
- **Pendiente:** requisitos todavía no implementados según el plan consolidado. No se presentan como funciones disponibles en la demo.
- **Implementado pero sin verificación de despliegue:** hay código/migraciones locales, pero hace falta validar el comportamiento contra Supabase, SMTP o el entorno de entrega.

## 1. Funciones heredadas del miniproyecto original

Estas funciones constituyen el punto de partida del producto y fueron migradas de Flask/SQLite a React, Vite y Supabase.

### Inventario y productos

- Alta, edición y eliminación individual de productos.
- Datos de producto: código, nombre, categoría, stock actual, stock mínimo y costo.
- Validación para impedir valores negativos y stock menor que cero al registrar movimientos.
- Resumen visual con cantidad de productos, productos con stock bajo, valor del inventario y fecha/hora de última revisión.
- Búsqueda y consulta de productos en la tabla de Inventario.

### Movimientos

- Registro de entradas y salidas con cantidad.
- Historial de movimientos con datos del producto, cantidad y stock antes/después.
- El historial mantiene el código y nombre como texto para preservar movimientos aunque el producto se borre.

### Alertas y tareas programadas

- Revisión automática de stock bajo cada minuto en la nube mediante `pg_cron`, `pg_net` y Supabase Edge Functions.
- Creación de alertas cuando el producto queda por debajo de su mínimo.
- Evita repetir avisos del mismo episodio de stock bajo hasta que el producto se recupere.
- Historial de alertas y resultado de envío.
- Correo SMTP configurable. Si SMTP no está habilitado o se fuerza el modo demo, la alerta se guarda como simulada.
- Reporte semanal automatizado con resumen, inventario y movimientos recientes.
- Reintento de entregas con error desde el historial disponible.

### Pronóstico y archivos

- Estimación heredada de consumo/agotamiento basada en salidas recientes, con ventana base de 30 días.
- Presentación de días restantes estimados en Inventario.
- Importación de productos desde Excel para crear o actualizar por código.
- Exportación de productos a Excel y archivo de ejemplo.

### Seguridad inicial

- Inicio de sesión a través de Supabase Auth.
- El proyecto original separaba el acceso autenticado del usuario anónimo mediante RLS; todavía no tenía los roles funcionales actuales.

## 2. Ampliaciones del nuevo equipo integradas en `main`

El historial del fork y el README identifican esta etapa como la ampliación del Equipo 4. Estas funciones están en la rama `main` del fork, salvo las excepciones indicadas en la sección siguiente.

### Ventas y pronóstico

- Los movimientos de salida distinguen venta, merma, ajuste negativo y otro.
- Las entradas distinguen compra/recepción, devolución, ajuste positivo y otro.
- El pronóstico avanzado compara métodos sobre historial de ventas, incluye factores temporales e intervalo de confianza y calcula una fecha estimada de agotamiento.
- Hay datos sintéticos y herramientas de evaluación/backtest para medir el pronóstico; falta cerrar y reportar resultados finales reproducibles.
- La interfaz de Inventario muestra información del pronóstico y su visual compacto actual. El plan pide mover la estadística/gráfica principal al Dashboard.

### Alertas y correo

- Registro de destinatario, ID del mensaje y estados de entrega disponibles.
- Control de intentos y espera progresiva (*backoff*) para errores temporales.
- La aceptación del servidor SMTP se distingue de una confirmación de entrega/lectura real.
- Enlaces de la app en los correos de orden, donde ya están configurados.
- Modo demo que evita mandar correo real y registra el resultado como simulado.

### Proveedores y órdenes de compra

- Alta, edición y directorio CRUD de proveedores.
- Selector para consultar proveedores activos y archivados.
- Eliminación segura: cuando el historial relacionado impide borrar el proveedor, se conserva/archiva para proteger las órdenes existentes.
- Asociación de productos y proveedores desde la sección Proveedores.
- Generación manual de borradores desde alertas, agrupando líneas por proveedor; una orden es de un único proveedor y puede incluir varios productos.
- Envío de orden al proveedor desde la aplicación para roles de Compras/admin.
- Registro de recepción parcial/completa y actualización de stock mediante una operación de base de datos.
- Vista de impresión/exportación PDF básica de la orden.
- Filtros de órdenes por fecha, estado, proveedor, producto y monto; monto final visible en cada tarjeta.
- Ordenamiento por fecha o monto, ascendente/descendente; predeterminado: fecha más reciente primero.
- Acción rápida para crear una orden de un producto agotado.
- El campo de compra mínima dejó de participar en los cálculos y en la experiencia actual.

### Roles, administración e interfaz

- Roles `admin`, `compras`, `almacen` y `consulta`, con restricciones en la interfaz y políticas/RPC de base de datos.
- Administración de usuarios/perfiles desde la app para el rol administrador.
- Datos y seed de demostración disponibles en el repositorio; se debe verificar que estén cargados en el Supabase del demo.
- El administrador puede borrar todos los productos con confirmación doble, conservando el historial que debe sobrevivir.
- Acciones de fila separadas para que Editar y Eliminar no se encimen.
- Ayuda contextual para explicar motivos de movimiento y selección de opciones según entrada o salida.
- Alta de producto con selector para elegir categoría existente o crear una nueva.

## 3. Funcionalidad en rama, aún no disponible en `main`

### Catálogo persistente de categorías

- La rama `feat/catalogo-categorias-persistente` crea `0018_categorias.sql` y una tabla independiente que conserva categorías aunque ya no tengan productos asignados.
- La pantalla de Inventario obtiene las opciones de categoría desde el catálogo.
- La base registra categorías al crear, editar o importar productos; se conservó `products.categoria` para evitar duplicar el campo.
- La importación acepta Excel con o sin la columna `categoria`; si no viene, asigna `Sin categoría`.
- La exportación y el Excel de ejemplo ya incluyen la columna `categoria`.
- **Estado:** commit `dc0ad82` ya está subido a una rama, no integrado a `main`; migración todavía no aplicada/verificada en Supabase remoto.

## 4. Requisitos pendientes del plan de entrega

### Proveedor asignado a cada producto

- Limitar cada producto a exactamente un proveedor activo.
- Hacer obligatorio elegirlo al registrar un producto.
- Permitir asignar/cambiar proveedor tanto desde Inventario como desde Proveedores → Asignar producto.
- Bloquear el archivo del proveedor único mientras tenga productos asignados; primero se debe reasignar el producto.
- Hacer visibles los productos que aún no tienen proveedor y permitir completar la asignación.

### Flujo completo de órdenes

- Conservar el reabastecimiento como acción manual; no crear órdenes automáticamente por cada movimiento.
- Desde el correo de alerta de stock, ofrecer un botón que cree directamente un borrador para el producto relacionado.
- Mantener una orden por proveedor, incluso si contiene varias líneas/productos.
- Exigir el orden del ciclo: borrador → enviado → confirmado manualmente por Compras/admin → recepción.
- Aunque el envío se simule en demo, debe considerarse enviada; no permitir recepcionar hasta confirmar.
- Impedir recepción prematura tanto en la interfaz como en la RPC/base de datos.

### Alertas internas por correo real

- Enviar el aviso de stock a personal interno.
- Incluir la acción de crear directamente el borrador relacionado desde el aviso.
- Configurar y demostrar correo real en el ambiente de entrega. Un resultado SMTP aceptado no debe reportarse como entrega confirmada si no existe esa evidencia.
- Mantener el correo interno de alerta separado del correo de envío de una orden al proveedor.

### Ventanas de ventas y pronóstico

- Añadir selector de historial de 30/60/90 días para ventas y promedio diario.
- Calcular promedio incluyendo todos los días calendario del periodo, también los días con cero ventas.
- Basar el pronóstico solo en ventas, no en mermas ni ajustes.
- Añadir horizonte de pronóstico de 7/30/90 días.
- Retirar el visual pequeño de pronóstico de la tabla de Inventario y presentar el análisis en Dashboard.

### Importación de movimientos

- Crear importador Excel de movimientos con flujo de validación semejante al importador de productos.
- Columnas propuestas: código SKU, fecha, tipo (entrada/salida), motivo y cantidad.
- Recalcular stock al guardar movimientos válidos.
- Al importar un archivo que mezcla filas ya cargadas y nuevas, importar solo las nuevas y mostrar el resumen de filas agregadas y omitidas.
- Evitar que una reimportación incremente el stock dos veces.

### Dashboard por categorías

- Añadir pestaña Dashboard para React + Vite + Supabase.
- Reutilizar cálculos/datos existentes de base y pronóstico; no mantener una segunda implementación del modelo.
- Tarjetas superiores: agotados, bajo mínimo, valor total y costo del faltante.
- Barras horizontales de cobertura por categoría; al seleccionar una categoría, filtrar el Dashboard.
- Tabla “Requiere atención” con producto, categoría, stock, mínimo, cobertura, agotamiento estimado, sugerencia, costo del faltante, proveedor y acción de orden.
- Gráfica para producto seleccionado con ventas reales, estimación, banda de confianza, fecha de agotamiento y selector 7/30/90 días.
- Distribución del valor del inventario por categoría.
- Definir cobertura por producto como stock ÷ ventas diarias promedio de los últimos 30 días. Para categorías usar suma de stock ÷ suma de consumo diario, no promedio de coberturas.
- Sin ventas: mostrar “Sin rotación”, excluirlo de cobertura y reportar su valor inmovilizado aparte.
- Semáforo por producto: crítico (stock cero o cobertura <7 días), atención (bajo mínimo o cobertura 7–14 días), exceso (>90 días), saludable en el resto. No usar color como única señal.
- Categoría requiere atención si tiene un crítico o más de 25 % de sus productos en rojo/ámbar.
- Mostrar suma de faltantes × costo para priorizar productos dentro de cada estado.
- Respetar roles: Consulta ve; Compras/admin pueden generar órdenes. Diseñar estados vacíos y presentación móvil en tarjetas.
- Comparar números con Inventario y cubrir casos de consumo cero, categoría sin datos, stock cero y redondeo.

### Orden profesional en PDF

- Reemplazar/mejorar la vista imprimible actual con diseño profesional, paginación y tabla clara.
- Incluir nombre del negocio, RFC, dirección, logo si existe, folio/fechas, proveedor, líneas SKU/producto, cantidades, costos unitarios, subtotales, total, responsable y espacios para autorización/recepción.
- Usar datos reales de configuración. No inventar datos fiscales, moneda, impuestos ni condiciones comerciales que el negocio no haya proporcionado.

### Cierre de validación y demo

- Verificar permisos por rol en UI, RLS y RPC, incluida consulta de órdenes para `consulta` en modo lectura.
- Confirmar seed/cuenta demo en el entorno remoto, no solo en local.
- Documentar aplicación de migraciones, prueba de ciclo completo de orden, aceptación SMTP real y resultados cuantitativos del pronóstico.
- Repetir build y pruebas disponibles y documentar resultados vigentes antes de afirmar que la entrega está validada.

## 5. Fuera de alcance o no pendientes

- **Google Sheets/Teams:** se eliminó como requisito de esta entrega.
- **Compra mínima:** no se debe añadir al flujo actual.
- **Orden con varios proveedores:** no se permite; cada orden corresponde a un solo proveedor.
- **Crear automáticamente órdenes tras cada movimiento:** no se requiere; el reabastecimiento es manual desde alertas/producto.
- **“Perfeccionar alta y salidas” sin criterio específico:** se descartó como tarea independiente; ya están definidos y aplicados motivos por entrada/salida y SKU automático.

## 6. Requisitos académicos del PowerPoint (no son funciones de la aplicación)

La presentación pide preparar una entrega de producto con:

- Documentación: portada/resumen ejecutivo; problema, usuario, alcance y objetivos medibles; qué se heredó y qué se agregó; arquitectura, stack, decisiones y retos; datos/modelo y evaluación; resultados, métricas y pruebas con evidencia; seguridad/privacidad; limitaciones, conclusiones y referencias; manual con capturas; evidencias, repositorio y presentación PDF/enlace demo.
- Demo en vivo del producto funcionando, narrando tanto lo replicado como las nuevas aportaciones.
- Presentación para Equipo 4 indicada a las 3:30 p. m. y envío de documentación con límite general de 2:30 p. m. del día señalado en las diapositivas.
- **Duración inconsistente dentro del PowerPoint:** una diapositiva dice 15–20 minutos máximo para la presentación; otra propone una estructura de 10 minutos máximo. El equipo debe confirmar cuál pauta seguir con el profesor. No es una funcionalidad pendiente de la aplicación.

Estas instrucciones determinan la documentación y exposición académicas; no cambian por sí mismas el alcance del software.

## Fuentes internas

- [`PLAN_ENTREGA_FINAL.md`](PLAN_ENTREGA_FINAL.md): alcance aclarado y requisitos pendientes.
- [`ARQUITECTURA.md`](ARQUITECTURA.md): stack, datos, flujos y decisiones técnicas.
- [`AUDITORIA_INICIAL.md`](AUDITORIA_INICIAL.md): estado y capacidades del miniproyecto original al iniciar la ampliación.
- [`PLAN_AMPLIACION.md`](PLAN_AMPLIACION.md): fases de ampliación del nuevo equipo y validaciones faltantes.
