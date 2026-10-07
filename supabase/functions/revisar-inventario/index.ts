// Edge Function "revisar-inventario": el bot del inventario.
//
// Quién la llama:
//   · pg_cron, cada minuto, para revisar el stock (aunque nadie tenga la página abierta)
//   · pg_cron, una vez por semana, para mandar el reporte semanal
//   · la página, con los botones "Revisar inventario ahora", "Enviar reporte ahora" y "Reintentar envío"
//
// Este archivo solo conecta las piezas con Supabase. Las decisiones están en
// entrega.ts (qué hacer), el formato en plantillas.ts (cómo se ve el correo)
// y el envío en smtp.ts (cómo se manda).
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, manejar, type Puerta } from "./entrega.ts";
import { enviarCorreo } from "./smtp.ts";

// Llave maestra del proyecto. Supabase la pone sola en el entorno de la función;
// nunca se escribe en el código ni viaja al navegador.
function llaveMaestra(): string {
  try {
    const llaves = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof llaves?.default === "string" && llaves.default !== "") return llaves.default;
  } catch {
    // Proyectos anteriores no tienen SUPABASE_SECRET_KEYS; se usa la llave clásica.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const base = createClient(Deno.env.get("SUPABASE_URL") ?? "", llaveMaestra(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function revisarError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const deps: Deps & Puerta = {
  env: Deno.env.toObject(),
  cronSecret: Deno.env.get("CRON_SECRET"),

  async validarToken(token) {
    const { data, error } = await base.auth.getUser(token);
    return !error && Boolean(data?.user);
  },

  async crearAlerta() {
    const { data, error } = await base.rpc("crear_alerta_stock_bajo");
    revisarError(error);
    return data ?? null;
  },

  async crearReporte() {
    const { data, error } = await base.rpc("crear_reporte_semanal");
    revisarError(error);
    return data;
  },

  async pendientes() {
    const { data, error } = await base.from("alerts").select("id").eq("status", "pendiente").order("id");
    revisarError(error);
    return (data ?? []).map((fila) => fila.id);
  },

  async reclamar(id) {
    const { data, error } = await base.rpc("reclamar_alerta", { p_id: id });
    revisarError(error);
    return data?.[0] ?? null;
  },

  async estadoActual(id) {
    const { data, error } = await base.from("alerts").select("status").eq("id", id).maybeSingle();
    revisarError(error);
    return data?.status ?? null;
  },

  async cerrar(id, status, motivo) {
    const { error } = await base.from("alerts").update({ status, error: motivo }).eq("id", id);
    revisarError(error);
  },

  enviar: enviarCorreo,
};

Deno.serve((req) => manejar(req, deps));
