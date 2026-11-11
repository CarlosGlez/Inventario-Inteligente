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

  async puedeEjecutar(token, accion) {
    const { data } = await base.auth.getUser(token);
    if (!data.user) return false;
    const { data: perfil } = await base.from("profiles").select("role,active").eq("user_id", data.user.id).maybeSingle();
    if (!perfil?.active) return false;
    return accion === "revisar"
      ? ["admin", "almacen", "compras"].includes(perfil.role)
      : ["admin", "compras"].includes(perfil.role);
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
    const { data, error } = await base.from("alerts").select("id").in("status", ["pendiente", "error"]).neq("tipo", "orden_compra").neq("tipo", "prueba_correo").order("id");
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

  async cerrar(id, status, motivo, evidencia) {
    const { error } = await base.from("alerts").update({
      status, error: motivo, message_id: evidencia?.messageId ?? null,
      recipient: evidencia?.recipient ?? null, delivery_status: evidencia?.deliveryStatus ?? "fallido",
      sent_at: evidencia?.deliveryStatus === "enviado" ? new Date().toISOString() : null,
    }).eq("id", id);
    revisarError(error);
  },

  enviar: enviarCorreo,
};

async function gestionarUsuarios(req: Request): Promise<Response> {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Esta acción solo acepta GET o POST." }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: errorSesion } = await base.auth.getUser(token);
  if (errorSesion || !sesion.user) return json({ error: "No autorizado." }, 401);
  const { data: perfil } = await base.from("profiles").select("role,active").eq("user_id", sesion.user.id).maybeSingle();
  if (!perfil?.active || perfil.role !== "admin") return json({ error: "Se requiere rol admin." }, 403);
  if (req.method === "GET") {
    const [usuarios, perfiles] = await Promise.all([
      base.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      base.from("profiles").select("user_id,role,active,created_at").order("created_at"),
    ]);
    if (usuarios.error) return json({ error: usuarios.error.message }, 500);
    if (perfiles.error) return json({ error: perfiles.error.message }, 500);
    const porId = new Map((perfiles.data ?? []).map((p) => [p.user_id, p]));
    return json(usuarios.data.users.map((u) => ({ ...porId.get(u.id), email: u.email ?? "" })).filter((u) => u.user_id));
  }
  let body: { email?: string; password?: string; role?: string; user_id?: string; active?: boolean };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  if (body.email) {
    if (typeof body.password !== "string" || body.password.length < 12 || !["admin", "almacen", "compras", "consulta"].includes(body.role ?? "")) return json({ error: "Usa contraseña de 12 caracteres o más y un rol válido." }, 400);
    const { data, error } = await base.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true });
    if (error || !data.user) return json({ error: error?.message ?? "No se pudo crear el usuario." }, 400);
    const { error: perfilError } = await base.from("profiles").update({ role: body.role }).eq("user_id", data.user.id);
    if (perfilError) { await base.auth.admin.deleteUser(data.user.id); return json({ error: perfilError.message }, 500); }
    return json({ user_id: data.user.id, role: body.role }, 201);
  }
  if (typeof body.user_id === "string" && typeof body.active === "boolean" && ["admin", "almacen", "compras", "consulta"].includes(body.role ?? "")) {
    const { error } = await base.from("profiles").update({ role: body.role, active: body.active }).eq("user_id", body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  return json({ error: "Acción de usuario incompleta." }, 400);
}

async function enviarOrdenProveedor(req: Request): Promise<Response> {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Esta acción solo acepta POST." }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: errorSesion } = await base.auth.getUser(token);
  if (errorSesion || !sesion.user) return json({ error: "No autorizado." }, 401);
  const { data: perfil } = await base.from("profiles").select("role,active").eq("user_id", sesion.user.id).maybeSingle();
  if (!perfil?.active || !["admin", "compras"].includes(perfil.role)) return json({ error: "Se requiere rol compras o admin." }, 403);
  let ordenId: number;
  try { ordenId = Number((await req.json()).orden_id); } catch { return json({ error: "JSON inválido." }, 400); }
  if (!Number.isSafeInteger(ordenId) || ordenId <= 0) return json({ error: "orden_id debe ser positivo." }, 400);
  const { data: preparada, error: errorPreparar } = await base.rpc("preparar_correo_orden", { p_orden_id: ordenId });
  if (errorPreparar) return json({ error: errorPreparar.message }, 400);
  const id = Number(preparada.alert_id);
  const { data: alerta, error: errorAlerta } = await base.from("alerts").select("*").eq("id", id).single();
  if (errorAlerta) return json({ error: errorAlerta.message }, 500);
  if (alerta.status === "enviado" || alerta.status === "simulado") return json({ alert_id: id, status: alerta.status, message_id: alerta.message_id });
  const { data: reclamada, error: errorClaim } = await base.rpc("reclamar_alerta", { p_id: id });
  if (errorClaim) return json({ error: errorClaim.message }, 500);
  if (!reclamada?.length) return json({ alert_id: id, status: alerta.status });

  let recipient = alerta.recipient;
  let enviado: { messageId: string; accepted: string[] };
  try {
    const config = configCorreo(Deno.env.toObject());
    if (config.modo === "demo") {
      await base.from("alerts").update({ status: "simulado", delivery_status: "simulado", recipient, error: null }).eq("id", id);
      return json({ alert_id: id, status: "simulado", recipient });
    }
    const appUrl = Deno.env.get("APP_URL")?.trim();
    if (!appUrl) throw new Error("Configura APP_URL para incluir el enlace de la orden al proveedor.");
    const link = `${appUrl.replace(/\/$/, "")}/ordenes?orden=${ordenId}`;
    enviado = await enviarCorreo({ ...config, to: recipient }, { subject: alerta.subject, body: `${alerta.body}\n\nOrden: ${link}`, html: htmlCorreo({ tipo: "orden_compra", items: alerta.items, link }) });
  } catch (motivo) {
    const message = motivo instanceof Error ? motivo.message : String(motivo);
    await base.from("alerts").update({ status: "error", delivery_status: "fallido", recipient, error: message }).eq("id", id);
    return json({ alert_id: id, status: "error", error: message }, 502);
  }
  const enviadoAt = new Date().toISOString();
  const { error: errorGuardar } = await base.from("alerts").update({ status: "enviado", delivery_status: "enviado", recipient, message_id: enviado.messageId, sent_at: enviadoAt, error: null }).eq("id", id);
  if (errorGuardar) return json({ alert_id: id, status: "enviado", message_id: enviado.messageId, warning: "SMTP aceptó el mensaje, pero falló al guardar el historial." }, 500);
  const { error: errorOrden } = await base.from("ordenes_compra").update({ estado: "enviada", sent_at: enviadoAt }).eq("id", ordenId);
  if (errorOrden) return json({ alert_id: id, status: "enviado", message_id: enviado.messageId, warning: "El correo fue aceptado y se registró, pero no se actualizó el estado de la orden." }, 500);
  return json({ alert_id: id, status: "enviado", recipient, message_id: enviado.messageId });
}

async function probarCorreo(req: Request): Promise<Response> {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Esta acción solo acepta POST." }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: errorSesion } = await base.auth.getUser(token);
  if (errorSesion || !sesion.user) return json({ error: "No autorizado." }, 401);
  const { data: perfil } = await base.from("profiles").select("role,active").eq("user_id", sesion.user.id).maybeSingle();
  if (!perfil?.active || perfil.role !== "admin") return json({ error: "La prueba SMTP requiere rol admin." }, 403);
  let config;
  try { config = configCorreo(Deno.env.toObject()); } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 400); }
  if (config.modo === "demo") return json({ status: "simulado", error: "DEMO_MODE está activo o SMTP no está configurado; no se envió correo." }, 409);
  const { data: ultimaPrueba, error: consultaPrueba } = await base.from("alerts").select("created_at").eq("tipo", "prueba_correo").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (consultaPrueba) return json({ error: consultaPrueba.message }, 500);
  if (ultimaPrueba && Date.now() - new Date(ultimaPrueba.created_at).getTime() < 5 * 60 * 1000) return json({ error: "Espera cinco minutos entre correos de prueba." }, 429);
  const { data: alerta, error: crearError } = await base.from("alerts").insert({
    tipo: "prueba_correo", subject: "Prueba de correo · Control de inventario",
    body: "Este mensaje confirma la aceptación del correo de prueba por el servidor SMTP.",
    items: [{ tipo: "prueba", nota: "Sin datos de inventario" }], recipient: config.to, status: "pendiente", delivery_status: "pendiente",
  }).select("id").single();
  if (crearError) return json({ error: crearError.message }, 500);
  const { data: tomada, error: claimError } = await base.rpc("reclamar_alerta", { p_id: alerta.id });
  if (claimError || !tomada?.length) return json({ alert_id: alerta.id, error: claimError?.message ?? "No se pudo reclamar la prueba." }, 500);
  try {
    const resultado = await enviarCorreo(config, { subject: "Prueba de correo · Control de inventario", body: "Este mensaje confirma la aceptación del correo de prueba por el servidor SMTP." });
    const sentAt = new Date().toISOString();
    const { error } = await base.from("alerts").update({ status: "enviado", delivery_status: "enviado", message_id: resultado.messageId, recipient: config.to, sent_at: sentAt }).eq("id", alerta.id);
    if (error) return json({ alert_id: alerta.id, status: "enviado", message_id: resultado.messageId, warning: error.message }, 500);
    return json({ alert_id: alerta.id, status: "enviado", recipient: config.to, message_id: resultado.messageId, sent_at: sentAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await base.from("alerts").update({ status: "error", delivery_status: "fallido", error: message }).eq("id", alerta.id);
    return json({ alert_id: alerta.id, status: "error", error: message }, 502);
  }
}

Deno.serve((req) => {
  const path = new URL(req.url).pathname;
  if (path.endsWith("/usuarios")) return gestionarUsuarios(req);
  if (path.endsWith("/ordenes/enviar")) return enviarOrdenProveedor(req);
  if (path.endsWith("/correo/prueba")) return probarCorreo(req);
  return manejar(req, deps);
});
