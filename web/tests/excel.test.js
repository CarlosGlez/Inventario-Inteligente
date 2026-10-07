import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { LIMITE_BYTES, crearExcel, leerExcel, revisarArchivo } from "../src/lib/excel.js";
import { ENCABEZADOS, ENCABEZADOS_VIEJOS } from "../src/lib/validar.js";

// Arma un .xlsx en memoria con las filas indicadas.
async function libro(filas) {
  const book = new ExcelJS.Workbook();
  const hoja = book.addWorksheet("Inventario");
  filas.forEach((fila) => hoja.addRow(fila));
  return book.xlsx.writeBuffer();
}

describe("leerExcel", () => {
  it("lee el Excel de ejemplo que se entrega: 16 productos, 6 con stock bajo", async () => {
    const ejemplo = readFileSync(new URL("../public/inventario_ejemplo.xlsx", import.meta.url));
    const productos = await leerExcel(ejemplo);
    expect(productos).toHaveLength(16);
    expect(productos.filter((p) => p.stock_actual < p.stock_minimo)).toHaveLength(6);
    expect(productos[0]).toEqual({
      codigo: "P001", nombre: "Cuaderno profesional", categoria: "Papelería", stock_actual: 24, stock_minimo: 8, costo: 45,
    });
  });

  it("lee el formato viejo sin costo", async () => {
    const productos = await leerExcel(await libro([ENCABEZADOS_VIEJOS, ["L1", "Viejo", "Otra", 8, 1]]));
    expect(productos).toEqual([{ codigo: "L1", nombre: "Viejo", categoria: "Otra", stock_actual: 8, stock_minimo: 1, costo: null }]);
  });

  it("lee el valor calculado de las fórmulas, el texto enriquecido y los números guardados como texto", async () => {
    const productos = await leerExcel(await libro([
      ENCABEZADOS,
      [
        { richText: [{ text: "P" }, { font: { bold: true }, text: "9" }] },
        { text: "Con enlace", hyperlink: "https://example.com" },
        "Otra",
        { formula: "2+3", result: 5 },
        "7",
        { formula: "10*1.5", result: 15 },
      ],
    ]));
    expect(productos).toEqual([{ codigo: "P9", nombre: "Con enlace", categoria: "Otra", stock_actual: 5, stock_minimo: 7, costo: 15 }]);
  });

  it("reporta el número de fila tal como se ve en Excel, aunque haya filas en blanco", async () => {
    const buffer = await libro([ENCABEZADOS, ["P1", "A", "Otra", 1, 1, 1], [], ["P2", "B", "Otra", -1, 1, 1]]);
    await expect(leerExcel(buffer)).rejects.toThrow("Fila 4: stock_actual: escribe un número entero no negativo.");
  });

  it("rechaza un archivo que no es un Excel de verdad", async () => {
    const basura = new TextEncoder().encode("esto no es un excel, es texto con otro nombre");
    await expect(leerExcel(basura)).rejects.toThrow("No se pudo leer el archivo .xlsx. Comprueba que sea un Excel válido.");
  });

  it("un libro con la hoja vacía pide el encabezado", async () => {
    await expect(leerExcel(await libro([]))).rejects.toThrow("La primera fila debe contener exactamente");
  });
});

describe("crearExcel", () => {
  const productos = [
    { id: 1, codigo: "C1", nombre: "Tóner", categoria: "Oficina", stock_actual: 1, stock_minimo: 4, costo: 1250.5, low_active: true },
    { id: 2, codigo: "C2", nombre: "Hojas", categoria: "Oficina", stock_actual: 10, stock_minimo: 2, costo: 99.99, low_active: false },
  ];

  it("lo exportado se puede volver a importar sin perder nada", async () => {
    const leidos = await leerExcel(await crearExcel(productos));
    expect(leidos).toEqual(productos.map(({ codigo, nombre, categoria, stock_actual, stock_minimo, costo }) =>
      ({ codigo, nombre, categoria, stock_actual, stock_minimo, costo })));
  });

  it("conserva el formato del Excel original", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await crearExcel(productos));
    const hoja = book.worksheets[0];
    expect(hoja.name).toBe("Inventario");
    expect(hoja.getRow(1).values.slice(1)).toEqual(ENCABEZADOS);
    expect(hoja.getCell("A1").font.bold).toBe(true);
    expect(hoja.getCell("A1").fill.fgColor.argb).toBe("FF0F1B33");
    expect(hoja.getCell("F2").numFmt).toBe("$#,##0.00");
    expect(hoja.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });
});

describe("revisarArchivo", () => {
  it("acepta un .xlsx de hasta 2 MB", () => {
    expect(() => revisarArchivo({ name: "Inventario.XLSX", size: LIMITE_BYTES })).not.toThrow();
  });

  it("rechaza otros tipos de archivo", () => {
    expect(() => revisarArchivo({ name: "a.csv", size: 10 })).toThrow("Solo se aceptan archivos .xlsx.");
    expect(() => revisarArchivo({ name: "a.xls", size: 10 })).toThrow("Solo se aceptan archivos .xlsx.");
  });

  it("rechaza archivos de más de 2 MB", () => {
    expect(LIMITE_BYTES).toBe(2 * 1024 * 1024);
    expect(() => revisarArchivo({ name: "a.xlsx", size: LIMITE_BYTES + 1 })).toThrow("El archivo supera el límite de 2 MB.");
  });

  it("pide un archivo si no hay ninguno", () => {
    expect(() => revisarArchivo(null)).toThrow("Selecciona un archivo .xlsx.");
  });
});
