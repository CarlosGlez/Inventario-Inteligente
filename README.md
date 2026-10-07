# Control inteligente de inventario y alertas de stock

Proyecto 2 · versión **React (Vite) + Supabase**.

Un bot revisa el inventario cada minuto, detecta los productos por debajo de su stock mínimo y avisa por correo. La página permite administrar productos, registrar entradas y salidas, importar y exportar Excel, y estima cuándo se agotará cada producto.

Es la misma aplicación que la versión Flask + SQLite, con una diferencia importante: **el bot vive en la nube**. Ya no hace falta dejar una computadora encendida.

## Cómo está armado

```
 Navegador (React)                    Supabase
┌──────────────────┐        ┌──────────────────────────────────┐
│ Login            │─sesión─▶ Auth                             │
│ Inventario       │─datos──▶ Postgres: tablas + RLS + RPC     │
│ Movimientos      │        │      ▲                  ▲        │
│ Alertas          │─botón──▶ Edge Function ──────────┘        │
└──────────────────┘        │  "revisar-inventario" ──SMTP 465─┼──▶ Gmail
                            │      ▲                           │
                            │ pg_cron (cada minuto) + pg_net   │
                            └──────────────────────────────────┘
```

| Carpeta | Qué contiene |
|---|---|
| `supabase/migrations/` | Los cuatro archivos SQL que crean la base, sus reglas, la seguridad y el reloj del bot |
| `supabase/functions/revisar-inventario/` | El bot (Edge Function) |
| `supabase/tests/` | Pruebas de la base de datos |
| `web/` | La página (React + Vite) |
| `herramientas/` | Script para pasar los datos de la versión Flask |
| `docs/` | Diseño y plan de implementación |

## Requisitos

- Windows 10 u 11 con [Node.js](https://nodejs.org) 20 o superior.
- Una cuenta gratuita en [supabase.com](https://supabase.com).
- Para correos reales: la cuenta de Gmail de la escuela con una **contraseña de aplicación**.
- Python 3, solo si vas a migrar los datos de la versión Flask.

## Puesta en marcha

Son ocho pasos. Los primeros seis se hacen una sola vez.

### 1. Crear el proyecto en Supabase

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) y crea un proyecto nuevo.
2. Elige una contraseña para la base de datos y guárdala.
3. Espera a que el proyecto termine de prepararse.

### 2. Crear las tablas, las funciones y la seguridad

En el panel abre **SQL Editor**. Para cada archivo, en este orden, pega su contenido completo y pulsa **Run**:

1. `supabase/migrations/0001_tablas.sql`
2. `supabase/migrations/0002_funciones.sql`
3. `supabase/migrations/0003_seguridad.sql`

El `0004_cron.sql` se corre más adelante, en el paso 6.

**Comprobación (opcional):** pega `supabase/tests/flujo.sql` y pulsa Run. Debe responder `TODAS LAS PRUEBAS PASARON`. No deja datos: todo se deshace al terminar.

### 3. Crear el usuario del equipo

1. En **Authentication → Users**, pulsa **Add user → Create new user**. Escribe un correo y una contraseña y marca la opción de confirmar al usuario automáticamente.
2. Pueden crear un usuario compartido o uno por integrante.
3. En **Authentication → Sign In / Providers**, apaga **Allow new users to sign up**. Así nadie más puede registrarse.

### 4. Desplegar el bot

Abre PowerShell en la carpeta `InventarioReact` y ejecuta:

```powershell
npx supabase login
npx supabase link --project-ref TU-PROJECT-REF
npx supabase functions deploy revisar-inventario
```

El *project ref* es la parte de la dirección de tu proyecto: en `https://abcdxyz.supabase.co` es `abcdxyz`.

Si el último comando pide Docker, repítelo agregando `--use-api`.

**Alternativa sin instalar nada:** en el panel, **Edge Functions → Deploy a new function → Via Editor**. Nombra la función `revisar-inventario`, crea los cuatro archivos (`index.ts`, `entrega.ts`, `correo.ts`, `smtp.ts`) con el contenido de `supabase/functions/revisar-inventario/` y despliega. Después, en los detalles de la función, **desactiva la verificación de JWT**. Por esta vía ese ajuste no se toma de `config.toml`.

> Desactivar esa verificación no deja la función abierta. Ella misma revisa quién llama y responde 401 a todo lo que no sea el reloj del bot o un usuario con sesión.

### 5. Configurar los secrets del bot

En **Edge Functions → Secrets** agrega:

| Secret | Valor |
|---|---|
| `CRON_SECRET` | Una clave larga inventada por ustedes. Guárdala: se usa otra vez en el paso 6 |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | La cuenta de Gmail que envía |
| `SMTP_PASSWORD` | La **contraseña de aplicación** de esa cuenta, no la contraseña normal |
| `SMTP_FROM` | La misma cuenta de Gmail |
| `ALERT_TO` | El correo que recibe las alertas |

Para generar un `CRON_SECRET` en PowerShell:

```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

**Modo de demostración:** si no agregas ningún secret `SMTP_…` ni `ALERT_TO`, el bot funciona igual pero no envía correos. Cada alerta queda como **"Simulado: no enviado"**, con el correo redactado para que se pueda mostrar.

**Por qué el puerto 465:** Supabase bloquea los puertos 25 y 587 en las Edge Functions. El 465 sí está permitido y Gmail lo acepta.

### 6. Programar el bot

En **SQL Editor**, guarda dos datos en Vault (el almacén cifrado de Supabase). Cambia los dos valores:

```sql
select vault.create_secret('https://TU-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('EL-MISMO-VALOR-QUE-CRON_SECRET', 'cron_secret');
```

Después pega `supabase/migrations/0004_cron.sql` y pulsa Run.

**Comprobación:** espera un minuto y ejecuta:

```sql
select created, status_code, content from net._http_response order by created desc limit 5;
```

- `200` → el bot está funcionando.
- `401` → el valor de `cron_secret` en Vault no es igual al secret `CRON_SECRET`.
- `404` → la función no está desplegada o `project_url` está mal escrito.

El mismo archivo `0004_cron.sql` trae comentados los comandos para pausar el bot, cambiar el intervalo o quitarlo.

### 7. Correr la página en Windows

```powershell
cd web
Copy-Item .env.example .env.local
```

Abre `web\.env.local` y llena los dos datos. Están en el panel, en **Project Settings → API Keys** (o en el botón **Connect**):

- `VITE_SUPABASE_URL`: la dirección del proyecto.
- `VITE_SUPABASE_KEY`: la clave **publicable** (empieza con `sb_publishable_`). En proyectos anteriores se llama `anon`.

Luego:

```powershell
npm install
npm run dev
```

Abre `http://localhost:5173` e inicia sesión con el usuario del paso 3.

Para llenar el inventario rápido, usa **Descargar Excel de ejemplo** y después **Importar archivo**. Trae 16 productos, seis de ellos con stock bajo.

### 8. Pasar los datos de la versión Flask (opcional)

Desde la carpeta `InventarioReact`:

```powershell
py herramientas\migrar_sqlite.py RUTA\a\inventario.db
```

Se crea `datos_migrados.sql`. Pega su contenido en **SQL Editor** y pulsa Run.

- Conserva productos, movimientos, alertas y la marca de "ya avisado", para que el bot no repita avisos viejos.
- Si las tablas ya tienen datos, se detiene sin cambiar nada. Hazlo antes de capturar productos nuevos.

## Dónde vive cada clave

| Clave | Dónde está | Quién la puede ver |
|---|---|---|
| Clave publicable | `web/.env.local` | Cualquiera. Sin sesión no permite leer ni escribir nada |
| Llave maestra (secret / service role) | Solo dentro de Supabase | Nadie fuera de Supabase. El bot la recibe automáticamente |
| Credenciales SMTP y `CRON_SECRET` | Secrets de la Edge Function y Vault | Solo el bot |

Nunca pongas la llave maestra ni la contraseña del correo en `web/` ni en Git. `web/.env.local` ya está en `.gitignore`.

## Pruebas

| Qué prueba | Cómo se corre | Cuántas |
|---|---|---|
| Lógica de la página y del bot | `cd web` y luego `npm test` | 114 |
| Reglas de la base de datos | Pegar `supabase/tests/flujo.sql` en SQL Editor | 22 |
| Migración de datos | `py -m unittest herramientas\test_migrar.py` | 7 |

Cubren lo mismo que las pruebas de la versión Flask: importación de todo o nada, códigos sin duplicar, stock que nunca queda negativo, una alerta por episodio, alerta nueva tras recuperarse, reintento de correos fallidos, costos y pronóstico.

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| La página dice **"Falta configurar Supabase"** | No existe `web/.env.local` o le falta un dato. Después de editarlo, detén y vuelve a ejecutar `npm run dev` |
| **"Correo o contraseña incorrectos"** | El usuario no existe en Authentication → Users, o no quedó confirmado |
| **"La función revisar-inventario todavía no está desplegada"** | Falta el paso 4 |
| La alerta queda en **Error de envío** con "Username and Password not accepted" | `SMTP_PASSWORD` debe ser una contraseña de aplicación. Si la escuela las tiene desactivadas, hay que pedirla al administrador |
| Error **"El puerto 587 está bloqueado"** | Cambia el secret `SMTP_PORT` a `465` |
| Error **"Configuración SMTP incompleta: faltan …"** | Agrega los secrets que menciona el mensaje, o quítalos todos para usar el modo de demostración |
| La **Última revisión** no avanza | Revisa el paso 6. La consulta de comprobación dice si es `401` o `404` |
| El proyecto no responde después de varios días sin usarse | El plan gratuito pausa los proyectos inactivos. Entra al panel y reactívalo. Conviene hacerlo un día antes de exponer |
| Se cambiaron los secrets y sigue igual | Los secrets nuevos aplican de inmediato; pulsa **Reintentar envío** en la alerta |
| `npm install` tarda mucho o falla con errores `EPERM` | La carpeta está dentro de OneDrive, que intenta sincronizar miles de archivos de `node_modules`. Pausa la sincronización de OneDrive mientras instalas, o copia el proyecto a una carpeta fuera de OneDrive, por ejemplo `C:\proyectos` |
| `npm install` avisa de **2 moderate severity vulnerabilities** | Vienen de `uuid`, una dependencia de la librería de Excel. El fallo está en funciones (`v3`, `v5`, `v6`) que esta librería no usa; solo usa `v4`. No ejecutes `npm audit fix --force`: instala una versión antigua de la librería de Excel |

**Límite conocido:** la página carga hasta 1000 productos por consulta, que es el máximo por defecto de Supabase. Para un inventario mayor habría que agregar paginación.

## Explicación sencilla de cada pieza

- **Tablas (`0001`).** Guardan productos, movimientos, alertas y ajustes. Las reglas que nunca se rompen están aquí: sin negativos, código único y costo con dos decimales.
- **Funciones (`0002`).** Son las operaciones delicadas. Cada una corre completa o no corre:
  - `registrar_movimiento` bloquea el producto mientras cambia el stock, así dos salidas simultáneas no lo dejan negativo.
  - `importar_productos` guarda todo el Excel o nada.
  - `crear_alerta_stock_bajo` crea una sola alerta por episodio y redacta el correo.
  - `reclamar_alerta` aparta la alerta antes de enviarla, para que no salga un correo doble.
- **Episodios.** Cada producto tiene una marca `low_active`. Al avisar se enciende; mientras esté encendida no se repite el aviso. Cuando el stock vuelve al mínimo se apaga sola (un trigger), y si vuelve a caer se avisa otra vez.
- **Seguridad (`0003`).** RLS activado en las cuatro tablas. Sin sesión no se ve nada. Con sesión se administra el inventario, pero movimientos y alertas solo se leen.
- **El bot.** `pg_cron` es un reloj dentro de la base. Cada minuto llama a la Edge Function, que pide la alerta nueva, manda el correo y guarda el resultado.
- **La parte inteligente.** Con las salidas de los últimos 30 días se calcula el consumo diario. De ahí salen los días que le quedan a cada producto y cuánto conviene comprar para cubrir el mínimo o 14 días.
- **La página.** React solo muestra y pide. Valida el Excel antes de enviarlo y calcula el pronóstico con los datos que entrega la base.

## Guion breve para exponer

1. Inicia sesión. Importa el Excel de ejemplo. Señala los contadores, un producto resaltado y el panel **Reabastecer primero**.
2. Pulsa **Revisar inventario ahora**. En el historial aparece la alerta, con el correo generado y su estado.
3. Revisa otra vez: el historial no crece, porque no se repite el mismo aviso.
4. Da entrada a un producto hasta alcanzar su mínimo. Luego registra una salida para dejarlo bajo otra vez.
5. Revisa de nuevo: aparece una alerta nueva para esa nueva caída.
6. Intenta una salida mayor que el stock: se rechaza.
7. Importa un Excel con una fila mala: no se guarda ninguna y el mensaje dice qué fila corregir.
8. Cierra la página, cambia un stock desde el panel de Supabase y espera un minuto: el correo llega aunque nadie tenga la página abierta.
9. Abre la página en el celular para mostrar la vista de tarjetas.

## Qué cambió respecto a la versión Flask

- El monitor local (`monitor.py`) y su candado se sustituyen por `pg_cron` y un candado dentro de la base.
- El intervalo ya no es `CHECK_INTERVAL_SECONDS`: se cambia con el comando que trae `0004_cron.sql`.
- Una alerta atorada más de 5 minutos en **Enviando** se puede reintentar. Antes se quedaba así.
- Las fechas se guardan con zona horaria y se muestran en la hora local del navegador.
- En celular, cada fila de la tabla se muestra como una tarjeta.
