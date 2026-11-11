# Evidencia de alertas

## Estado verificable en este checkout

No hay credenciales SMTP ni acceso a un proyecto Supabase configurado en el entorno. Por ello no se han enviado tres correos reales y no se inventan IDs, estados de entrega ni tiempos. El modo por defecto sin SMTP queda registrado como `simulado` y la aplicación lo muestra explícitamente.

## Evidencia que registra la aplicación

Para cada intento se conservan destinatario, ID del mensaje cuando lo devuelve SMTP, estado (`pendiente`, `enviado`, `entregado`, `rebotado`, `fallido` o `simulado`), fecha del intento y contador de reintentos. La hora de detección está en `alerts.created_at`; el tiempo de detección a aceptación se calcula como `sent_at - created_at`.

La conexión SMTP solo confirma aceptación del mensaje por el servidor. No hay webhook de entrega implementado, así que `entregado` y `rebotado` no se asignan sin una señal verificable del proveedor. Tasa de entrega confirmada: **no disponible** hasta conectar un servicio con webhook.

## Cómo completar la evidencia real

Sigue `docs/CONFIGURAR_CORREO.md`, ejecuta la prueba en un proyecto privado y copia tres filas del historial sin correos personales en una tabla con fecha, ID de mensaje redactado si es sensible, estado SMTP, reintentos y segundos desde detección. Después recalcula las métricas desde esos registros; no cuentes `simulado` como entregado.

| # | Fecha | ID de mensaje | Destinatario redactado | Estado SMTP | Segundos detección→envío |
|---:|---|---|---|---|---:|
| 1 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| 2 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| 3 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
