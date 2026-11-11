import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const confirmation = process.env.DEMO_ALLOW_SEED;
const url = process.env.DEMO_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (confirmation !== "INVENTARIO_DEMO" || !url || !key) {
  throw new Error("Seed bloqueado. Requiere DEMO_ALLOW_SEED=INVENTARIO_DEMO, DEMO_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error("DEMO_SUPABASE_URL debe ser el endpoint de un proyecto Supabase dedicado.");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const exigir = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
let seed = 4172026;
const azar = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const roles = ["admin", "almacen", "compras", "consulta"];
const credenciales = [];

async function main() {
  const pagina = exigir(await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const existentes = new Map(pagina.users.map((u) => [u.email, u]));
  for (const role of roles) {
    const email = `demo-${role}@example.invalid`;
    const password = randomBytes(15).toString("base64url") + "A9!";
    let user = existentes.get(email);
    if (user) {
      user = exigir(await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true })).user;
    } else {
      user = exigir(await supabase.auth.admin.createUser({ email, password, email_confirm: true })).user;
    }
    exigir(await supabase.from("profiles").upsert({ user_id: user.id, role, active: true }));
    credenciales.push({ role, email, password });
  }

  const productos = Array.from({ length: 18 }, (_, i) => ({
    codigo: `D-${String(i + 1).padStart(2, "0")}`, nombre: `Demo producto ${String(i + 1).padStart(2, "0")}`,
    categoria: ["Papelería", "Limpieza", "Empaque"][i % 3], stock_actual: i % 4 === 0 ? 3 : 20 + i,
    stock_minimo: i % 4 === 0 ? 8 : 7, costo: 12.5 + i * 2, low_active: false,
  }));
  exigir(await supabase.from("products").upsert(productos, { onConflict: "codigo" }));
  const filas = exigir(await supabase.from("products").select("id,codigo,nombre,costo").like("codigo", "D-%"));
  const porCodigo = new Map(filas.map((p) => [p.codigo, p]));

  // Reemplaza solo artefactos identificados por el prefijo demo D- en el
  // proyecto dedicado que se confirmó arriba.
  exigir(await supabase.from("ordenes_compra").delete().like("folio", "DEMO-%"));
  exigir(await supabase.from("alerts").delete().like("subject", "[DEMO]%"));
  exigir(await supabase.from("movements").delete().like("product_code", "D-%"));

  const inicio = new Date(); inicio.setUTCDate(inicio.getUTCDate() - 364);
  const movimientos = [];
  for (const p of filas) for (let i = 0; i < 365; i++) {
    const fecha = new Date(inicio); fecha.setUTCDate(inicio.getUTCDate() + i);
    const cantidad = i % 3 === 0 ? Math.floor(azar() * (2 + (Number(p.codigo.slice(-2)) % 7))) : 0;
    if (!cantidad) continue;
    movimientos.push({ product_code: p.codigo, product_name: p.nombre, tipo: "salida", motivo: "venta", cantidad,
      stock_anterior: 100, stock_nuevo: 100 - cantidad, created_at: fecha.toISOString() });
  }
  for (let i = 0; i < movimientos.length; i += 500) exigir(await supabase.from("movements").insert(movimientos.slice(i, i + 500)));

  let { data: proveedor, error } = await supabase.from("proveedores").select("id").eq("nombre", "Proveedor Demo Equipo 4").maybeSingle();
  if (error) throw new Error(error.message);
  if (!proveedor) proveedor = exigir(await supabase.from("proveedores").insert({ nombre: "Proveedor Demo Equipo 4", correo: "proveedor@example.invalid", telefono: "5550000000", lead_time_dias: 5, minimo_compra: 100 }).select("id").single());
  exigir(await supabase.from("proveedor_productos").upsert(filas.slice(0, 6).map((p) => ({ proveedor_id: proveedor.id, product_id: p.id, costo_unitario: p.costo, minimo_unidades: 2 }))));

  const p = porCodigo.get("D-01");
  const alert = exigir(await supabase.from("alerts").insert({ tipo: "stock_bajo", subject: "[DEMO] Alerta de inventario", body: "Correo de demostración; no enviado.", status: "simulado", delivery_status: "simulado", recipient: "modo demo; sin destinatario real", items: [{ id: p.id, codigo: p.codigo, nombre: p.nombre, stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, costo: p.costo, faltante: p.stock_minimo - p.stock_actual, cantidad_sugerida: 10 }] }).select("id").single());
  const orden = exigir(await supabase.from("ordenes_compra").insert({ folio: `DEMO-${Date.now()}`, proveedor_id: proveedor.id, estado: "borrador", alerta_id: alert.id }).select("id").single());
  exigir(await supabase.from("orden_lineas").insert({ orden_id: orden.id, product_id: p.id, cantidad: 10, costo_unitario: p.costo }));

  console.log("Datos ficticios cargados. Cuentas demo (contraseñas aleatorias, válidas hasta la próxima ejecución):");
  console.table(credenciales);
  console.log(`Productos: ${filas.length}; movimientos sintéticos: ${movimientos.length}; proveedores: 1; alertas: 1; órdenes: 1.`);
  console.log("Mantén DEMO_MODE=true en los secrets de Supabase.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
