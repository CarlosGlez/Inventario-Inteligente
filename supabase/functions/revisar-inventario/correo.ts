// Configuración del correo, leída de los secrets de la función.
// Este archivo no usa red ni Deno: por eso se puede probar con Vitest.

export type ConfigCorreo =
  | { modo: "demo" }
  | { modo: "smtp"; host: string; port: number; user: string; password: string; from: string; to: string };

export type Entorno = Record<string, string | undefined>;

const OBLIGATORIOS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "ALERT_TO"];

// Supabase bloquea las conexiones salientes a estos puertos desde las Edge Functions.
const PUERTOS_BLOQUEADOS = [25, 587];

/**
 * Decide cómo se mandará el correo:
 *  - sin ningún secret SMTP  -> modo demostración (la alerta queda "simulado")
 *  - con algunos pero no todos -> error que dice cuáles faltan
 *  - con todos -> configuración lista para enviar
 */
export function configCorreo(env: Entorno): ConfigCorreo {
  const valor = (nombre: string) => (env[nombre] ?? "").trim();

  if (OBLIGATORIOS.every((nombre) => valor(nombre) === "")) {
    return { modo: "demo" };
  }

  const faltan = OBLIGATORIOS.filter((nombre) => valor(nombre) === "");
  if (faltan.length > 0) {
    throw new Error(`Configuración SMTP incompleta: faltan ${faltan.join(", ")}.`);
  }

  const textoPuerto = valor("SMTP_PORT") || "465";
  const port = Number(textoPuerto);
  if (!/^[0-9]+$/.test(textoPuerto) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT debe ser un número de puerto, por ejemplo 465.");
  }
  if (PUERTOS_BLOQUEADOS.includes(port)) {
    throw new Error(`El puerto ${port} está bloqueado en las Edge Functions de Supabase. Usa SMTP_PORT=465.`);
  }

  return {
    modo: "smtp",
    host: valor("SMTP_HOST"),
    port,
    user: valor("SMTP_USER"),
    password: valor("SMTP_PASSWORD"),
    from: valor("SMTP_FROM"),
    to: valor("ALERT_TO"),
  };
}
