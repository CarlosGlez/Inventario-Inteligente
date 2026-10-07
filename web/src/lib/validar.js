// Validación de productos: la misma para el formulario y para el Excel.
import { leerCosto } from "./dinero.js";

export const ENCABEZADOS = ["codigo", "nombre", "categoria", "stock_actual", "stock_minimo", "costo"];
// Los Excel anteriores, sin la columna costo, se siguen aceptando.
export const ENCABEZADOS_VIEJOS = ENCABEZADOS.slice(0, 5);

const TEXTO_MAXIMO = 120;
// Lo más que cabe en una columna integer de Postgres.
const ENTERO_MAXIMO = 2147483647;

function estaVacio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === "";
}

/** Devuelve el número si es un entero de 0 en adelante; si no, lanza un error. */
export function enteroNoNegativo(valor, etiqueta) {
  const mensaje = `${etiqueta}: escribe un número entero no negativo.`;
  let numero;
  if (typeof valor === "number") {
    if (!Number.isInteger(valor)) throw new Error(mensaje);
    numero = valor;
  } else if (typeof valor === "string") {
    if (!/^[0-9]+$/.test(valor.trim())) throw new Error(mensaje);
    numero = Number(valor.trim());
  } else {
    throw new Error(mensaje);
  }
  if (numero < 0 || numero > ENTERO_MAXIMO) throw new Error(mensaje);
  return numero;
}

/**
 * Revisa y limpia los datos de un producto. Lanza un error con el nombre del
 * campo si algo está mal. Con costoObligatorio = false (Excel viejo), un costo
 * vacío se devuelve como null: "no cambiar el costo que ya tiene".
 */
export function limpiarProducto(datos, { costoObligatorio = true } = {}) {
  const limpio = {};
  for (const campo of ["codigo", "nombre", "categoria"]) {
    if (estaVacio(datos[campo])) throw new Error(`${campo}: este campo es obligatorio.`);
    limpio[campo] = String(datos[campo]).trim();
    if (limpio[campo].length > TEXTO_MAXIMO) throw new Error(`${campo}: máximo ${TEXTO_MAXIMO} caracteres.`);
  }
  for (const campo of ["stock_actual", "stock_minimo"]) {
    limpio[campo] = enteroNoNegativo(datos[campo], campo);
  }
  if (estaVacio(datos.costo)) {
    if (costoObligatorio) throw new Error("costo: este campo es obligatorio.");
    limpio.costo = null;
  } else {
    limpio.costo = leerCosto(datos.costo, "costo");
  }
  return limpio;
}

/**
 * Valida todas las filas de un Excel ANTES de guardar nada.
 * filas[0] es el encabezado; cada fila es una lista de celdas.
 * Devuelve la lista de productos, o lanza un error con todos los problemas
 * encontrados, cada uno con su número de fila (como se ve en Excel).
 */
export function validarFilas(filas) {
  const nombres = (filas[0] ?? []).map((celda) => (estaVacio(celda) ? "" : String(celda).trim().toLowerCase()));
  while (nombres.length > 0 && nombres[nombres.length - 1] === "") nombres.pop();

  const coincide = (esperado) => nombres.length === esperado.length && esperado.every((n, i) => n === nombres[i]);
  if (!coincide(ENCABEZADOS) && !coincide(ENCABEZADOS_VIEJOS)) {
    throw new Error(`La primera fila debe contener exactamente: ${ENCABEZADOS.join(", ")}.`);
  }

  const productos = [];
  const errores = [];
  const vistos = new Set();
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    if (fila.every(estaVacio)) continue; // fila en blanco
    try {
      const datos = Object.fromEntries(nombres.map((nombre, columna) => [nombre, fila[columna]]));
      const producto = limpiarProducto(datos, { costoObligatorio: false });
      if (vistos.has(producto.codigo)) {
        throw new Error(`codigo: '${producto.codigo}' aparece más de una vez en el archivo.`);
      }
      vistos.add(producto.codigo);
      productos.push(producto);
    } catch (error) {
      errores.push(`Fila ${i + 1}: ${error.message}`);
    }
  }

  if (errores.length > 0) {
    throw new Error("No se importó ningún producto. Corrige estos errores:\n" + errores.join("\n"));
  }
  if (productos.length === 0) {
    throw new Error("El archivo no contiene productos.");
  }
  return productos;
}
