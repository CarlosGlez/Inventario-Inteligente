import { describe, expect, it } from "vitest";
import { analizarProductos, conPronostico, prioridadReabasto } from "../src/lib/pronostico.js";

const ahora = new Date("2026-10-05T12:00:00Z");
const hace = (dias) => new Date(ahora.getTime() - dias * 86400000).toISOString().slice(0, 10);
const porCodigo = (lista) => Object.fromEntries(lista.map((p) => [p.codigo, p]));
// Ventas de la vista ventas_diarias_365d: solo salidas con motivo venta.
const venta = (codigo, dias, cantidad) => ({ product_code: codigo, fecha: hace(dias), cantidad });

describe("conPronostico", () => {
  const productos = [
    { id: 1, codigo: "F1", nombre: "Rápido", categoria: "X", stock_actual: 4, stock_minimo: 2, costo: 3 },
    { id: 2, codigo: "F2", nombre: "Lento", categoria: "X", stock_actual: 49, stock_minimo: 2, costo: 1 },
    { id: 3, codigo: "F3", nombre: "Bajo sin uso", categoria: "X", stock_actual: 1, stock_minimo: 4, costo: 2 },
  ];
  // 480 u. en 30 días = 16 u./día; 30 u. en 30 días = 1 u./día.
  const ventas = [venta("F1", 0, 480), venta("F2", 0, 30)];
  const r = porCodigo(conPronostico(productos, ventas, ahora));

  it("un producto que se vende rápido se agota pronto y pide cubrir 14 días", () => {
    expect(r.F1).toMatchObject({ consumo_diario: 16, dias_restantes: 0, sugerido: 16 * 14 - 4, costo_sugerido: 660, bajo: false, urgente: true });
  });

  it("un producto de venta lenta no es urgente", () => {
    expect(r.F2).toMatchObject({ consumo_diario: 1, dias_restantes: 49, sugerido: 0, urgente: false });
  });

  it("un producto bajo y sin ventas queda sin rotación y pide llegar al mínimo", () => {
    expect(r.F3).toMatchObject({ consumo_diario: null, dias_restantes: null, sugerido: 3, costo_sugerido: 6, bajo: true, urgente: true });
  });

  it("conserva los datos originales del producto", () => {
    expect(r.F1).toMatchObject({ id: 1, nombre: "Rápido", stock_actual: 4 });
  });

  it("reabastecer primero: lo que se agota antes va arriba", () => {
    expect(prioridadReabasto(Object.values(r)).map((p) => p.codigo)).toEqual(["F1", "F3"]);
  });

  it("divide entre los 30 días del periodo, incluidos los días sin ventas", () => {
    // 30 u. vendidas hace 10 días: 30 ÷ 30 = 1 u./día (antes se dividía entre 10).
    const [p] = conPronostico([{ codigo: "G1", stock_actual: 20, stock_minimo: 5, costo: 10 }], [venta("G1", 10, 30)], ahora);
    expect(p).toMatchObject({ consumo_diario: 1, dias_restantes: 20, urgente: false, sugerido: 0 });
  });

  it("las ventas de hace más de 30 días no cuentan para la cobertura", () => {
    const [p] = conPronostico([{ codigo: "V", stock_actual: 10, stock_minimo: 0, costo: 1 }], [venta("V", 30, 300), venta("V", 29, 30)], ahora);
    expect(p).toMatchObject({ consumo_diario: 1, dias_restantes: 10 });
  });

  it("redondea el consumo a 2 decimales sin perder precisión en los días", () => {
    // 10 u. en 30 días = 0.333… u./día; 7 ÷ 0.333… = 21 días.
    const [p] = conPronostico([{ codigo: "R", stock_actual: 7, stock_minimo: 0, costo: 1 }], [venta("R", 3, 10)], ahora);
    expect(p).toMatchObject({ consumo_diario: 0.33, dias_restantes: 21 });
  });

  it("la igualdad con el mínimo no cuenta como bajo", () => {
    const [p] = conPronostico([{ codigo: "E1", stock_actual: 5, stock_minimo: 5, costo: 1 }], [], ahora);
    expect(p).toMatchObject({ bajo: false, urgente: false, sugerido: 0 });
  });

  it("exactamente 7 días restantes es urgente; 8 no", () => {
    const ventasA = [venta("A", 1, 30)]; // 1 u./día
    const siete = conPronostico([{ codigo: "A", stock_actual: 7, stock_minimo: 0, costo: 1 }], ventasA, ahora)[0];
    const ocho = conPronostico([{ codigo: "A", stock_actual: 8, stock_minimo: 0, costo: 1 }], ventasA, ahora)[0];
    expect(siete).toMatchObject({ dias_restantes: 7, urgente: true });
    expect(ocho).toMatchObject({ dias_restantes: 8, urgente: false });
  });
});

describe("analizarProductos", () => {
  const producto = { id: 1, codigo: "P", nombre: "P", categoria: "X", stock_actual: 50, stock_minimo: 5, costo: 2 };

  it("usa la misma cobertura que conPronostico", () => {
    const ventas = [venta("P", 2, 60)];
    const [cobertura] = conPronostico([producto], ventas, ahora);
    const [analisis] = analizarProductos([producto], ventas, ahora);
    expect(analisis).toMatchObject({ consumo_diario: cobertura.consumo_diario, dias_restantes: cobertura.dias_restantes, urgente: cobertura.urgente });
  });

  it("acepta horizonte de 7, 30 y 90 días", () => {
    for (const horizonte of [7, 30, 90]) {
      const [p] = analizarProductos([producto], [venta("P", 1, 10)], ahora, horizonte);
      expect(p.serie_pronostico).toHaveLength(horizonte);
    }
  });

  it("sin ventas no inventa fecha de agotamiento", () => {
    const [p] = analizarProductos([producto], [], ahora);
    expect(p).toMatchObject({ dias_restantes: null, fecha_agotamiento_estimada: null, sugerido: 0 });
  });
});

describe("prioridadReabasto", () => {
  it("en empate de días, va primero el que está más lejos de su mínimo", () => {
    const lista = [
      { codigo: "A", urgente: true, sugerido: 1, dias_restantes: null, stock_actual: 4, stock_minimo: 5 },
      { codigo: "B", urgente: true, sugerido: 4, dias_restantes: null, stock_actual: 1, stock_minimo: 5 },
      { codigo: "C", urgente: true, sugerido: 0, dias_restantes: 1, stock_actual: 9, stock_minimo: 5 },
      { codigo: "D", urgente: false, sugerido: 9, dias_restantes: 30, stock_actual: 9, stock_minimo: 5 },
    ];
    expect(prioridadReabasto(lista).map((p) => p.codigo)).toEqual(["B", "A"]);
  });
});
