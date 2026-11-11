# Configurar correo real

La Edge Function actual usa SMTP TLS y requiere los secretos del servicio Supabase. Copia el esquema de `supabase/functions/.env.example` al almacén **Edge Functions → Secrets**. No pongas secretos en `web/.env.local`, commits ni en el frontend.

1. Configura `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `ALERT_TO` y `APP_URL` (origen público/privado de la app; es necesario para enlazar órdenes).
2. Para Gmail, usa contraseña de aplicación. El puerto 25/587 no está soportado en este despliegue; se usa TLS directo en 465.
3. Mantén `DEMO_MODE=true` para cualquier demo pública. La función no enviará correos, aunque SMTP esté configurado.
4. Para una prueba privada y autorizada, establece temporalmente `DEMO_MODE=false`, limita `ALERT_TO` a una bandeja controlada y vuelve a desplegar la Edge Function.
5. Define en PowerShell la URL, clave pública y token de sesión de una cuenta admin. El script manda un mensaje de prueba a `ALERT_TO`, lo registra en el historial y limita el envío a uno cada cinco minutos:

   ```powershell
   $env:SUPABASE_URL = 'https://TU-PROJECT-REF.supabase.co'
   $env:SUPABASE_ANON_KEY = 'TU_CLAVE_PUBLICA'
   $env:SUPABASE_ACCESS_TOKEN = 'TOKEN_DE_SESION_DE_UN_USUARIO_AUTORIZADO'
   .\scripts\probar_correo.ps1
   ```

6. Revisa el historial. `message_id`, `recipient`, `sent_at` y `delivery_status=enviado` significan que el servidor SMTP aceptó el mensaje. No significan confirmación de que llegó a la bandeja. La interfaz no etiqueta aceptación SMTP como `entregado`.

Para recopilar tres aceptaciones distintas, ejecuta el comando tres veces dejando al menos cinco minutos entre llamadas. Registra cada ID/fecha/destinatario en `docs/EVIDENCIA_ALERTAS.md` sin publicar direcciones personales.

`scripts/probar_correo.ps1` no genera ni guarda credenciales. El token se pasa solo por variable de entorno en la sesión actual. El destinatario de pruebas se controla con `ALERT_TO`. Las órdenes se pueden enviar manualmente a proveedores con rol compras/admin; con `DEMO_MODE=true` permanecen simuladas.
