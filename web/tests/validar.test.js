import { describe, expect, it } from "vitest";
import {
  ENCABEZADOS,
  ENCABEZADOS_VIEJOS,
  enteroNoNegativo,
  limpiarProducto,
  validarFilas,
} from "../src/lib/validar.js";

const BASE = { codigo: "X1", nombre: "Prueba", categoria: "Clase", stock_actual: "2", stock_minimo: "5", costo: "10" };

describe("enteroNoNegativo", () => {
  it("acepta enteros como texto o como número", () => {
    expect(enteroNoNegativo("7", "stock_actual")).toBe(7);
    expect(enteroNoNegativo(" 7 ", "stock_actual")).toBe(7);
    expect(enteroNoNegativo(5.0, "stock_actual")).toBe(5);
    expect(enteroNoNegativo(0, "stock_actual")).toBe(0);
    expect(enteroNoNegativo(2147483647, "stock_actual")).toBe(2147483647);
  });

  it("rechaza negativos, decimales, texto y vacíos", () => {
    for (const malo of [-1, "-1", 1.5, "1.5", "abc", "", null, undefined, true, "1e3", NaN, {}]) {
      expect(() => enteroNoNegativo(malo, "stock_actual"), `valor: ${String(malo)}`)
        .toThrow("stock_actual: escribe un número entero no negativo.");
    }
  });

  it("rechaza números que no caben en la base de datos", () => {
    expect(() => enteroNoNegativo(2147483648, "stock_minimo"))
      .toThrow("stock_minimo: escribe un número entero no negativo.");
    expect(() => enteroNoNegativo("99999999999", "stock_minimo")).toThrow(/^stock_minimo:/);
  });
});

describe("limpiarProducto", () => {
  it("quita espacios y convierte los números", () => {
    expect(limpiarProducto({ ...BASE, codigo: " X1 ", nombre: " Prueba " }))
      .toEqual({ codigo: "X1", nombre: "Prueba", categoria: "Clase", stock_actual: 2, stock_minimo: 5, costo: 10 });
  });

  it("exige código, nombre y categoría", () => {
    expect(() => limpiarProducto({ ...BASE, nombre: "" })).toThrow("nombre: este campo es obligatorio.");
    expect(() => limpiarProducto({ ...BASE, codigo: "   " })).toThrow("codigo: este campo es obligatorio.");
    expect(() => limpiarProducto({ ...BASE, categoria: null })).toThrow("categoria: este campo es obligatorio.");
  });

  it("limita los textos a 120 caracteres", () => {
    expect(() => limpiarProducto({ ...BASE, codigo: "x".repeat(121) })).toThrow("codigo: máximo 120 caracteres.");
    expect(limpiarProducto({ ...BASE, codigo: "x".repeat(120) }).codigo).toHaveLength(120);
  });

  it("valida los dos stocks", () => {
    expect(() => limpiarProducto({ ...BASE, stock_actual: "-1" })).toThrow(/^stock_actual:/);
    expect(() => limpiarProducto({ ...BASE, stock_minimo: "1.5" })).toThrow(/^stock_minimo:/);
  });

  it("el costo es obligatorio en el formulario", () => {
    expect(() => limpiarProducto({ ...BASE, costo: "" })).toThrow("costo: este campo es obligatorio.");
    expect(() => limpiarProducto({ ...BASE, costo: undefined })).toThrow("costo: este campo es obligatorio.");
    expect(() => limpiarProducto({ ...BASE, costo: "abc" })).toThrow(/^costo: escribe un importe/);
  });

  it("el costo puede faltar al importar un Excel viejo", () => {
    expect(limpiarProducto({ ...BASE, costo: undefined }, { costoObligatorio: false }).costo).toBeNull();
    expect(limpiarProducto({ ...BASE, costo: " " }, { costoObligatorio: false }).costo).toBeNull();
    expect(limpiarProducto({ ...BASE, costo: "$1,250.50" }, { costoObligatorio: false }).costo).toBe(1250.5);
  });
});

describe("validarFilas", () => {
  it("convierte las filas en productos", () => {
    expect(validarFilas([ENCABEZADOS, ["P001", "Cuaderno", "Papelería", 24, 8, 45], ["P002", "Lápiz", "Papelería", "40", "15", "$6.50"]]))
      .toEqual([
        { codigo: "P001", nombre: "Cuaderno", categoria: "Papelería", stock_actual: 24, stock_minimo: 8, costo: 45 },
        { codigo: "P002", nombre: "Lápiz", categoria: "Papelería", stock_actual: 40, stock_minimo: 15, costo: 6.5 },
      ]);
  });

  it("reporta los errores con su número de fila y no devuelve nada", () => {
    let mensaje = "";
    try {
      validarFilas([ENCABEZADOS, ["P020", "Bien", "Otra", 1, 2, 1], ["P021", "Mal", "Otra", -1, 2, 1], ["", "Sin código", "Otra", 1, 1, 1]]);
    } catch (error) {
      mensaje = error.message;
    }
    expect(mensaje).toBe(
      "No se importó ningún producto. Corrige estos errores:\n"
      + "Fila 3: stock_actual: escribe un número entero no negativo.\n"
      + "Fila 4: codigo: este campo es obligatorio.",
    );
  });

  it("un código repetido dentro del archivo es error", () => {
    expect(() => validarFilas([ENCABEZADOS, ["P1", "A", "Otra", 1, 1, 1], ["P1", "B", "Otra", 1, 1, 1]]))
      .toThrow("Fila 3: codigo: 'P1' aparece más de una vez en el archivo.");
  });

  it("acepta el encabezado con mayúsculas, espacios y celdas vacías al final", () => {
    const filas = [[" Codigo ", "NOMBRE", "categoria", "stock_actual", "stock_minimo", "costo", null, ""], ["P1", "A", "Otra", 1, 1, 1, null, null]];
    expect(validarFilas(filas)).toHaveLength(1);
  });

  it("acepta el formato viejo sin costo y deja el costo en null", () => {
    expect(validarFilas([ENCABEZADOS_VIEJOS, ["L1", "Viejo", "Otra", 8, 1], ["L2", "Nuevo", "Otra", 2, 1]]).map((p) => p.costo))
      .toEqual([null, null]);
  });

  it("rechaza un encabezado distinto", () => {
    const esperado = "La primera fila debe contener exactamente: codigo, nombre, categoria, stock_actual, stock_minimo, costo.";
    expect(() => validarFilas([["nombre", "codigo", "categoria", "stock_actual", "stock_minimo", "costo"], ["A", "P1", "Otra", 1, 1, 1]])).toThrow(esperado);
    expect(() => validarFilas([["codigo", "nombre"], ["P1", "A"]])).toThrow(esperado);
    expect(() => validarFilas([])).toThrow(esperado);
  });

  it("salta las filas vacías pero conserva el número real de fila", () => {
    const filas = [ENCABEZADOS, [null, null, null, null, null, null], ["  ", "", null], ["P1", "A", "Otra", -1, 1, 1]];
    expect(() => validarFilas(filas)).toThrow("Fila 4: stock_actual");
  });

  it("un archivo solo con encabezado no contiene productos", () => {
    expect(() => validarFilas([ENCABEZADOS])).toThrow("El archivo no contiene productos.");
    expect(() => validarFilas([ENCABEZADOS, [null, "", " "]])).toThrow("El archivo no contiene productos.");
  });
});
