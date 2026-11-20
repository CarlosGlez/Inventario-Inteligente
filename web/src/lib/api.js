// Todas las llamadas a Supabase están aquí. Las pantallas no hablan con la
// base directamente: usan estas funciones. Si algo falla, lanzan un Error con
// un mensaje en español listo para mostrarse.
import { mensajeError } from "./errores.js";
import { supabase } from "./supabase.js";
import { enteroNoNegativo, limpiarProducto } from "./validar.js";

const LIMITE_LISTADOS = 200;
const TAMANO_PAGINA = 1000;

function revisar({ data, error }) {
  if (error) throw new Error(mensajeError(error));
  return data;
}

async function cargarVentasAnuales() {
  const filas = [];
  for (let inicio = 0; inicio < 20000; inicio += TAMANO_PAGINA) {
    const pagina = revisar(await supabase.from("ventas_diarias_365d").select("*")
      .order("product_code").order("fecha").range(inicio, inicio + TAMANO_PAGINA - 1));
    filas.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) return filas;
  }
  return filas;
}

// Orden alfabético sin distinguir mayúsculas ni acentos.
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });

// ---- Sesión -----------------------------------------------------------------

export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function obtenerPerfil(userId = null) {
  if (!userId) {
    const { data: usuario } = await supabase.auth.getUser();
    userId = usuario?.user?.id;
  }
  if (!userId) return null;
  return revisar(await supabase.from("profiles").select("user_id, role, active").eq("user_id", userId).single());
}

/** Avisa cada vez que la sesión cambia. Devuelve una función para dejar de escuchar. */
export function alCambiarSesion(avisar) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => avisar(sesion));
  return () => data.subscription.unsubscribe();
}

export async function iniciarSesion(correo, clave) {
  revisar(await supabase.auth.signInWithPassword({ email: correo, password: clave }));
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
}

// ---- Inventario -------------------------------------------------------------

export async function cargarResumen() {
  return revisar(await supabase.from("resumen_inventario").select("*").single());
}

export async function listarProductosBajos() {
  return revisar(await supabase.from("products").select("id,codigo,nombre,stock_actual,stock_minimo,costo"));
}

export async function consultarModoCorreo() {
  const { data, error } = await supabase.functions.invoke("revisar-inventario/modo-correo", { method: "GET" });
  if (error) throw new Error(mensajeError(error));
  return data?.demo === true;
}

/** Lo que necesita la pantalla principal, en una sola ida a la base. */
export async function cargarInventario() {
  const [productos, consumo, ventas, resumen] = await Promise.all([
    supabase.from("products").select("*"),
    supabase.from("consumo_30d").select("*"),
    cargarVentasAnuales(),
    supabase.from("resumen_inventario").select("*").single(),
  ]);
  return {
    productos: revisar(productos).sort(porNombre),
    consumo: revisar(consumo),
    ventas,
    resumen: revisar(resumen),
  };
}

/** Crea un producto (id = null) o edita uno existente. */
export async function guardarProducto(datos, id = null) {
  const producto = limpiarProducto(datos);
  if (id === null) {
    revisar(await supabase.from("products").insert(producto));
    return;
  }
  const filas = revisar(await supabase.from("products").update(producto).eq("id", id).select("id"));
  if (filas.length === 0) throw new Error("El producto ya no existe.");
}

export async function eliminarProducto(id) {
  revisar(await supabase.from("products").delete().eq("id", id));
}

/** Elimina todos los productos en una sola operación y devuelve cuántos fueron. */
export async function eliminarTodosProductos() {
  const filas = revisar(await supabase.from("products").delete().not("id", "is", null).select("id"));
  return filas.length;
}

/** Registra una entrada o salida. La base rechaza lo que dejaría el stock negativo. */
export async function registrarMovimiento(id, tipo, cantidad, motivo = "venta") {
  const unidades = enteroNoNegativo(cantidad, "cantidad");
  if (unidades === 0) throw new Error("cantidad: debe ser mayor que cero.");
  return revisar(await supabase.rpc("registrar_movimiento", {
    p_producto_id: id, p_tipo: tipo, p_cantidad: unidades, p_motivo: tipo === "entrada" ? "otro" : motivo,
  }));
}

/** Guarda todos los productos del Excel en una sola transacción (todo o nada). */
export async function importarProductos(items) {
  return revisar(await supabase.rpc("importar_productos_con_permiso", { p_items: items }));
}

export async function listarMovimientos() {
  return revisar(await supabase.from("movements").select("*").order("id", { ascending: false }).limit(LIMITE_LISTADOS));
}

export async function listarAlertas() {
  return revisar(await supabase.from("alerts").select("*").order("id", { ascending: false }).limit(LIMITE_LISTADOS));
}

export async function listarProveedores() {
  return revisar(await supabase.from("proveedores").select("*").order("nombre"));
}

export async function guardarProveedor(proveedor, id = null) {
  if (id === null) return revisar(await supabase.from("proveedores").insert(proveedor).select().single());
  return revisar(await supabase.from("proveedores").update(proveedor).eq("id", id).select().single());
}

export async function vincularProductoProveedor(proveedorId, productId, costoUnitario, minimoUnidades) {
  return revisar(await supabase.from("proveedor_productos").upsert({
    proveedor_id: proveedorId, product_id: productId, costo_unitario: costoUnitario, minimo_unidades: minimoUnidades,
  }));
}

export async function listarOrdenes() {
  return revisar(await supabase.from("ordenes_compra").select("*, proveedores(nombre), orden_lineas(*, products(codigo,nombre))").order("created_at", { ascending: false }));
}

export async function crearBorradores(alertaId) {
  return revisar(await supabase.rpc("crear_ordenes_desde_alerta", { p_alerta_id: alertaId }));
}

export async function recibirLineaOrden(lineaId, cantidad) {
  return revisar(await supabase.rpc("recibir_linea_orden", { p_linea_id: lineaId, p_cantidad: Number(cantidad) }));
}

export async function enviarOrdenProveedor(ordenId) {
  const { data, error } = await supabase.functions.invoke("revisar-inventario/ordenes/enviar", { body: { orden_id: ordenId } });
  if (error) throw new Error(mensajeError(error));
  return data;
}

export async function listarPerfiles() {
  const { data, error } = await supabase.functions.invoke("revisar-inventario/usuarios", { method: "GET" });
  if (error) throw new Error(mensajeError(error));
  return data;
}

export async function actualizarPerfil(userId, role, active) {
  return revisar(await supabase.functions.invoke("revisar-inventario/usuarios", { body: { user_id: userId, role, active } }));
}

export async function crearUsuario(email, password, role) {
  const { data, error } = await supabase.functions.invoke("revisar-inventario/usuarios", { body: { email, password, role } });
  if (error) throw new Error(mensajeError(error));
  return data;
}

// ---- El bot -----------------------------------------------------------------

async function llamarBot(cuerpo) {
  const { data, error } = await supabase.functions.invoke("revisar-inventario", { body: cuerpo });
  if (error) {
    // Si la función respondió con un error, el motivo viene en el cuerpo.
    let detalle = null;
    try {
      detalle = await error.context?.json?.();
    } catch {
      // la respuesta no traía JSON
    }
    throw new Error(mensajeError({ status: error.context?.status, message: detalle?.error ?? error.message }));
  }
  return data;
}

/** Botón "Revisar inventario ahora". */
export function revisarAhora() {
  return llamarBot({});
}

/** Botón "Enviar reporte ahora": crea el reporte semanal y lo manda. */
export function enviarReporte() {
  return llamarBot({ accion: "reporte" });
}

/** Botón "Reintentar envío". Sirve igual para alertas y para reportes. */
export function reintentarAlerta(id) {
  return llamarBot({ alert_id: id });
}
