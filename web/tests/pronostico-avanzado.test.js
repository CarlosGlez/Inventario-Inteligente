import { describe, expect, it } from "vitest";
import { baseline30, mediaPonderada, pronosticarEstacional, pronosticoProducto, resumenVentas, seleccionarModelo, serieDiaria, ventanaVentas } from "../src/lib/pronostico-avanzado.js";

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
  it("el baseline divide entre 30 días calendario, incluidos los días sin ventas", () => {
    const s = serieDiaria([{ fecha: fecha(0), cantidad: 5 }, { fecha: fecha(2), cantidad: 4 }], fecha(0), fecha(2));
    expect(baseline30(s)).toBeCloseTo(9 / 30);
  });
  it("la ventana de ventas tiene exactamente los días pedidos y rellena con cero", () => {
    for (const dias of [30, 60, 90]) {
      const v = ventanaVentas([{ fecha: fecha(99), cantidad: 4 }], dias, fecha(99));
      expect(v).toHaveLength(dias);
      expect(v.at(-1)).toEqual({ fecha: fecha(99), cantidad: 4 });
      expect(v.filter((d) => d.cantidad === 0)).toHaveLength(dias - 1);
    }
  });
  it("resume unidades y promedio del periodo seleccionado", () => {
    const obs = [{ fecha: fecha(99), cantidad: 30 }, { fecha: fecha(50), cantidad: 30 }, { fecha: fecha(5), cantidad: 90 }];
    expect(resumenVentas(obs, 30, fecha(99))).toEqual({ unidades: 30, promedio_diario: 1 });
    expect(resumenVentas(obs, 60, fecha(99))).toEqual({ unidades: 60, promedio_diario: 1 });
    expect(resumenVentas(obs, 90, fecha(99))).toEqual({ unidades: 60, promedio_diario: 60 / 90 });
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
