import { describe, expect, it } from "vitest";
import { dinero, leerCosto } from "../src/lib/dinero.js";

describe("leerCosto", () => {
  it("acepta punto decimal", () => {
    expect(leerCosto("12.50")).toBe(12.5);
    expect(leerCosto(".5")).toBe(0.5);
  });

  it("acepta coma decimal cuando no hay punto", () => {
    expect(leerCosto("12,50")).toBe(12.5);
  });

  it("acepta signo de pesos y comas de miles", () => {
    expect(leerCosto("$1,250.50")).toBe(1250.5);
    expect(leerCosto("$1,250.5")).toBe(1250.5);
    expect(leerCosto(" $ 1,250.50 ")).toBe(1250.5);
  });

  it("acepta números que ya vienen como número", () => {
    expect(leerCosto(45)).toBe(45);
    expect(leerCosto(0)).toBe(0);
    expect(leerCosto(99.99)).toBe(99.99);
  });

  it("redondea a dos decimales", () => {
    expect(leerCosto("12.345")).toBe(12.35);
    expect(leerCosto("12.344")).toBe(12.34);
  });

  it("rechaza lo que no es un importe no negativo", () => {
    for (const malo of ["-1", -1, "abc", "", "  ", "nan", NaN, Infinity, null, undefined, true, false, "1e3", "1.2.3", "12abc", {}]) {
      expect(() => leerCosto(malo), `valor: ${String(malo)}`)
        .toThrow("costo: escribe un importe no negativo, por ejemplo 12.50.");
    }
  });

  it("rechaza importes que no caben en la base de datos", () => {
    expect(leerCosto("9999999999.99")).toBe(9999999999.99);
    expect(() => leerCosto("10000000000")).toThrow(/^costo:/);
  });

  it("usa la etiqueta que se le indique", () => {
    expect(() => leerCosto("x", "precio")).toThrow(/^precio:/);
  });
});

describe("dinero", () => {
  it("da formato con signo de pesos, miles y dos decimales", () => {
    expect(dinero(3751.5)).toBe("$3,751.50");
    expect(dinero(45)).toBe("$45.00");
    expect(dinero(1234567.8)).toBe("$1,234,567.80");
  });

  it("trata lo vacío como cero", () => {
    expect(dinero(null)).toBe("$0.00");
    expect(dinero(undefined)).toBe("$0.00");
    expect(dinero(0)).toBe("$0.00");
  });
});
