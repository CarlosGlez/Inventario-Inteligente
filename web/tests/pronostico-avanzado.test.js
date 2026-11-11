import { describe, expect, it } from "vitest";
import { baseline30, mediaPonderada, pronosticarEstacional, pronosticoProducto, seleccionarModelo, serieDiaria } from "../src/lib/pronostico-avanzado.js";

const fecha = (d) => new Date(Date.UTC(2025, 0, 1 + d)).toISOString().slice(0, 10);

describe("pronóstico avanzado", () => {
  it("rellena huecos con cero y descarta cantidades negativas", () => {
    const s = serieDiaria([{ fecha: fecha(0), cantidad: 3 }, { fecha: fecha(2), cantidad: -7 }], fecha(0), fecha(2));
    expect(s.map((x) => x.cantidad)).toEqual([3, 0, 0]);
  });
  it("devuelve cero y baseline para historial vacío", () => {
    const s = serieDiaria([], null, fecha(0));
    expect(baseline30(s)).toBe(0);
    expect(seleccionarModelo(s).modelo).toBe("baseline30");
  });
  it("calcula media ponderada con más peso a los datos recientes", () => {
    expect(mediaPonderada([{ cantidad: 0 }, { cantidad: 10 }])).toBeCloseTo(20 / 3);
  });
  it("conserva el denominador heredado desde la primera salida de la ventana", () => {
    const s = serieDiaria([{ fecha: fecha(0), cantidad: 5 }, { fecha: fecha(2), cantidad: 4 }], fecha(0), fecha(2));
    expect(baseline30(s)).toBe(4.5);
  });
  it("degrada la estacionalidad con poco historial", () => {
    const s = [{ fecha: fecha(0), cantidad: 4 }, { fecha: fecha(1), cantidad: 8 }];
    expect(pronosticarEstacional(s, fecha(2), 2)).toEqual([6, 6]);
  });
  it("produce modelo, intervalo y fecha estimada", () => {
    const hoy = fecha(99);
    const obs = Array.from({ length: 100 }, (_, i) => ({ fecha: fecha(i), cantidad: 2 }));
    const p = pronosticoProducto({ codigo: "X", stock_actual: 20 }, obs, hoy);
    expect(p).toMatchObject({ modelo_pronostico: expect.any(String), fecha_agotamiento_estimada: expect.any(String), confianza: expect.any(String) });
    expect(p.intervalo.inferior).toBeLessThanOrEqual(p.demanda_diaria_esperada);
  });
  it("permite historial completamente sin demanda", () => {
    const s = serieDiaria([{ fecha: fecha(0), cantidad: 0 }], fecha(0), fecha(80));
    expect(seleccionarModelo(s).modelo).toBe("baseline30");
  });
  it("producto nuevo sin historial no inventa una fecha de agotamiento", () => {
    const p = pronosticoProducto({ codigo: "NUEVO", stock_actual: 10 }, [], fecha(0));
    expect(p.fecha_agotamiento_estimada).toBeNull();
    expect(p.modelo_pronostico).toBe("baseline30");
  });
  it("tolera un pico atípico manteniendo valores finitos y no negativos", () => {
    const obs = Array.from({ length: 90 }, (_, i) => ({ fecha: fecha(i), cantidad: i === 80 ? 100000 : 1 }));
    const p = pronosticoProducto({ codigo: "PICO", stock_actual: 15 }, obs, fecha(89));
    expect(Number.isFinite(p.demanda_diaria_esperada)).toBe(true);
    expect(p.demanda_diaria_esperada).toBeGreaterThanOrEqual(0);
    expect(p.intervalo.inferior).toBeGreaterThanOrEqual(0);
  });
});
