// Todas las llamadas a Supabase están aquí. Las pantallas no hablan con la
// base directamente: usan estas funciones. Si algo falla, lanzan un Error con
// un mensaje en español listo para mostrarse.
import { mensajeError } from "./errores.js";
import { supabase } from "./supabase.js";
import { enteroNoNegativo, limpiarProducto } from "./validar.js";

const LIMITE_LISTADOS = 200;

function revisar({ data, error }) {
  if (error) throw new Error(mensajeError(error));
  return data;
}

// Orden alfabético sin distinguir mayúsculas ni acentos.
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });

// ---- Sesión -----------------------------------------------------------------

export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
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

/** Lo que necesita la pantalla principal, en una sola ida a la base. */
export async function cargarInventario() {
  const [productos, consumo, resumen] = await Promise.all([
    supabase.from("products").select("*"),
    supabase.from("consumo_30d").select("*"),
    supabase.from("resumen_inventario").select("*").single(),
  ]);
  return {
    productos: revisar(productos).sort(porNombre),
    consumo: revisar(consumo),
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

/** Registra una entrada o salida. La base rechaza lo que dejaría el stock negativo. */
export async function registrarMovimiento(id, tipo, cantidad) {
  const unidades = enteroNoNegativo(cantidad, "cantidad");
  if (unidades === 0) throw new Error("cantidad: debe ser mayor que cero.");
  return revisar(await supabase.rpc("registrar_movimiento", {
    p_producto_id: id, p_tipo: tipo, p_cantidad: unidades,
  }));
}

/** Guarda todos los productos del Excel en una sola transacción (todo o nada). */
export async function importarProductos(items) {
  return revisar(await supabase.rpc("importar_productos", { p_items: items }));
}

export async function listarMovimientos() {
  return revisar(await supabase.from("movements").select("*").order("id", { ascending: false }).limit(LIMITE_LISTADOS));
}

export async function listarAlertas() {
  return revisar(await supabase.from("alerts").select("*").order("id", { ascending: false }).limit(LIMITE_LISTADOS));
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
