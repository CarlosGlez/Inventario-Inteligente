// Envío real del correo por SMTP. Es el único archivo que toca la red de correo.
import nodemailer from "npm:nodemailer@10";
import type { ConfigCorreo } from "./correo.ts";

/**
 * Manda un correo de texto. Usa SSL directo (puerto 465).
 * Si el servidor no responde en 15 segundos, corta el intento con un error;
 * así la alerta queda en "error" (reintentable) y no atorada en "enviando".
 */
export async function enviarCorreo(
  config: ConfigCorreo,
  correo: { subject: string; body: string },
  { tiempoLimiteMs = 15000 }: { tiempoLimiteMs?: number } = {},
): Promise<void> {
  if (config.modo !== "smtp") {
    throw new Error("No hay configuración SMTP para enviar el correo.");
  }
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
    await transporte.sendMail({
      from: config.from,
      to: config.to,
      subject: correo.subject,
      text: correo.body,
    });
  } finally {
    transporte.close();
  }
}
