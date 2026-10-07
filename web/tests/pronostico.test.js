import { describe, expect, it } from "vitest";
import { conPronostico, prioridadReabasto } from "../src/lib/pronostico.js";

const ahora = new Date("2026-10-05T12:00:00Z");
const hace = (dias) => new Date(ahora.getTime() - dias * 86400000).toISOString();
const porCodigo = (lista) => Object.fromEntries(lista.map((p) => [p.codigo, p]));

describe("conPronostico", () => {
  const productos = [
    { id: 1, codigo: "F1", nombre: "Rápido", categoria: "X", stock_actual: 4, stock_minimo: 2, costo: 3 },
    { id: 2, codigo: "F2", nombre: "Lento", categoria: "X", stock_actual: 49, stock_minimo: 2, costo: 1 },
    { id: 3, codigo: "F3", nombre: "Bajo sin uso", categoria: "X", stock_actual: 1, stock_minimo: 4, costo: 2 },
  ];
  const consumo = [
    { product_code: "F1", total: 16, primera: ahora.toISOString() },
    { product_code: "F2", total: 1, primera: ahora.toISOString() },
  ];
  const r = porCodigo(conPronostico(productos, consumo, ahora));

  it("un producto que se consume rápido se agota pronto y pide cubrir 14 días", () => {
    expect(r.F1).toMatchObject({ consumo_diario: 16, dias_restantes: 0, sugerido: 16 * 14 - 4, costo_sugerido: 660, bajo: false, urgente: true });
  });

  it("un producto de consumo lento no es urgente", () => {
    expect(r.F2).toMatchObject({ consumo_diario: 1, dias_restantes: 49, sugerido: 0, urgente: false });
  });

  it("un producto bajo y sin salidas se marca 'sin consumo' y pide llegar al mínimo", () => {
    expect(r.F3).toMatchObject({ consumo_diario: null, dias_restantes: null, sugerido: 3, costo_sugerido: 6, bajo: true, urgente: true });
  });

  it("conserva los datos originales del producto", () => {
    expect(r.F1).toMatchObject({ id: 1, nombre: "Rápido", stock_actual: 4 });
  });

  it("reabastecer primero: lo que se agota antes va arriba", () => {
    expect(prioridadReabasto(Object.values(r)).map((p) => p.codigo)).toEqual(["F1", "F3"]);
  });

  it("reparte el consumo entre los días desde la primera salida", () => {
    const [p] = conPronostico(
      [{ codigo: "G1", stock_actual: 20, stock_minimo: 5, costo: 10 }],
      [{ product_code: "G1", total: 30, primera: hace(10) }],
      ahora,
    );
    expect(p).toMatchObject({ consumo_diario: 3, dias_restantes: 6, urgente: true, sugerido: 22, costo_sugerido: 220 });
  });

  it("la igualdad con el mínimo no cuenta como bajo", () => {
    const [p] = conPronostico([{ codigo: "E1", stock_actual: 5, stock_minimo: 5, costo: 1 }], [], ahora);
    expect(p).toMatchObject({ bajo: false, urgente: false, sugerido: 0 });
  });

  it("exactamente 7 días restantes es urgente; 8 no", () => {
    const siete = conPronostico([{ codigo: "A", stock_actual: 7, stock_minimo: 0, costo: 1 }], [{ product_code: "A", total: 10, primera: hace(10) }], ahora)[0];
    const ocho = conPronostico([{ codigo: "A", stock_actual: 8, stock_minimo: 0, costo: 1 }], [{ product_code: "A", total: 10, primera: hace(10) }], ahora)[0];
    expect(siete).toMatchObject({ dias_restantes: 7, urgente: true });
    expect(ocho).toMatchObject({ dias_restantes: 8, urgente: false });
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
