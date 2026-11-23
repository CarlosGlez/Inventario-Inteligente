import { describe, expect, it } from "vitest";
import {
  clasificarProducto, enriquecerProductos, proveedorPorProducto, requierenAtencion, resumenCategorias, tarjetas,
} from "../src/lib/dashboard.js";
import { analizarProductos } from "../src/lib/pronostico.js";

const ahora = new Date("2026-10-05T12:00:00Z");
const hace = (dias) => new Date(ahora.getTime() - dias * 86400000).toISOString().slice(0, 10);
// Vende `diario` unidades por día durante los últimos 30 días.
const ventasDiarias = (codigo, diario) => Array.from({ length: 30 }, (_, i) => ({ product_code: codigo, fecha: hace(i), cantidad: diario }));
const prod = (id, codigo, categoria, stock, minimo, costo = 10) => ({ id, codigo, nombre: codigo, categoria, stock_actual: stock, stock_minimo: minimo, costo });

describe("clasificarProducto", () => {
  const c = (stock, minimo, dias) => clasificarProducto({ stock_actual: stock, stock_minimo: minimo, dias_restantes: dias });

  it("stock cero es crítico aunque no tenga ventas", () => {
    expect(c(0, 0, null)).toBe("critico");
    expect(c(0, 5, 0)).toBe("critico");
  });
  it("límites de cobertura: 6 crítico, 7 y 14 atención, 15 saludable, 90 saludable, 91 exceso", () => {
    expect([6, 7, 14, 15, 90, 91].map((d) => c(100, 0, d))).toEqual(["critico", "atencion", "atencion", "saludable", "saludable", "exceso"]);
  });
  it("bajo mínimo con buena cobertura es atención, no exceso", () => {
    expect(c(10, 20, 200)).toBe("atencion");
  });
  it("sin ventas queda sin rotación (neutro), salvo que esté bajo el mínimo", () => {
    expect(c(50, 10, null)).toBe("sin_rotacion");
    expect(c(5, 10, null)).toBe("atencion");
  });
});

describe("cálculos del Dashboard", () => {
  const productos = [
    prod(1, "A", "Oficina", 0, 5, 10),     // agotado → crítico
    prod(2, "B", "Oficina", 30, 5, 2),     // 1 u./día → 30 días → saludable
    prod(3, "C", "Limpieza", 100, 5, 1),   // sin ventas → sin rotación
    prod(4, "D", "Limpieza", 20, 5, 4),    // 2 u./día → 10 días → atención
    prod(5, "E", "", 500, 5, 1),           // categoría vacía; 1 u./día → 500 días → exceso
  ];
  const ventas = [...ventasDiarias("A", 1), ...ventasDiarias("B", 1), ...ventasDiarias("D", 2), ...ventasDiarias("E", 1)];
  const relaciones = [
    { product_id: 1, proveedor_id: 7, costo_unitario: 12, proveedores: { nombre: "Caro", activo: true } },
    { product_id: 1, proveedor_id: 8, costo_unitario: 9, proveedores: { nombre: "Barato", activo: true } },
    { product_id: 1, proveedor_id: 9, costo_unitario: 1, proveedores: { nombre: "Archivado", activo: false } },
  ];
  const lista = enriquecerProductos(analizarProductos(productos, ventas, ahora), relaciones);
  const porCodigo = Object.fromEntries(lista.map((p) => [p.codigo, p]));

  it("asigna estado y una categoría a los productos sin categoría", () => {
    expect(Object.fromEntries(lista.map((p) => [p.codigo, p.estado]))).toEqual({ A: "critico", B: "saludable", C: "sin_rotacion", D: "atencion", E: "exceso" });
    expect(porCodigo.E.categoria).toBe("Sin categoría");
  });

  it("los días de cobertura coinciden con los de Inventario", () => {
    const inventario = analizarProductos(productos, ventas, ahora);
    expect(lista.map((p) => p.dias_restantes)).toEqual(inventario.map((p) => p.dias_restantes));
  });

  it("tarjetas: agotados, bajo mínimo, valor total, faltante e inmovilizado", () => {
    expect(tarjetas(lista)).toEqual({
      agotados: 1,
      bajo_minimo: 1,
      valor_total: 0 + 60 + 100 + 80 + 500,
      costo_faltante: lista.reduce((s, p) => s + p.costo_faltante, 0),
      valor_inmovilizado: 100,
    });
  });

  it("la cobertura de la categoría suma stock y consumo; no promedia coberturas", () => {
    // M: 10 u. a 1 u./día = 10 días; N: 300 u. a 10 u./día = 30 días.
    // Suma: 310 ÷ 11 = 28 días. El promedio de coberturas daría 20: debe salir 28.
    const r = enriquecerProductos(analizarProductos(
      [prod(1, "M", "Mix", 10, 0), prod(2, "N", "Mix", 300, 0)],
      [...ventasDiarias("M", 1), ...ventasDiarias("N", 10)], ahora,
    ));
    expect(resumenCategorias(r)[0].cobertura).toBe(28);
  });

  it("los productos sin rotación quedan fuera de la cobertura de su categoría", () => {
    // Limpieza: C no tiene ventas; solo cuenta D: 20 u. ÷ 2 u./día = 10 días.
    expect(resumenCategorias(lista).find((c) => c.nombre === "Limpieza").cobertura).toBe(10);
  });

  it("una categoría requiere atención con un crítico o más de 25 % en rojo/ámbar", () => {
    const categorias = Object.fromEntries(resumenCategorias(lista).map((c) => [c.nombre, c.estado]));
    expect(categorias.Oficina).toBe("atencion");        // tiene un crítico
    expect(categorias.Limpieza).toBe("atencion");       // 1 de 2 en ámbar = 50 %
    expect(categorias["Sin categoría"]).toBe("exceso");
  });

  it("exactamente 25 % en ámbar no basta para requerir atención", () => {
    const cuatro = enriquecerProductos(analizarProductos([
      prod(1, "W", "X", 20, 5), prod(2, "X", "X", 30, 1), prod(3, "Y", "X", 30, 1), prod(4, "Z", "X", 30, 1),
    ], [...ventasDiarias("W", 2), ...ventasDiarias("X", 1), ...ventasDiarias("Y", 1), ...ventasDiarias("Z", 1)], ahora));
    expect(resumenCategorias(cuatro)[0]).toMatchObject({ en_riesgo: 1, productos: 4, estado: "saludable" });
  });

  it("una categoría sin ventas queda sin rotación y sin cobertura", () => {
    const sola = enriquecerProductos(analizarProductos([prod(1, "S", "Vacía", 10, 1)], [], ahora));
    expect(resumenCategorias(sola)[0]).toMatchObject({ nombre: "Vacía", cobertura: null, estado: "sin_rotacion" });
  });

  it("redondea la cobertura de la categoría hacia abajo", () => {
    // 10 u. con 3 u./día = 3.33 días → 3.
    const r = enriquecerProductos(analizarProductos([prod(1, "R", "Red", 10, 0)], ventasDiarias("R", 3), ahora));
    expect(resumenCategorias(r)[0].cobertura).toBe(3);
    expect(r[0].dias_restantes).toBe(3);
  });

  it("requiere atención: críticos primero y, dentro, mayor costo del faltante", () => {
    expect(requierenAtencion(lista).map((p) => p.codigo)).toEqual(["A", "D"]);
  });

  it("toma el proveedor activo de menor costo, como la orden rápida", () => {
    expect(porCodigo.A.proveedor).toEqual({ id: 8, nombre: "Barato", costo: 9 });
    expect(porCodigo.B.proveedor).toBeNull();
    expect(proveedorPorProducto([]).size).toBe(0);
  });

  it("sin productos devuelve ceros y listas vacías", () => {
    expect(tarjetas([])).toEqual({ agotados: 0, bajo_minimo: 0, valor_total: 0, costo_faltante: 0, valor_inmovilizado: 0 });
    expect(resumenCategorias([])).toEqual([]);
  });
});
