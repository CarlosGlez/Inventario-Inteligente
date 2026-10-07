// Envío real del correo por SMTP. Es el único archivo que toca la red de correo.
import nodemailer from "npm:nodemailer@10";
import { type ConfigCorreo, type Correo, mensajeCorreo } from "./correo.ts";

/**
 * Manda un correo (texto y, si viene, versión con formato). Usa SSL directo (puerto 465).
 * Si el servidor no responde en 15 segundos, corta el intento con un error;
 * así la alerta queda en "error" (reintentable) y no atorada en "enviando".
 */
export async function enviarCorreo(
  config: ConfigCorreo,
  correo: Correo,
  { tiempoLimiteMs = 15000 }: { tiempoLimiteMs?: number } = {},
): Promise<void> {
  const mensaje = mensajeCorreo(config, correo);
  if (config.modo !== "smtp") return; // mensajeCorreo ya lanzó el error; esto solo ayuda a TypeScript
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: tiempoLimiteMs,
    greetingTimeout: tiempoLimiteMs,
    socketTimeout: tiempoLimiteMs,
  });
  try {
    await transporte.sendMail(mensaje);
  } finally {
    transporte.close();
  }
}
