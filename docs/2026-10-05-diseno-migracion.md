# Diseño: migración a React (Vite) + Supabase

Proyecto 2 — Control Inteligente de Inventario y Alertas de Stock
Fecha: 5 de octubre de 2026 · Estado: **aprobado e implementado**

## 1. Objetivo

Pasar la aplicación de Flask + SQLite a React (Vite) + Supabase sin perder ninguna regla ni cambiar el aspecto. La diferencia principal es que el bot deja de depender de una computadora encendida: corre en la nube y avisa por correo aunque nadie tenga la página abierta.

La versión Flask no se modifica. Todo lo nuevo vive en `InventarioReact/`.

## 2. Decisiones aprobadas

| Tema | Decisión |
|---|---|
| Correo | Gmail de la escuela por SMTP, puerto **465** (SSL). Misma contraseña de aplicación. |
| Acceso | Login con Supabase Auth (correo y contraseña). Registro público apagado; los usuarios se crean en el panel. |
| Lenguaje | JavaScript en el frontend. La Edge Function va en TypeScript porque así corre en Supabase. |
| Carpeta | `InventarioReact/`, carpeta propia junto al proyecto Flask. |

Por qué el puerto 465: las Edge Functions bloquean las conexiones salientes a los puertos 25 y 587 ([límites oficiales](https://supabase.com/docs/guides/functions/limits)). El 465 no está bloqueado y Gmail lo acepta.

## 3. Cómo queda armado

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

Hay tres piezas y cada una tiene un solo trabajo:

- **Postgres** guarda los datos y hace cumplir las reglas (no negativos, código único, una alerta por episodio).
- **La Edge Function** es el bot: pide a Postgres la alerta nueva y manda el correo. Es la única pieza que conoce las credenciales.
- **React** muestra las pantallas. Solo conoce la URL del proyecto y la clave pública.

## 4. Estructura de carpetas

```
InventarioReact/
├── README.md                     pasos de instalación y guion para exponer
├── docs/                         este documento y el plan de implementación
├── supabase/
│   ├── config.toml               ajustes de la función
│   ├── migrations/
│   │   ├── 0001_tablas.sql       tablas y restricciones
│   │   ├── 0002_funciones.sql    funciones RPC, trigger y vistas
│   │   ├── 0003_seguridad.sql    RLS y permisos
│   │   └── 0004_cron.sql         programación del bot
│   ├── functions/revisar-inventario/
│   │   ├── index.ts              conecta la función con Supabase
│   │   ├── entrega.ts            lógica del bot y permiso de llamada, sin red (se puede probar)
│   │   ├── correo.ts             lee la configuración SMTP
│   │   └── smtp.ts               envía el correo
│   └── tests/
│       ├── preparar_local.sql    roles para probar en un Postgres normal
│       └── flujo.sql             pruebas de la base
├── web/                          frontend React + Vite
│   ├── public/inventario_ejemplo.xlsx
│   ├── tests/                    pruebas de Vitest
│   └── src/
│       ├── lib/                  supabase, api, dinero, validar, excel, pronostico, fechas, errores, avisos
│       ├── paginas/              Login, Inventario, Movimientos, Alertas
│       ├── componentes/          Encabezado, Resumen, Aviso, tabla y formularios
│       └── style.css             el mismo CSS de hoy, más login y ajustes de celular
└── herramientas/
    ├── migrar_sqlite.py          pasa inventario.db a un archivo .sql
    └── test_migrar.py            su prueba
```

## 5. Base de datos

### Tablas

**products**

| Columna | Tipo | Regla |
|---|---|---|
| id | bigint, identidad | llave primaria |
| codigo | text | obligatorio, **UNIQUE**, de 1 a 120 caracteres |
| nombre, categoria | text | obligatorios, de 1 a 120 caracteres |
| stock_actual, stock_minimo | integer | CHECK `>= 0` |
| costo | numeric(12,2) | CHECK `>= 0`, por defecto 0 |
| low_active | boolean | por defecto `false`; marca "ya se avisó de este episodio" |

**movements**

| Columna | Tipo | Regla |
|---|---|---|
| id | bigint, identidad | llave primaria |
| product_code, product_name | text | copia en texto; así el historial sobrevive si se borra el producto |
| tipo | text | CHECK `in ('entrada','salida')` |
| cantidad | integer | CHECK `> 0` |
| stock_anterior, stock_nuevo | integer | `stock_nuevo` CHECK `>= 0` |
| created_at | timestamptz | por defecto `now()` |

**alerts**

| Columna | Tipo | Regla |
|---|---|---|
| id | bigint, identidad | llave primaria |
| created_at | timestamptz | por defecto `now()` |
| items | jsonb | productos con faltante, costo unitario y costo de reposición |
| subject, body | text | asunto y cuerpo del correo, guardados al crear la alerta |
| status | text | CHECK `in ('pendiente','enviando','enviado','simulado','error')` |
| attempts | integer | por defecto 0 |
| last_attempt_at | timestamptz | puede ser nulo |
| error | text | puede ser nulo |

**settings**: `key text` (llave primaria) y `value text`. Hoy solo guarda `last_check`.

Dos cambios de tipo respecto a SQLite: las fechas pasan de texto a `timestamptz` y `items_json` (texto) pasa a `items` (jsonb). El costo pasa de REAL a `numeric(12,2)`, que no tiene errores de redondeo.

### Regla automática de recuperación (trigger)

Un trigger en `products` apaga `low_active` cada vez que una fila queda con `stock_actual >= stock_minimo`. Hoy esa regla está repetida en tres lugares del código Python (editar, movimiento e importar). Al ponerla en la base queda en un solo lugar y no se puede olvidar.

### Funciones RPC

| Función | Quién la llama | Qué hace |
|---|---|---|
| `registrar_movimiento(producto, tipo, cantidad)` | Usuario con sesión | Bloquea la fila del producto, calcula el stock nuevo, rechaza si quedaría negativo, actualiza el stock y guarda el movimiento. Todo en una transacción. |
| `importar_productos(items jsonb)` | Usuario con sesión | Inserta o actualiza todos los productos en una transacción. Si `costo` viene nulo, el producto nuevo queda en 0 y el existente conserva el suyo. Si una fila falla, no se guarda ninguna. |
| `crear_alerta_stock_bajo()` | Solo el bot | Toma un candado para que solo corra una revisión a la vez. Busca productos con `stock_actual < stock_minimo` y `low_active = false`, guarda `last_check`, y si encontró alguno crea **una** alerta con productos, asunto y cuerpo, y les pone `low_active = true`. Devuelve el id o nulo. |
| `reclamar_alerta(id)` | Solo el bot | Pasa la alerta a `enviando`, suma un intento y guarda la hora. Solo lo logra si estaba en `pendiente` o `error`, o si lleva más de 5 minutos en `enviando`. Evita que dos procesos manden el mismo correo. |

Los mensajes de error salen en español, iguales a los de hoy (por ejemplo: "La salida supera el stock disponible; el inventario no puede quedar negativo.").

### Vistas

- `resumen_inventario`: total de productos, cuántos están bajos, valor del inventario (Σ stock × costo), costo de reponer al mínimo y última revisión.
- `consumo_30d`: por código de producto, total de salidas de los últimos 30 días y fecha de la primera.

Crear, editar y eliminar productos se hace directo contra la tabla. Las restricciones y el trigger ya protegen los datos, así que no hace falta una función extra.

## 6. El bot en la nube

### Edge Function `revisar-inventario`

Acepta dos tipos de llamada:

- **Revisar** (sin datos): llama a `crear_alerta_stock_bajo()`. Si hay alerta nueva, la reclama y manda el correo. También envía las alertas que se hayan quedado en `pendiente`, es decir, las que nunca se intentaron.
- **Reintentar** (`alert_id`): reclama esa alerta y manda el correo que ya estaba guardado.

Resultado del envío, igual que hoy:

| Situación | Estado |
|---|---|
| No hay ningún secret SMTP | `simulado` |
| Faltan algunos secrets | `error`: "Configuración SMTP incompleta: faltan …" |
| El correo sale | `enviado` |
| Gmail rechaza o no responde | `error` con el motivo |

Las alertas en `error` **no** se reintentan solas, para no llenar de correos al destinatario. Se reintentan con el botón, como hoy.

### Quién puede llamarla

La función revisa a quien llama y rechaza todo lo demás:

1. **pg_cron**, que manda un encabezado con una clave secreta (`CRON_SECRET`), guardada en Vault del lado de la base y en los secrets del lado de la función.
2. **Un usuario con sesión iniciada**, cuando pulsa "Revisar inventario ahora" o "Reintentar envío".

La función lee la llave maestra de `SUPABASE_SECRET_KEYS` y, en proyectos anteriores, de `SUPABASE_SERVICE_ROLE_KEY`. Se despliega con `verify_jwt = false` porque ella misma revisa el permiso.

### Programación

`pg_cron` ejecuta cada minuto una llamada HTTP (`pg_net`) a la función. Es el mismo ritmo que el monitor actual (60 segundos). El README explica cómo cambiar el intervalo y cómo pausar el bot.

### Secrets de la función

`SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `ALERT_TO` y `CRON_SECRET`. Si alguien configura el puerto 25 o 587, la función responde con un error claro que explica que están bloqueados.

## 7. Seguridad

- **RLS activado en las cuatro tablas.** Sin sesión no se puede leer ni escribir nada.

| Tabla | Usuario con sesión | Bot (service role) |
|---|---|---|
| products | leer, crear, editar, eliminar | todo |
| movements | solo leer; se escriben únicamente por `registrar_movimiento` | todo |
| alerts | solo leer | todo |
| settings | solo leer | todo |

- `crear_alerta_stock_bajo` y `reclamar_alerta` solo las puede ejecutar el bot.
- La service role key y las credenciales SMTP viven únicamente en los secrets de Supabase. Nunca van en el frontend ni en Git.
- El frontend usa `web/.env.local` con la URL (`VITE_SUPABASE_URL`) y la clave pública (`VITE_SUPABASE_KEY`). Ese archivo se excluye de Git y se entrega un `.env.example`.
- El registro público queda apagado. Los usuarios se crean a mano en el panel: uno compartido o uno por integrante, con el mismo código.

## 8. Frontend

- **Librerías:** React, Vite, `react-router-dom`, `@supabase/supabase-js` y `exceljs` (leer y escribir .xlsx).
- **Pantallas:** Login, Inventario (`/`), Movimientos (`/movimientos`) e Historial de alertas (`/alertas`). Encabezado, resumen y avisos son los mismos en las tres.
- **Estilo:** se copia `style.css` tal cual (azul marino con acento dorado) y se agregan los estilos del login y ajustes para celular. En celular cada fila de las tablas se muestra como una tarjeta.
- **Inventario:** panel "Reabastecer primero", formulario de alta, importar, tabla con buscador, filtro de categoría y "Solo urgentes", y las acciones Movimiento, Editar y Eliminar en cada fila.
- **Después de cada acción** se vuelven a pedir los datos. No se usa tiempo real; no hace falta para este proyecto.
- **Pie de página:** el texto cambia, porque el bot ya no depende de que la aplicación esté abierta.

### Importar Excel

1. El navegador revisa que sea `.xlsx` y que pese 2 MB o menos.
2. Lee la primera hoja. La primera fila debe ser `codigo, nombre, categoria, stock_actual, stock_minimo, costo`, o el formato viejo sin `costo`.
3. Valida cada fila y junta los errores con su número ("Fila 3: …"). Un código repetido dentro del archivo es error. Las filas vacías se saltan.
4. Si hay algún error, muestra la lista y **no manda nada**.
5. Si todo está bien, manda la lista completa a `importar_productos`, que guarda todo o nada.

El costo acepta `12.50`, `12,50` y `$1,250.50`, con la misma regla de hoy: si hay punto, las comas son de miles; si no hay punto, la coma es decimal.

### Exportar Excel

Genera el archivo en el navegador con las mismas columnas, encabezado en negritas sobre azul y formato de moneda. Se puede volver a importar.

### Pronóstico

La base entrega el consumo de 30 días (`consumo_30d`) y una función pura en `pronostico.js` aplica las fórmulas de hoy:

- consumo diario = total de salidas ÷ días desde la primera salida (mínimo 1 día)
- días restantes = piso(stock ÷ consumo diario); sin salidas, "Sin consumo"
- sugerido = máx(mínimo − stock, techo(consumo × 14) − stock, 0)
- urgente = está bajo o le quedan 7 días o menos
- "Reabastecer primero" ordena por días restantes y, en empate, por qué tan lejos está del mínimo

## 9. Migración de datos

`herramientas/migrar_sqlite.py` usa solo la librería estándar de Python. Lee `inventario.db` y escribe `datos_migrados.sql`, que se pega en el SQL Editor de Supabase.

- Conserva ids, fechas, estados de alertas y la bandera `low_active`. Así el bot no vuelve a avisar de episodios que ya avisó.
- Corre en una sola transacción y se detiene si las tablas de destino ya tienen datos, para no duplicar.
- Hoy la base tiene 16 productos, 3 alertas y ningún movimiento.

## 10. Pruebas

Dos grupos:

- **Vitest** (`npm test` en `web/`): lógica del frontend y del correo.
- **SQL** (`supabase/tests/flujo.sql`): reglas de la base. Corre dentro de una transacción y termina en ROLLBACK, así que no deja datos de prueba.

| Prueba actual en `test_flow.py` | Dónde queda |
|---|---|
| Importación, actualización sin duplicados, error por fila | Vitest (validación) + SQL (todo o nada, sin duplicados) |
| Stock negativo y alerta nueva tras recuperarse | SQL |
| Correo fallido que se reintenta | Vitest (configuración incompleta) + SQL (reclamo e intentos) |
| Costos, valor del inventario y costo de reposición | Vitest (lectura del costo) + SQL (resumen y cuerpo del correo) |
| Excel viejo sin costo | Vitest (encabezado) + SQL (conserva el costo) |
| Pronóstico y orden de reabastecimiento | Vitest |
| Exportar y volver a importar | Vitest |
| Vistas web | Vitest con Testing Library (render de las tres pantallas) |
| Excel de ejemplo: 16 productos, 6 bajos | Vitest |
| Agregar columna `costo` a una base vieja | No aplica: la tabla nace con `costo` |
| Candado del monitor | Reemplazada por la prueba SQL de "una segunda revisión no crea otra alerta" |

## 11. Qué cambia respecto a Flask

1. **El candado del monitor desaparece.** Lo sustituye el candado dentro de `crear_alerta_stock_bajo()`.
2. **Alertas atoradas.** Una alerta con más de 5 minutos en `enviando` se puede reintentar, y el bot envía las que quedaron en `pendiente`. Hoy ambas se quedarían así para siempre.
3. **Intervalo.** Pasa de `CHECK_INTERVAL_SECONDS` a la expresión de pg_cron (un minuto por defecto).
4. **Fechas.** Se guardan con zona horaria y se muestran en la hora local del navegador.

## 12. Fuera de alcance

- Publicar el frontend en internet. Se corre en Windows con `npm run dev`.
- Avisos por Teams.
- Roles distintos por usuario: todos los que inician sesión pueden hacer lo mismo.
- Actualización en tiempo real entre navegadores.

## 13. Fases y cómo se comprueba cada una

| Fase | Entregable | Cómo se comprueba |
|---|---|---|
| 1. Base de datos | `0001_tablas.sql` | Se aplica sin errores; un stock negativo y un código repetido son rechazados |
| 2. Funciones | `0002_funciones.sql`, `0003_seguridad.sql`, `tests/flujo.sql` | Las pruebas SQL pasan |
| 3. El bot | Edge Function y `0004_cron.sql` | Vitest del correo pasa; en su proyecto llega un correo real con la página cerrada |
| 4. Frontend | `web/` | `npm test` pasa; recorrido manual en computadora y celular |
| 5. Datos | `migrar_sqlite.py` | Los 16 productos y las 3 alertas aparecen en Supabase |
| 6. Documentación | `README.md` con guion | Un integrante sigue los pasos desde cero |

Las pruebas SQL y de Vitest se corren antes de entregar cada fase. Lo único que solo se puede confirmar en el proyecto real de Supabase es el despliegue de la función, el cron y la llegada del correo.

## 14. Riesgos

- **Proyecto en pausa.** Hasta donde sé, el plan gratuito de Supabase pausa los proyectos tras varios días sin actividad. Conviene entrar al panel un día antes de la presentación.
- **Contraseña de aplicación.** Si la escuela desactiva las contraseñas de aplicación, el plan B es Resend; solo habría que cambiar `correo.ts`.
- **Correo a la bandeja de spam.** Es posible con la primera alerta. Conviene mandar una de prueba antes de exponer.
