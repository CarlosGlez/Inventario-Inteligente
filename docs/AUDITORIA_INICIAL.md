# Auditoría inicial

Fecha: 2026-11-11  
Rama de trabajo: `feature/ampliacion-equipo4`  
Repositorio remoto declarado: `https://github.com/CarlosGlez/Inventario-Inteligente`

## Estado inicial

- El checkout local coincide con el remoto `origin/main` y estaba limpio antes de crear la rama de trabajo.
- La rama `feature/ampliacion-equipo4` se creó para aislar la ampliación.
- No se modificó código de la aplicación durante esta auditoría.
- No hay `web/node_modules`, `.env`, `.env.local` ni `.env.example` en el checkout.
- Al inicio `npm` no estaba en PATH y el alias `python.exe` de Windows no podía ejecutar el intérprete. Se localizó Node.js v26.13.1 y npm dentro de `C:\\Program Files\\nodejs`; la instalación con `npm ci` requiere acceso al registro y caché de npm, bloqueado por el sandbox en el primer intento. Se reintentó con autorización escalada y el resultado se registrará en `docs/RESULTADOS.md`.
- No se reportan pruebas como aprobadas antes de ejecutarlas. Python y Docker daemon no están disponibles en este entorno.
- No hay configuración local que permita comprobar un proyecto Supabase desplegado, el scheduler remoto ni la entrega de correo.

## Mapa del repositorio

| Ruta | Responsabilidad |
|---|---|
| `web/src/` | Aplicación React, pantallas de inventario/movimientos/alertas y lógica cliente |
| `web/tests/` | Pruebas Vitest de lógica, pantallas, Excel, correo y validación |
| `supabase/migrations/` | Esquema Postgres, funciones RPC, RLS y tareas programadas |
| `supabase/functions/revisar-inventario/` | Edge Function Deno/TypeScript para autorizar, revisar, redactar y entregar alertas/reporte |
| `supabase/tests/` | Pruebas SQL de flujo de base de datos |
| `herramientas/` | Migración desde SQLite/Flask y sus pruebas Python |
| `docs/` | Diseño y plan previo existentes |

## Stack y arquitectura observados

- Frontend: JavaScript, React 19, React Router 7 y Vite 8. Las versiones exactas declaradas están en `web/package.json`; el lockfile fija dependencias.
- Base de datos y autenticación: Supabase (Postgres y Supabase Auth), con RLS y funciones SQL `security definer`.
- Backend automatizado: Supabase Edge Function en TypeScript/Deno. Envío SMTP con Nodemailer.
- Scheduler: `pg_cron` llama a la función mediante `pg_net` cada minuto. Un reloj semanal separado genera el reporte.
- Hosting configurado: Vercel mediante `web/vercel.json` (fallback SPA). No se pudo verificar un despliegue activo.
- Integración externa actual: SMTP configurable con secretos del servicio; si no se configura, las alertas se guardan como `simulado`.

## Flujos y lógica existentes

- Inicio de sesión: Supabase Auth. La aplicación usa el rol común `authenticated`; no se encontró una tabla de perfiles/roles por usuario.
- Inventario: tabla `products`; movimientos en `movements`; alertas y reportes en `alerts`; marcas auxiliares en `settings`.
- Entradas/salidas: RPC `registrar_movimiento`; movimientos solo aceptan `entrada` y `salida`. Aún no distinguen venta, merma o ajuste.
- Pronóstico: `web/src/lib/pronostico.js` agrega a productos el consumo obtenido de la vista SQL `consumo_30d`; la documentación describe consumo diario usando las salidas de los últimos 30 días. Esta regla se conservará como baseline.
- Alertas: `crear_alerta_stock_bajo()` registra una alerta por episodio bajo; `low_active` evita duplicados hasta la recuperación del stock. `reclamar_alerta()` previene entregas concurrentes. Estados actuales: pendiente, enviando, enviado, simulado y error.
- Correo: la Edge Function valida secreto de cron o token Supabase, procesa alertas pendientes y usa SMTP si están todos los secretos requeridos. El historial guarda intentos y error, pero no evidencia de webhooks ni ID de proveedor.
- Seguridad: RLS y permisos separan usuarios autenticados del `service_role`; todo usuario autenticado tiene permisos de inventario semejantes. No hay autorización por rol de negocio.

## Pruebas y operación inicial

- Web: `cd web; npm test` (Vitest), pruebas de proyecto declaradas en `web/tests/`.
- Build: `cd web; npm run build`.
- Migrador: `python -m unittest herramientas/test_migrar.py`.
- Base de datos: ejecutar `supabase/tests/flujo.sql` desde Supabase SQL Editor; no se ejecutó porque no hay conexión/configuración de proyecto disponible.
- Resultado observado en este entorno: pruebas web bloqueadas por ausencia de Node/npm; pruebas Python bloqueadas por el alias de Windows sin intérprete. No se pudo levantar la app.

## Deuda técnica, brechas y riesgos

1. La lógica heredada no clasifica el motivo de salidas; agregar ventas requiere migración aditiva y compatibilidad con datos ya existentes.
2. El forecast solo usa una agregación de 30 días; no existe pipeline de evaluación temporal ni datos históricos sintéticos.
3. Las alertas no están asociadas a proveedor, deduplicación temporal configurable, orden de compra ni confirmación del proveedor.
4. Los estados de correo no equivalen a confirmación de entrega; SMTP permite registrar aceptación/respuesta, no necesariamente entrega final.
5. La autenticación no incluye roles de negocio ni usuarios demo sembrados. El alta actual depende del panel Supabase.
6. No existe configuración aislada de integración Sheets/Teams; habrá que escoger una opción compatible sin secretos en Git.
7. No fue posible confirmar ejecución, cobertura, lint ni métricas iniciales por ausencia del runtime. Las cifras deberán generarse cuando haya toolchain disponible.
8. La rama necesita permiso de escritura de metadatos en `.git`; se creó con autorización escalada. La rama `main` no se modificó.

## Archivos previstos por fase

| Fase | Archivos/rutas que probablemente se modificarán |
|---|---|
| 1. Arquitectura y stack | `docs/ARQUITECTURA.md`, `README.md` |
| 2. Ventas y pronóstico | nuevas migraciones SQL, `web/src/lib/pronostico.js` y módulos nuevos, paneles/componentes, scripts reproducibles y pruebas web |
| 3. Alertas/proveedores | migraciones SQL, `supabase/functions/revisar-inventario/`, pantallas de alertas, `.env.example`, documentación y pruebas |
| 4. Órdenes de compra | migraciones SQL, API/pantallas React, plantillas de correo/exportación, pruebas |
| 5. Roles y demo | migraciones SQL/políticas RLS, gestión de sesión/usuarios en web, semilla documentada y pruebas de permisos |
| 6. Integración opcional | módulo de integración, configuración de entorno, pruebas mock y guía |
| 7. Entrega | `CHANGELOG.md`, `docs/MAPEO_REQUERIMIENTOS.md`, `docs/RESULTADOS.md`, `docs/GUION_DEMO.md`, revisión del README y resultados reales de pruebas |

## Decisiones iniciales

- Se conserva React/Vite, Supabase/Postgres, Auth, Edge Functions y `pg_cron`; la auditoría no encontró una razón que justifique cambiar el stack.
- Se mantendrán salidas históricas sin motivo como movimientos heredados. Una migración aditiva asignará un tipo compatible y permitirá marcar las nuevas salidas de venta sin reinterpretar silenciosamente el pasado.
- Las métricas de pronóstico se producirán con datos sintéticos reproducibles claramente etiquetados; no se presentarán como resultados de ventas reales.
- La tasa de entrega real solo se reportará si existe proveedor con evidencia verificable; en modo local se distinguirá simulación/aceptación SMTP de entrega confirmada.
- El demo usará datos ficticios y su seed se diseñará para ser explícito y repetible. No se publicarán contraseñas de cuentas reales; las credenciales de demo se documentarán como tales.
