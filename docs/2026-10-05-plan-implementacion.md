# Plan de implementación: migración a React (Vite) + Supabase

> **Para quien ejecute el plan:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans, tarea por tarea. Los pasos usan casillas (`- [ ]`) para llevar el avance.

**Objetivo:** Reproducir la aplicación Flask de inventario en React (Vite) + Supabase, con el bot de alertas corriendo en la nube.

**Arquitectura:** Postgres guarda los datos y hace cumplir las reglas con restricciones, un trigger y funciones RPC. Una Edge Function crea la alerta y manda el correo; `pg_cron` la llama cada minuto. React muestra las pantallas y solo conoce la URL y la clave pública.

**Tecnologías:** Supabase (Postgres, Auth, Edge Functions, pg_cron, pg_net, Vault), React 18+, Vite, react-router-dom, @supabase/supabase-js, exceljs, Vitest, Testing Library, nodemailer (dentro de la Edge Function), Python 3 estándar (migración de datos).

**Diseño:** `docs/2026-10-05-diseno-migracion.md`. Este plan lo implementa; quien ejecute lee ambos.

## Cambios hechos durante la ejecución

El plan se ejecutó completo. Estas son las decisiones que se apartaron de lo escrito abajo:

- **`smtp.ts`.** El envío por SMTP quedó en su propio archivo con import estático, no dentro de `correo.ts` con import dinámico. Supabase necesita ver la librería al empaquetar.
- **`manejar()` en `entrega.ts`.** La entrada HTTP (CORS, 401, 404, 500) se movió ahí para poder probarla; `index.ts` solo conecta dependencias.
- **Llave maestra.** Se lee de `SUPABASE_SECRET_KEYS` y, si no existe, de `SUPABASE_SERVICE_ROLE_KEY`.
- **`VITE_SUPABASE_KEY`.** Sustituye a `VITE_SUPABASE_ANON_KEY`, porque Supabase ahora la llama clave publicable.
- **Archivos extra.** `web/src/lib/avisos.js` y los componentes `Pagina` y `DiasRestantes`.
- **Celular.** Las tablas se muestran como tarjetas a 760 px o menos; el formulario de cada fila ya no se recorta.
- **Aviso a la vista.** La página se desplaza al aviso cuando aparece.
- **Commits.** Los comandos se entregaron juntos al final, uno por fase.

---

## Restricciones globales

- Raíz del proyecto: `InventarioReact/`. La versión Flask (`control-inteligente-inventario/`) no se modifica; solo se lee.
- Toda la interfaz y todos los mensajes de error van en español, con el mismo texto que la versión Flask.
- Tablas: `products`, `movements`, `alerts`, `settings`. `codigo` UNIQUE, CHECK `>= 0` en stocks y costo, `costo numeric(12,2)`.
- Un producto está bajo cuando `stock_actual < stock_minimo`. La igualdad no cuenta.
- Estados de alerta: `pendiente`, `enviando`, `enviado`, `simulado`, `error`.
- Constantes: ventana de consumo 30 días, cobertura 14 días, urgente con 7 días o menos, reclamo de `enviando` tras 5 minutos, Excel de 2 MB como máximo, textos de 120 caracteres como máximo, listados de 200 filas.
- Correo por SMTP en el puerto 465. Los puertos 25 y 587 se rechazan con un mensaje claro.
- Frontend en JavaScript; Edge Function en TypeScript. Node 20 o superior.
- La service role key y las credenciales SMTP nunca aparecen en `web/` ni en Git. `web/.env.local` va en `.gitignore`.
- La carpeta entregada no lleva `node_modules`. Carlos corre `npm install` en Windows.
- Nadie ejecuta `git` por Carlos. Al cerrar cada fase se le entregan los comandos listos.

## Entorno de verificación

- **SQL:** Postgres 16 local. `supabase/tests/preparar_local.sql` crea los roles que Supabase ya trae (`anon`, `authenticated`, `service_role`). Se aplican las migraciones 0001 a 0003 y después `supabase/tests/flujo.sql`.
- **JavaScript:** `npm test` dentro de `web/`.
- **Solo en el proyecto real de Supabase:** despliegue de la función, `0004_cron.sql` y llegada del correo.

Comando SQL de referencia (desde `InventarioReact/`):

```bash
psql -v ON_ERROR_STOP=1 -d inventario_test \
  -f supabase/tests/preparar_local.sql \
  -f supabase/migrations/0001_tablas.sql \
  -f supabase/migrations/0002_funciones.sql \
  -f supabase/migrations/0003_seguridad.sql \
  -f supabase/tests/flujo.sql
```

Pasa cuando la última línea de la salida es `TODAS LAS PRUEBAS PASARON` seguida de `ROLLBACK`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0001_tablas.sql` | Las cuatro tablas, restricciones e índices |
| `supabase/migrations/0002_funciones.sql` | Trigger de recuperación, `dinero()`, funciones RPC y vistas |
| `supabase/migrations/0003_seguridad.sql` | RLS, políticas y permisos |
| `supabase/migrations/0004_cron.sql` | Extensiones y tarea programada del bot |
| `supabase/tests/preparar_local.sql` | Roles de Supabase para probar en un Postgres normal |
| `supabase/tests/flujo.sql` | Pruebas de la base; termina en ROLLBACK |
| `supabase/config.toml` | Apaga `verify_jwt` para la función |
| `supabase/functions/revisar-inventario/correo.ts` | Leer la configuración SMTP y enviar |
| `supabase/functions/revisar-inventario/entrega.ts` | Lógica pura del bot (sin Deno ni red) |
| `supabase/functions/revisar-inventario/index.ts` | Servidor HTTP: CORS, permiso de llamada y conexión a la base |
| `web/src/lib/dinero.js` | Leer y dar formato a importes |
| `web/src/lib/validar.js` | Validar un producto y las filas de un Excel |
| `web/src/lib/excel.js` | Leer, crear y descargar .xlsx |
| `web/src/lib/pronostico.js` | Consumo, días restantes, sugerido y prioridad |
| `web/src/lib/fechas.js` | Mostrar fechas en hora local |
| `web/src/lib/errores.js` | Traducir errores de Supabase a mensajes |
| `web/src/lib/supabase.js` | Cliente de Supabase |
| `web/src/lib/api.js` | Todas las llamadas a Supabase |
| `web/src/App.jsx`, `web/src/main.jsx` | Sesión, rutas y marco común |
| `web/src/paginas/*.jsx` | Login, Inventario, Movimientos, Alertas |
| `web/src/componentes/*.jsx` | Encabezado, Resumen, Aviso, Prioridad, FormularioProducto, ImportarExcel, TablaProductos |
| `web/src/style.css` | CSS actual más login y ajustes de celular |
| `web/tests/*.test.js(x)` | Pruebas de Vitest |
| `herramientas/migrar_sqlite.py`, `herramientas/test_migrar.py` | SQLite a `.sql` y su prueba |
| `README.md`, `.gitignore`, `web/.env.example` | Documentación y configuración |

## Puntos de revisión

Situaciones que el diseño implica pero no nombra. Cada una tiene su prueba en la tarea indicada.

1. **Celdas de Excel que no son texto simple** (fórmulas, texto enriquecido, números guardados como texto). Se espera que se lea el valor calculado. → Tarea 6.
2. **Números fuera de rango** (stock mayor a 2 147 483 647 o costo mayor a 9 999 999 999.99). Se espera un mensaje de validación, no un error crudo de la base. → Tarea 5.
3. **Gmail no responde.** Se espera que el envío se corte a los 15 segundos y la alerta quede en `error`, no en `enviando`. → Tarea 4.
4. **Sesión vencida o sin internet con la página abierta.** Se espera un aviso claro y no una pantalla en blanco. → Tareas 5 y 7.
5. **Llamada a la función sin permiso cuando `CRON_SECRET` está vacío.** Se espera que se rechace; un secret vacío nunca debe coincidir con un encabezado vacío. → Tarea 4.

---

## Fase 1 — Base de datos

### Tarea 1: Tablas y restricciones

**Archivos:**
- Crear: `supabase/migrations/0001_tablas.sql`, `supabase/tests/preparar_local.sql`, `supabase/tests/flujo.sql`, `.gitignore`

**Interfaces:**
- Produce: tablas con las columnas exactas de la sección 5 del diseño. Los `id` son `bigint generated by default as identity` (así la migración de datos puede conservar los ids). `movements.created_at` y `alerts.created_at` tienen `default now()`. Índice `movements (tipo, created_at)`.

- [ ] **Paso 1: Escribir las pruebas T01–T05 en `flujo.sql`**

El archivo abre con `begin;`, borra las cuatro tablas, y cierra con `select 'TODAS LAS PRUEBAS PASARON' as resultado; rollback;`. Cada prueba es un bloque `do $$ … $$` con `assert`. Un rechazo esperado se prueba con un sub-bloque que atrapa el error concreto y falla si no ocurre.

| Prueba | Afirma |
|---|---|
| T01 | `stock_actual = -1`, `stock_minimo = -1` y `costo = -1` dan `check_violation` |
| T02 | Segundo producto con el mismo `codigo` da `unique_violation` |
| T03 | Insertar `costo = 12.345` guarda `12.35` |
| T04 | `codigo`, `nombre` o `categoria` vacíos, solo espacios o de 121 caracteres dan `check_violation` |
| T05 | `movements.tipo = 'otro'`, `movements.cantidad = 0` y `alerts.status = 'otro'` dan `check_violation` |

- [ ] **Paso 2: Correr y ver que falla.** Esperado: `relation "products" does not exist`.
- [ ] **Paso 3: Escribir `preparar_local.sql` y `0001_tablas.sql`.** `preparar_local.sql` crea los tres roles solo si no existen y da `usage` sobre `public`.
- [ ] **Paso 4: Correr y ver que pasa.**

---

## Fase 2 — Funciones y seguridad

### Tarea 2: Trigger, funciones RPC y vistas

**Archivos:**
- Crear: `supabase/migrations/0002_funciones.sql`
- Modificar: `supabase/tests/flujo.sql`

**Interfaces — produce:**

```sql
dinero(v numeric) returns text                       -- '$3,751.50'
registrar_movimiento(p_producto_id bigint, p_tipo text, p_cantidad integer) returns integer  -- stock nuevo
importar_productos(p_items jsonb) returns integer    -- cuántos guardó
crear_alerta_stock_bajo() returns bigint             -- id de la alerta o null
reclamar_alerta(p_id bigint) returns setof alerts    -- la fila si la reclamó; vacío si no
-- vistas (security_invoker = true)
resumen_inventario(total, bajos, valor, reponer, ultima_revision)   -- siempre una fila
consumo_30d(product_code, total, primera)
```

Decisiones fijas:
- `registrar_movimiento`, `crear_alerta_stock_bajo` y `reclamar_alerta` son `security definer` con `set search_path = public`. `importar_productos` es `security invoker`.
- `registrar_movimiento` bloquea la fila con `for update`.
- `crear_alerta_stock_bajo` empieza con `pg_advisory_xact_lock(hashtext('crear_alerta_stock_bajo'))`.
- `importar_productos` recibe objetos `{codigo, nombre, categoria, stock_actual, stock_minimo, costo}` con `costo` posiblemente nulo.
- `items` de la alerta: arreglo de `{id, codigo, nombre, stock_actual, stock_minimo, costo, faltante, costo_reponer}` ordenado por nombre sin distinguir mayúsculas.
- `settings.last_check` se guarda como texto ISO en UTC (`2026-10-05T19:39:59Z`).

Textos exactos:

```
El movimiento debe ser entrada o salida.
cantidad: debe ser mayor que cero.
El producto ya no existe.
La salida supera el stock disponible; el inventario no puede quedar negativo.
El archivo no contiene productos.
codigo: 'P001' aparece más de una vez en el archivo.
```

Asunto y cuerpo del correo (idénticos a `alerts.py`):

```
Alerta de inventario: 1 producto(s) con stock bajo

Productos por debajo del stock mínimo:

• C1 — Tóner: actual 1, mínimo 4. Reponer 3 u. × $1,250.50 = $3,751.50

Costo estimado para llegar al mínimo: $3,751.50

Generado por Control inteligente de inventario y alertas de stock.
```

- [ ] **Paso 1: Escribir las pruebas T10–T20**

| Prueba | Afirma |
|---|---|
| T10 | Producto con `low_active = true`: al actualizar el stock a un valor `>= stock_minimo`, queda en `false` |
| T11 | X1 (stock 2, mín. 5): salida de 3 falla con `%no puede quedar negativo%` y el stock sigue en 2; entrada de 3 devuelve 5 y deja un movimiento con `product_code = 'X1'`, `stock_anterior = 2`, `stock_nuevo = 5` |
| T12 | Tipo `'otro'`, cantidad 0 y producto inexistente fallan con su texto exacto |
| T13 | Tras borrar el producto, su movimiento sigue en `movements` |
| T14 | X1 (2/5): primera revisión devuelve id; segunda devuelve nulo y hay 1 alerta; entrada de 3 → `bajos = 0` y la revisión devuelve nulo; salida de 1 → la revisión devuelve un id distinto y hay 2 alertas; `ultima_revision` no es nula |
| T15 | C1 (1/4, 1250.50) y C2 (10/2, 99.99): `valor = 2250.40`, `reponer = 3751.50`; la alerta tiene `items->0->>'costo_reponer' = '3751.50'`, cuerpo con `$3,751.50` y el asunto de arriba |
| T16 | Importar 2 productos devuelve 2; reimportar P001 con otro nombre no duplica y cambia el nombre; un lote con P020 válido y P021 con stock −1 falla y P020 no existe |
| T17 | L1 con costo 30: importar L1 y L2 con `costo` nulo deja L1 en 30.00 y L2 en 0.00 |
| T18 | Códigos repetidos en el lote fallan con `%aparece más de una vez%`; un arreglo vacío falla con `%no contiene productos%` |
| T19 | `reclamar_alerta`: recién creada → 1 fila, `enviando`, `attempts = 1`; de inmediato otra vez → 0 filas; en `error` → `attempts = 2`; en `enviando` con `last_attempt_at` de hace 6 minutos → `attempts = 3`; en `enviado` → 0 filas |
| T20 | `consumo_30d` ignora una salida de hace 40 días y suma las de los últimos 30, con `primera` igual a la más antigua de ellas |

- [ ] **Paso 2: Correr y ver que falla.** Esperado: `function … does not exist`.
- [ ] **Paso 3: Escribir `0002_funciones.sql`.**
- [ ] **Paso 4: Correr y ver que pasa.**

### Tarea 3: RLS y permisos

**Archivos:**
- Crear: `supabase/migrations/0003_seguridad.sql`
- Modificar: `supabase/tests/flujo.sql`

**Interfaces:**
- Consume: tablas, funciones y vistas de las tareas 1 y 2.
- Produce: la matriz de permisos de la sección 7 del diseño.

Decisiones fijas: Supabase da permisos por defecto a `anon` y `authenticated` sobre todo lo que se crea en `public`, así que el archivo primero **revoca todo** (tablas, vistas y funciones, también de `public`) y después concede solo lo necesario. `registrar_movimiento` e `importar_productos` se conceden a `authenticated`; `crear_alerta_stock_bajo` y `reclamar_alerta` solo a `service_role`.

- [ ] **Paso 1: Escribir las pruebas T30–T32**

| Prueba | Afirma |
|---|---|
| T30 | Las cuatro tablas tienen `relrowsecurity = true` |
| T31 | Como `anon`: leer `products` da `insufficient_privilege` |
| T32 | Como `authenticated`: puede crear, editar y borrar productos; puede leer `movements`, `alerts`, `settings` y las dos vistas; puede ejecutar `registrar_movimiento` e `importar_productos`; insertar en `movements`, actualizar `alerts`, y ejecutar `crear_alerta_stock_bajo` o `reclamar_alerta` dan `insufficient_privilege` |

- [ ] **Paso 2: Correr y ver que falla** (T30 da 0 tablas con RLS).
- [ ] **Paso 3: Escribir `0003_seguridad.sql`.**
- [ ] **Paso 4: Correr y ver que pasa.**
- [ ] **Paso 5: Entregar a Carlos los comandos de commit de las fases 1 y 2.**

---

## Fase 3 — El bot

### Tarea 4: Edge Function y programación

**Archivos:**
- Crear: `supabase/functions/revisar-inventario/correo.ts`, `entrega.ts`, `index.ts`; `supabase/config.toml`; `supabase/migrations/0004_cron.sql`
- Crear (andamiaje de pruebas): `web/package.json`, `web/vite.config.js`
- Prueba: `web/tests/bot.test.js`

**Interfaces — produce:**

```ts
// correo.ts
type ConfigCorreo =
  | { modo: "demo" }
  | { modo: "smtp"; host: string; port: number; user: string; password: string; from: string; to: string };
configCorreo(env: Record<string, string | undefined>): ConfigCorreo          // lanza Error
enviarCorreo(config: ConfigCorreo, correo: { subject: string; body: string }): Promise<void>

// entrega.ts
type Deps = {
  env: Record<string, string | undefined>;
  reclamar(id: number): Promise<{ id: number; subject: string; body: string } | null>;
  estadoActual(id: number): Promise<string | null>;          // null = la alerta no existe
  cerrar(id: number, status: string, error: string | null): Promise<void>;
  enviar: typeof enviarCorreo;
  crearAlerta(): Promise<number | null>;
  pendientes(): Promise<number[]>;
};
entregarAlerta(deps: Deps, id: number): Promise<string>                      // estado final
revisar(deps: Deps): Promise<{ alert_id: number | null; status: string | null; otras: { alert_id: number; status: string }[] }>
esLlamadaPermitida(p: { secretoEsperado?: string; secretoRecibido?: string | null; token?: string | null;
                        validarToken(token: string): Promise<boolean> }): Promise<boolean>
```

Decisiones fijas:
- `configCorreo`: los cinco nombres obligatorios son `SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, ALERT_TO`. Ninguno presente → demo. Algunos → `Configuración SMTP incompleta: faltan A, B.` Puerto por defecto 465. Puerto 25 o 587 → `El puerto 587 está bloqueado en las Edge Functions de Supabase. Usa SMTP_PORT=465.`
- `enviarCorreo` carga nodemailer con `await import("npm:nodemailer")` dentro de la función, para que Vitest pueda importar el archivo. Usa `secure: true` y tiempos límite de 15 000 ms de conexión y de socket.
- `index.ts` responde a `OPTIONS` con CORS, acepta solo `POST`, lee `x-cron-secret` y `Authorization`, y devuelve 401 si `esLlamadaPermitida` es falso. Cuerpo `{}` → `revisar`; cuerpo `{ "alert_id": n }` → `entregarAlerta` y responde `{ alert_id, status }`; si la alerta no existe, 404 con `La alerta no existe.`
- `config.toml`: `[functions.revisar-inventario]` con `verify_jwt = false`, porque la función valida por su cuenta.
- `0004_cron.sql`: activa `pg_cron` y `pg_net`, y programa `revisar-inventario` con `* * * * *`. Lee `project_url` y `cron_secret` de Vault. Incluye comentados los comandos para pausar y para cambiar el intervalo.
- Antes de escribir `index.ts` y `0004_cron.sql` se confirman en la documentación vigente de Supabase los nombres de las variables de entorno de la función y la forma de llamar a una función con `verify_jwt = false`.

- [ ] **Paso 1: Crear `web/package.json` y `web/vite.config.js`** con Vitest en entorno `jsdom` y los scripts `dev`, `build` y `test`.
- [ ] **Paso 2: Escribir `web/tests/bot.test.js`**

```js
// configCorreo
expect(configCorreo({})).toEqual({ modo: "demo" });
expect(() => configCorreo({ SMTP_HOST: "smtp.example.org" }))
  .toThrow("Configuración SMTP incompleta: faltan SMTP_USER, SMTP_PASSWORD, SMTP_FROM, ALERT_TO.");
expect(configCorreo(COMPLETO)).toMatchObject({ modo: "smtp", host: "smtp.gmail.com", port: 465 });
expect(() => configCorreo({ ...COMPLETO, SMTP_PORT: "587" })).toThrow(/puerto 587 está bloqueado/);
expect(() => configCorreo({ ...COMPLETO, SMTP_PORT: "25" })).toThrow(/puerto 25 está bloqueado/);

// entregarAlerta (deps falsos con vi.fn)
// sin secrets      → devuelve "simulado"; cerrar(7, "simulado", null); enviar no se llama
// incompleto       → devuelve "error"; cerrar(7, "error", texto que contiene "SMTP_USER")
// enviar lanza Error("Connection timeout") → devuelve "error"; cerrar(7, "error", "Connection timeout")
// todo bien        → devuelve "enviado"; enviar recibe { subject, body } de la alerta
// reclamar → null, estadoActual → "enviando" → devuelve "enviando"; enviar y cerrar no se llaman
// reclamar → null, estadoActual → null → lanza "La alerta no existe."

// revisar
// crearAlerta → 7, pendientes → [3, 7] → { alert_id: 7, status: "simulado", otras: [{ alert_id: 3, status: "simulado" }] }
// crearAlerta → null, pendientes → [] → { alert_id: null, status: null, otras: [] }

// esLlamadaPermitida
// secreto igual → true
// secretoEsperado "" y secretoRecibido "" → false
// secretoEsperado undefined y secretoRecibido null → false
// secreto distinto y sin token → false
// token válido → true; token inválido → false
```

- [ ] **Paso 3: Correr `npm test` y ver que falla** (no existen los módulos).
- [ ] **Paso 4: Escribir `correo.ts` y `entrega.ts`.**
- [ ] **Paso 5: Correr `npm test` y ver que pasa.**
- [ ] **Paso 6: Escribir `index.ts`, `config.toml` y `0004_cron.sql`.** No tienen prueba automática; se comprueban en el proyecto real con el README.
- [ ] **Paso 7: Entregar los comandos de commit de la fase 3.**

---

## Fase 4 — Frontend

### Tarea 5: Lógica pura

**Archivos:**
- Crear: `web/src/lib/dinero.js`, `validar.js`, `pronostico.js`, `fechas.js`, `errores.js`
- Prueba: `web/tests/dinero.test.js`, `validar.test.js`, `pronostico.test.js`, `errores.test.js`

**Interfaces — produce:**

```js
// dinero.js
leerCosto(valor, etiqueta = "costo")   // → number con 2 decimales; lanza Error
dinero(valor)                          // → "$1,250.50"; null o undefined → "$0.00"
// validar.js
ENCABEZADOS = ["codigo","nombre","categoria","stock_actual","stock_minimo","costo"]
ENCABEZADOS_VIEJOS = ENCABEZADOS.slice(0, 5)
enteroNoNegativo(valor, etiqueta)      // → number; lanza Error
limpiarProducto(datos, { costoObligatorio = true } = {})  // → { codigo, nombre, categoria, stock_actual, stock_minimo, costo }
validarFilas(filas)                    // filas[0] es el encabezado → arreglo de productos; lanza Error
// pronostico.js
DIAS_HISTORIAL = 30; DIAS_COBERTURA = 14; DIAS_AVISO = 7
conPronostico(productos, consumo, ahora = new Date())
  // agrega consumo_diario, dias_restantes, sugerido, costo_sugerido, bajo, urgente
prioridadReabasto(productos)           // urgentes con sugerido > 0, ordenados
// fechas.js
fechaLocal(iso)                        // → "2026-10-05 13:39:59" en hora local; vacío → ""
// errores.js
mensajeError(error)                    // → texto en español
```

Textos exactos:

```
costo: escribe un importe no negativo, por ejemplo 12.50.
costo: este campo es obligatorio.
stock_actual: escribe un número entero no negativo.
nombre: este campo es obligatorio.
codigo: máximo 120 caracteres.
La primera fila debe contener exactamente: codigo, nombre, categoria, stock_actual, stock_minimo, costo.
No se importó ningún producto. Corrige estos errores:\nFila 3: …
codigo: 'P1' aparece más de una vez en el archivo.
El archivo no contiene productos.
Ese código ya existe. Usa otro código o edita el producto existente.     (error 23505)
Tu sesión expiró. Vuelve a iniciar sesión.                                (401 o "JWT expired")
No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.    ("Failed to fetch")
```

- [ ] **Paso 1: Escribir las pruebas**

```js
// dinero.test.js
expect(leerCosto("12.50")).toBe(12.5);
expect(leerCosto("12,50")).toBe(12.5);
expect(leerCosto("$1,250.50")).toBe(1250.5);
expect(leerCosto("$1,250.5")).toBe(1250.5);
expect(leerCosto(45)).toBe(45);
for (const malo of ["-1", "abc", "", "nan", null, undefined, true, "1e3", "10000000000"])
  expect(() => leerCosto(malo)).toThrow(/^costo:/);
expect(dinero(3751.5)).toBe("$3,751.50");
expect(dinero(null)).toBe("$0.00");

// validar.test.js
expect(enteroNoNegativo("7", "stock_actual")).toBe(7);
expect(enteroNoNegativo(5.0, "stock_actual")).toBe(5);
for (const malo of [-1, 1.5, "1.5", "abc", "", null, true, 2147483648])
  expect(() => enteroNoNegativo(malo, "stock_actual")).toThrow("stock_actual: escribe un número entero no negativo.");
expect(limpiarProducto({ codigo: " X1 ", nombre: "Prueba", categoria: "Clase", stock_actual: "2", stock_minimo: "5", costo: "10" }))
  .toEqual({ codigo: "X1", nombre: "Prueba", categoria: "Clase", stock_actual: 2, stock_minimo: 5, costo: 10 });
// nombre "" → "nombre: este campo es obligatorio."; codigo de 121 caracteres → "codigo: máximo 120 caracteres."
// sin costo: obligatorio → "costo: este campo es obligatorio."; { costoObligatorio: false } → costo null
// validarFilas([ENCABEZADOS, ["P020","Bien","Otra",1,2,1], ["P021","Mal","Otra",-1,2,1]]) → lanza; el mensaje contiene
//   "No se importó ningún producto" y "Fila 3: stock_actual"
// código repetido en la fila 3 → "Fila 3: codigo: 'P1' aparece más de una vez en el archivo."
// encabezado [" Codigo ","NOMBRE","categoria","stock_actual","stock_minimo","costo",null,null] se acepta
// ENCABEZADOS_VIEJOS se acepta y cada producto sale con costo null
// encabezado en otro orden → "La primera fila debe contener exactamente: …"
// filas vacías o de puros espacios se saltan; solo encabezado → "El archivo no contiene productos."

// pronostico.test.js
const ahora = new Date("2026-10-05T12:00:00Z");
const productos = [
  { codigo: "F1", nombre: "Rápido", stock_actual: 4, stock_minimo: 2, costo: 3 },
  { codigo: "F2", nombre: "Lento", stock_actual: 49, stock_minimo: 2, costo: 1 },
  { codigo: "F3", nombre: "Bajo sin uso", stock_actual: 1, stock_minimo: 4, costo: 2 },
];
const consumo = [
  { product_code: "F1", total: 16, primera: ahora.toISOString() },
  { product_code: "F2", total: 1, primera: ahora.toISOString() },
];
// F1: consumo_diario 16, dias_restantes 0, sugerido 220, costo_sugerido 660, urgente true
// F2: dias_restantes 49, urgente false
// F3: consumo_diario null, dias_restantes null, sugerido 3, bajo true, urgente true
// prioridadReabasto → códigos ["F1", "F3"]
// 30 salidas con primera hace 10 días, stock 20, mínimo 5 → consumo_diario 3, dias_restantes 6, urgente true, sugerido 22

// errores.test.js: los tres textos de arriba, y { code: "P0001", message: "X" } → "X"
```

- [ ] **Paso 2: Correr `npm test` y ver que falla.**
- [ ] **Paso 3: Escribir los cinco módulos.** `leerCosto` y `enteroNoNegativo` validan con expresión regular sobre el texto, no con `parseFloat`, para rechazar `1e3` y `nan`.
- [ ] **Paso 4: Correr `npm test` y ver que pasa.**

### Tarea 6: Excel

**Archivos:**
- Crear: `web/src/lib/excel.js`; copiar `static/inventario_ejemplo.xlsx` del proyecto Flask a `web/public/`
- Prueba: `web/tests/excel.test.js`

**Interfaces:**
- Consume: `validarFilas`, `ENCABEZADOS` (tarea 5).
- Produce:

```js
LIMITE_BYTES = 2 * 1024 * 1024
revisarArchivo(archivo)        // { name, size } → lanza Error si no es .xlsx o pesa más de 2 MB
leerExcel(buffer)              // ArrayBuffer → Promise<productos[]>; usa validarFilas
crearExcel(productos)          // → Promise<ArrayBuffer>; mismas columnas, encabezado en negritas sobre 0F1B33, costo "$#,##0.00"
descargar(buffer, nombre)      // dispara la descarga en el navegador
```

Textos exactos: `Solo se aceptan archivos .xlsx.` · `El archivo supera el límite de 2 MB.` · `No se pudo leer el archivo .xlsx. Comprueba que sea un Excel válido.`

- [ ] **Paso 1: Escribir las pruebas**

| Prueba | Afirma |
|---|---|
| Ejemplo entregado | `leerExcel` del archivo en `public/` devuelve 16 productos, 6 con `stock_actual < stock_minimo` |
| Ida y vuelta | `leerExcel(await crearExcel(productos))` devuelve los mismos seis campos |
| Celdas especiales | Una celda fórmula `{ formula: "2+3", result: 5 }` se lee como 5; un texto enriquecido se lee como su texto; el texto `"7"` en una columna de stock se lee como 7 |
| Archivo inválido | `revisarArchivo({ name: "a.csv", size: 10 })` y `{ name: "a.xlsx", size: LIMITE_BYTES + 1 }` lanzan su texto; `leerExcel` de bytes al azar lanza el tercero |

- [ ] **Paso 2: Correr y ver que falla.**
- [ ] **Paso 3: Escribir `excel.js`.** `exceljs` se carga con `import()` dinámico para no pesar en la carga inicial.
- [ ] **Paso 4: Correr y ver que pasa.**

### Tarea 7: Pantallas

**Archivos:**
- Crear: `web/index.html`, `web/src/main.jsx`, `App.jsx`, `style.css`, `lib/supabase.js`, `lib/api.js`, `paginas/{Login,Inventario,Movimientos,Alertas}.jsx`, `componentes/{Encabezado,Resumen,Aviso,Prioridad,FormularioProducto,ImportarExcel,TablaProductos}.jsx`, `web/.env.example`
- Prueba: `web/tests/paginas.test.jsx`

**Interfaces:**
- Consume: todo lo de las tareas 5 y 6; las funciones y vistas de la tarea 2; la función `revisar-inventario`.
- Produce (`api.js`; todas lanzan `Error` con el texto de `mensajeError`):

```js
cargarInventario()                 // → { productos, consumo, resumen }
guardarProducto(datos, id = null)  // crea o edita; valida con limpiarProducto
eliminarProducto(id)
registrarMovimiento(id, tipo, cantidad)   // → stock nuevo
importarProductos(items)           // → cuántos guardó
listarMovimientos()                // últimos 200
listarAlertas()                    // últimas 200
cargarResumen()
revisarAhora()                     // → { alert_id, status, otras }
reintentarAlerta(id)               // → { alert_id, status }
iniciarSesion(correo, clave); cerrarSesion()
```

Decisiones fijas:
- Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `web/.env.local`.
- `style.css` empieza como copia exacta de `static/style.css`. Se agregan al final los estilos del login, el botón "Cerrar sesión" y los ajustes de celular; no se cambian reglas existentes.
- El HTML conserva las mismas clases que las plantillas Jinja, para que el CSS aplique igual.
- Avisos tras cada acción, con los mismos textos de `app.py` (por ejemplo `Producto registrado.`, `Movimiento registrado.`, `Producto eliminado. Su historial anterior se conserva.`, `Importación completada: N producto(s) creados o actualizados.`, `Revisión completa. No hay episodios nuevos de stock bajo.`).
- Etiquetas de estado: `Simulado: no enviado`, `Enviado`, `Error de envío`, `Pendiente`, `Enviando`.
- "Reintentar envío" aparece cuando el estado es `error`, o `pendiente`/`enviando` con más de 5 minutos.
- Pie de página nuevo: `El bot revisa el inventario cada minuto en la nube, aunque esta página esté cerrada. Sin SMTP configurado, las alertas son simuladas.`
- Si `cargarInventario` falla, la página muestra el aviso de error y un botón "Reintentar".

- [ ] **Paso 1: Escribir `paginas.test.jsx`** con `vi.mock("../src/lib/api.js")`

| Prueba | Afirma |
|---|---|
| Inventario | Con un producto bajo de costo 45 y uno suficiente: se ven `Reabastecer primero`, `$45.00`, `Stock bajo` y `Suficiente` |
| Filtros | Marcar "Solo urgentes" deja una fila; buscar un texto sin coincidencias muestra `Ningún producto coincide con los filtros.` |
| Inventario vacío | Se ve `El inventario está vacío. Registra un producto o importa el Excel de ejemplo.` |
| Falla de carga | Si `cargarInventario` rechaza, se ve el mensaje del error y el botón `Reintentar` |
| Movimientos vacío | Se ve `Todavía no hay movimientos.` |
| Alertas | Una alerta `simulado` muestra `Simulado: no enviado` sin botón; una en `error` muestra `Reintentar envío` |
| Sin sesión | `App` muestra el formulario con el botón `Iniciar sesión` |

- [ ] **Paso 2: Correr y ver que falla.**
- [ ] **Paso 3: Escribir `supabase.js`, `api.js`, `App.jsx`, `main.jsx`, `index.html` y `style.css`.**
- [ ] **Paso 4: Escribir componentes y páginas.**
- [ ] **Paso 5: Correr `npm test` y `npm run build`; ambos pasan.**
- [ ] **Paso 6: Revisar las tres pantallas en el navegador a 1280 px y a 375 px de ancho**, con datos de prueba, comparando contra la versión Flask.
- [ ] **Paso 7: Entregar los comandos de commit de la fase 4.**

---

## Fase 5 — Datos

### Tarea 8: De SQLite a Supabase

**Archivos:**
- Crear: `herramientas/migrar_sqlite.py`
- Prueba: `herramientas/test_migrar.py`

**Interfaces — produce:**

```python
generar_sql(ruta_db: str) -> str
# Uso: python migrar_sqlite.py RUTA\inventario.db [salida.sql]   (salida por defecto: datos_migrados.sql)
```

Decisiones fijas: el SQL va entre `begin;` y `commit;`. Empieza con una guarda que lanza `Las tablas ya tienen datos; no se migró nada.` si `products`, `movements` o `alerts` no están vacías. Conserva los ids y al final ajusta las secuencias con `setval`. `items_json` se escribe como `jsonb`. Las comillas simples se duplican. Solo usa la librería estándar. `datos_migrados.sql` va en `.gitignore`.

- [ ] **Paso 1: Escribir `test_migrar.py`** (unittest). Crea un SQLite temporal con el esquema de Flask, un producto llamado `O'Brien` con `low_active = 1`, un movimiento y una alerta. Afirma que la salida contiene `'O''Brien'`, empieza con `begin;`, termina con `commit;`, incluye la guarda, un `setval` por tabla y `true` para `low_active`.
- [ ] **Paso 2: Correr `python -m unittest herramientas/test_migrar.py` y ver que falla.**
- [ ] **Paso 3: Escribir `migrar_sqlite.py`.**
- [ ] **Paso 4: Correr y ver que pasa.**
- [ ] **Paso 5: Prueba real.** Generar el SQL con el `inventario.db` de Carlos y aplicarlo al Postgres local después de las migraciones. Esperado: 16 productos, 3 alertas, 0 movimientos, y un segundo intento que falla con el texto de la guarda.

---

## Fase 6 — Documentación

### Tarea 9: README y comprobación final

**Archivos:**
- Crear: `README.md`

Secciones, en este orden: qué es el proyecto y cómo está armado (con el diagrama del diseño); requisitos (Node 20+, cuenta de Supabase, Python 3 solo para migrar datos); 1) crear el proyecto en Supabase; 2) aplicar las migraciones 0001 a 0003 en el SQL Editor; 3) crear el usuario y apagar el registro público; 4) desplegar la función, por el panel o por la CLI; 5) configurar los secrets, con la contraseña de aplicación de Gmail y el puerto 465; 6) guardar `project_url` y `cron_secret` en Vault y aplicar `0004_cron.sql`; 7) correr el frontend en Windows; 8) migrar los datos de `inventario.db`; cómo correr las pruebas; problemas comunes; guion para exponer; explicación sencilla de cada pieza.

- [ ] **Paso 1: Confirmar en la documentación vigente de Supabase** los pasos del panel que el README menciona (secrets de funciones, Vault, usuarios, registro público).
- [ ] **Paso 2: Escribir `README.md`.**
- [ ] **Paso 3: Comprobación final.** Correr el comando SQL de referencia, `npm test`, `npm run build` y `python -m unittest herramientas/test_migrar.py`. Todo pasa.
- [ ] **Paso 4: Repasar el diseño sección por sección** y confirmar que cada requisito tiene su archivo.
- [ ] **Paso 5: Entregar los comandos de commit de las fases 5 y 6 y la lista de lo que Carlos debe comprobar en su proyecto real.**
