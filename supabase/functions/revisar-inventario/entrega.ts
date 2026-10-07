// Lógica del bot. No sabe nada de Supabase ni de SMTP: recibe "dependencias"
// (funciones para hablar con la base y para enviar) y decide qué hacer.
// Así se puede probar completa con dependencias falsas.
import { configCorreo, type ConfigCorreo, type Entorno } from "./correo.ts";

export type AlertaReclamada = { id: number; subject: string; body: string };

export type Deps = {
  /** Secrets de la función (SMTP_HOST, ALERT_TO, ...). */
  env: Entorno;
  /** Aparta la alerta para enviarla. Devuelve null si otro proceso ya la tiene. */
  reclamar(id: number): Promise<AlertaReclamada | null>;
  /** Estado actual de la alerta, o null si no existe. */
  estadoActual(id: number): Promise<string | null>;
  /** Guarda el resultado del envío. */
  cerrar(id: number, status: string, error: string | null): Promise<void>;
  /** Manda el correo. */
  enviar(config: ConfigCorreo, correo: { subject: string; body: string }): Promise<void>;
  /** Pide a la base la alerta de un episodio nuevo. Devuelve su id o null. */
  crearAlerta(): Promise<number | null>;
  /** Ids de las alertas que nunca se intentaron enviar. */
  pendientes(): Promise<number[]>;
};

export type Puerta = {
  /** Clave que solo conocen pg_cron y esta función. */
  cronSecret?: string;
  /** Dice si un token de sesión pertenece a un usuario real. */
  validarToken(token: string): Promise<boolean>;
};

export type ResultadoRevision = {
  alert_id: number | null;
  status: string | null;
  otras: { alert_id: number; status: string }[];
};

/** Envía (o simula) una alerta y devuelve su estado final. */
export async function entregarAlerta(deps: Deps, id: number): Promise<string> {
  const alerta = await deps.reclamar(id);
  if (alerta === null) {
    const estado = await deps.estadoActual(id);
    if (estado === null) throw new Error("La alerta no existe.");
    return estado; // otro proceso la tiene, o ya se envió
  }

  let status: string;
  let error: string | null = null;
  try {
    const config = configCorreo(deps.env);
    if (config.modo === "demo") {
      status = "simulado";
    } else {
      await deps.enviar(config, { subject: alerta.subject, body: alerta.body });
      status = "enviado";
    }
  } catch (motivo) {
    status = "error";
    error = motivo instanceof Error ? motivo.message : String(motivo);
  }
  await deps.cerrar(id, status, error);
  return status;
}

/** Una revisión completa: crea la alerta nueva (si hay) y envía las pendientes. */
export async function revisar(deps: Deps): Promise<ResultadoRevision> {
  const nueva = await deps.crearAlerta();
  const ids = await deps.pendientes();

  let status: string | null = null;
  const otras: { alert_id: number; status: string }[] = [];
  for (const id of ids) {
    const estado = await entregarAlerta(deps, id);
    if (id === nueva) status = estado;
    else otras.push({ alert_id: id, status: estado });
  }
  if (nueva !== null && status === null) {
    status = await deps.estadoActual(nueva); // otra revisión la tomó primero
  }
  return { alert_id: nueva, status, otras };
}

/** Compara dos textos sin revelar, por el tiempo que tarda, cuánto coinciden. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/**
 * Solo dos llamadas están permitidas:
 *  1. pg_cron, que manda el secreto correcto en el encabezado x-cron-secret
 *  2. un usuario con sesión iniciada (token válido)
 * Un secreto vacío nunca cuenta: si CRON_SECRET no está configurado, el cron no entra.
 */
export async function esLlamadaPermitida(p: {
  secretoEsperado?: string;
  secretoRecibido?: string | null;
  token?: string | null;
  validarToken(token: string): Promise<boolean>;
}): Promise<boolean> {
  if (p.secretoEsperado && p.secretoRecibido && iguales(p.secretoRecibido, p.secretoEsperado)) {
    return true;
  }
  if (p.token) return await p.validarToken(p.token);
  return false;
}

// CORS: permiso para que la página (otro dominio) pueda llamar a la función.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Puerta de entrada HTTP.
 *   POST {}                 -> revisión completa
 *   POST {"alert_id": 5}    -> reintentar el envío de esa alerta
 */
export async function manejar(req: Request, deps: Deps & Puerta): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS });
  if (req.method !== "POST") return json({ error: "Esta función solo acepta POST." }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  const token = /^bearer /i.test(autorizacion) ? autorizacion.slice(7).trim() : null;
  const permitida = await esLlamadaPermitida({
    secretoEsperado: deps.cronSecret,
    secretoRecibido: req.headers.get("x-cron-secret"),
    token,
    validarToken: deps.validarToken,
  });
  if (!permitida) return json({ error: "No autorizado." }, 401);

  let cuerpo: { alert_id?: unknown } = {};
  try {
    const texto = await req.text();
    if (texto.trim() !== "") cuerpo = JSON.parse(texto) ?? {};
  } catch {
    return json({ error: "El cuerpo de la petición no es JSON válido." }, 400);
  }

  try {
    if (cuerpo.alert_id !== undefined && cuerpo.alert_id !== null) {
      const id = cuerpo.alert_id;
      if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
        return json({ error: "alert_id debe ser un número entero positivo." }, 400);
      }
      return json({ alert_id: id, status: await entregarAlerta(deps, id) });
    }
    return json(await revisar(deps));
  } catch (motivo) {
    const mensaje = motivo instanceof Error ? motivo.message : String(motivo);
    return json({ error: mensaje }, mensaje === "La alerta no existe." ? 404 : 500);
  }
}
