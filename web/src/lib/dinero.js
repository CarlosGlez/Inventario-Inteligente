// Leer y mostrar importes de dinero.

// Lo más que cabe en la columna costo de la base: numeric(12,2).
const COSTO_MAXIMO = 9999999999.99;

/**
 * Convierte lo que escribió el usuario (o una celda de Excel) en un número con
 * dos decimales. Acepta "12.50", "12,50" y "$1,250.50".
 * Regla: si hay punto, las comas son de miles; si no hay punto, la coma es decimal.
 */
export function leerCosto(valor, etiqueta = "costo") {
  const mensaje = `${etiqueta}: escribe un importe no negativo, por ejemplo 12.50.`;
  if (valor === null || valor === undefined || typeof valor === "boolean") {
    throw new Error(mensaje);
  }
  let texto = String(valor).trim().replaceAll("$", "").replaceAll(" ", "");
  texto = texto.includes(".") ? texto.replaceAll(",", "") : texto.replaceAll(",", ".");

  // Solo dígitos con un punto opcional. Rechaza "abc", "-1", "nan", "1e3"...
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(texto)) {
    throw new Error(mensaje);
  }
  // Redondeo a centavos: se recorre el punto dos lugares, se redondea y se regresa.
  const numero = Math.round(Number(`${texto}e2`)) / 100;
  if (!Number.isFinite(numero) || numero > COSTO_MAXIMO) {
    throw new Error(mensaje);
  }
  return numero;
}

/** 3751.5 -> "$3,751.50". Lo vacío se muestra como "$0.00". */
export function dinero(valor) {
  const numero = Number(valor ?? 0) || 0;
  return "$" + numero.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
