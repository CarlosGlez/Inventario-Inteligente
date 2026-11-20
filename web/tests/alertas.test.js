import { describe, expect, it } from "vitest";
import { calcularReposicion, crearCsvAlertas } from "../src/lib/alertas.js";

describe("cálculos de reposición y exportación UTF-8", () => {
  it("calcula el subtotal desde el faltante y costo unitario, ignorando un snapshot viejo", () => {
    expect(calcularReposicion({
      stock_actual: 5, stock_minimo: 12, costo: 8, costo_reponer: 7464,
    })).toEqual({ faltante: 7, costoUnitario: 8, subtotal: 56 });
  });

  it("agrega BOM UTF-8 y conserva acentos, eñes y comillas en CSV", () => {
    const csv = crearCsvAlertas([{
      id: 30, created_at: "2026-11-18", tipo: "Alerta de stock",
      recipient: 'Almacén "Norte"', status: "simulado", attempts: 1,
    }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Alerta de stock");
    expect(csv).toContain("Almacén");
    expect(csv).toContain('"Almacén ""Norte"""');
  });
});
