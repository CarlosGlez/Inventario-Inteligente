// Leer y escribir archivos de Excel (.xlsx) en el navegador.
import { ENCABEZADOS, validarFilas } from "./validar.js";

export const LIMITE_BYTES = 2 * 1024 * 1024; // 2 MB

// exceljs es una librería grande: se descarga solo cuando hace falta
// (al importar o exportar), no al abrir la página.
async function cargarExcelJS() {
  const modulo = await import("exceljs");
  return modulo.default ?? modulo;
}

/** Revisa nombre y tamaño ANTES de leer el archivo. Lanza un error si no sirve. */
export function revisarArchivo(archivo) {
  if (!archivo || !archivo.name) {
    throw new Error("Selecciona un archivo .xlsx.");
  }
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Solo se aceptan archivos .xlsx.");
  }
  if (archivo.size > LIMITE_BYTES) {
    throw new Error("El archivo supera el límite de 2 MB.");
  }
}

// Una celda de Excel no siempre es un texto o un número simple. Puede ser una
// fórmula (interesa su resultado), texto con formato o un enlace.
function valorCelda(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "object" || valor instanceof Date) return valor;
  if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text ?? "").join("");
  if ("result" in valor) return valorCelda(valor.result);
  if ("formula" in valor || "sharedFormula" in valor) return null; // fórmula sin calcular
  if ("text" in valor) return valorCelda(valor.text);
  if ("error" in valor) return String(valor.error);
  return String(valor);
}

/**
 * Lee la primera hoja de un .xlsx y devuelve la lista de productos ya validada.
 * Si alguna fila tiene un error, lanza un error con todas las filas malas y
 * no devuelve nada (todo o nada).
 */
export async function leerExcel(buffer) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw new Error("No se pudo leer el archivo .xlsx. Comprueba que sea un Excel válido.");
  }

  const hoja = libro.worksheets[0];
  const filas = [];
  if (hoja) {
    // filas[0] es la fila 1 de Excel, filas[1] la fila 2, etc. Las filas en
    // blanco se conservan para que el número de fila de los errores sea el real.
    for (let numero = 1; numero <= hoja.rowCount; numero++) {
      const celdas = hoja.getRow(numero).values; // la posición 0 no se usa
      const fila = [];
      for (let columna = 1; columna < celdas.length; columna++) {
        fila.push(valorCelda(celdas[columna]));
      }
      filas.push(fila);
    }
  }
  return validarFilas(filas);
}

/** Crea un .xlsx con el mismo formato que acepta la importación. */
export async function crearExcel(productos) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Inventario", { views: [{ state: "frozen", ySplit: 1 }] });

  hoja.addRow(ENCABEZADOS);
  for (const producto of productos) {
    hoja.addRow(ENCABEZADOS.map((campo) => (campo === "costo" ? Number(producto.costo) : producto[campo])));
  }

  hoja.getRow(1).eachCell((celda) => {
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F1B33" } };
  });
  [13, 28, 18, 14, 14, 12].forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
  for (let fila = 2; fila <= hoja.rowCount; fila++) {
    hoja.getCell(fila, 6).numFmt = "$#,##0.00";
  }

  return libro.xlsx.writeBuffer();
}

/** Hace que el navegador descargue el archivo. */
export function descargar(buffer, nombre) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
