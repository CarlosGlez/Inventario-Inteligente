// Pruebas de los correos con formato (HTML). Las plantillas son funciones
// puras: reciben los datos guardados en el historial y devuelven texto HTML.
import { describe, expect, it } from "vitest";
import {
  MAX_MOVIMIENTOS,
  escapar,
  htmlAlerta,
  htmlCorreo,
  htmlReporte,
} from "../../supabase/functions/revisar-inventario/plantillas.ts";

const ITEMS = [
  { id: 1, codigo: "C1", nombre: "Tóner", stock_actual: 1, stock_minimo: 4, costo: 1250.5, faltante: 3, costo_reponer: 3751.5 },
  { id: 2, codigo: "P003", nombre: "Bolígrafo azul", stock_actual: 7, stock_minimo: 12, costo: 8, faltante: 5, costo_reponer: 40 },
];

const REPORTE = {
  desde: "2026-10-01T03:00:00Z", // 30/09/2026 21:00 en el centro de México
  hasta: "2026-10-08T03:00:00Z", // 07/10/2026 21:00
  resumen: { total: 2, bajos: 1, valor: 2250.4, reponer: 3751.5 },
  productos: [
    { codigo: "C2", nombre: "Hojas", categoria: "Papelería", stock_actual: 10, stock_minimo: 2, costo: 99.99, valor: 999.9, bajo: false },
    { codigo: "C1", nombre: "Tóner", categoria: "Oficina", stock_actual: 1, stock_minimo: 4, costo: 1250.5, valor: 1250.5, bajo: true },
  ],
  movimientos: [
    { fecha: "2026-10-06T20:30:00Z", codigo: "C1", nombre: "Tóner", tipo: "salida", cantidad: 2, stock_anterior: 3, stock_nuevo: 1 },
    { fecha: "2026-10-04T16:05:00Z", codigo: "C2", nombre: "Hojas", tipo: "entrada", cantidad: 8, stock_anterior: 2, stock_nuevo: 10 },
  ],
  entradas: 8,
  salidas: 2,
};

// Ninguna plantilla debe dejar escapar un dato sin valor.
function sinHuecos(html) {
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("NaN");
  expect(html).not.toContain("null");
  expect(html).not.toContain("[object");
}

describe("escapar", () => {
  it("neutraliza los símbolos que HTML interpreta", () => {
    expect(escapar(`<b>Tinta & "tóner"</b> 'x'`)).toBe("&lt;b&gt;Tinta &amp; &quot;tóner&quot;&lt;/b&gt; &#39;x&#39;");
  });
  it("convierte números y trata lo vacío como texto vacío", () => {
    expect(escapar(12)).toBe("12");
    expect(escapar(null)).toBe("");
    expect(escapar(undefined)).toBe("");
  });
});

describe("htmlAlerta", () => {
  const html = htmlAlerta({ items: ITEMS });

  it("es un documento HTML completo, con estilos en línea", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).not.toContain("<style");   // muchos lectores de correo ignoran las hojas de estilo
    expect(html).not.toContain("<script");
    sinHuecos(html);
  });

  it("lleva el encabezado de alerta en rojo con el número de productos", () => {
    expect(html).toContain("Alerta de stock bajo");
    expect(html).toContain("background:#c62828");
    expect(html).toContain("2 productos por debajo de su mínimo");
    expect(htmlAlerta({ items: [ITEMS[0]] })).toContain("1 producto por debajo de su mínimo");
  });

  it("lleva una tabla con una fila por producto", () => {
    for (const encabezado of ["Código", "Producto", "Stock actual", "Mínimo", "Faltante", "Costo unitario", "Costo de reposición"]) {
      expect(html).toContain(`>${encabezado}</th>`);
    }
    expect(html).toContain(">C1</td>");
    expect(html).toContain(">Tóner</td>");
    expect(html).toContain(">$1,250.50</td>");
    expect(html).toContain(">$3,751.50</td>");
    expect(html).toContain(">P003</td>");
    expect(html).toContain(">Bolígrafo azul</td>");
    expect(html).toContain(">$40.00</td>");
  });

  it("suma el costo total de reposición", () => {
    expect(html).toContain("Costo estimado para llegar al mínimo");
    expect(html).toContain("$3,791.50");
  });

  it("un nombre con HTML no rompe ni inyecta nada en el correo", () => {
    const peligroso = htmlAlerta({ items: [{ ...ITEMS[0], nombre: `<script>alert("x")</script>`, codigo: "A&B" }] });
    expect(peligroso).not.toContain("<script");
    expect(peligroso).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(peligroso).toContain(">A&amp;B</td>");
  });

  it("acepta alertas antiguas que no guardaban costos", () => {
    const antigua = htmlAlerta({ items: [{ codigo: "V1", nombre: "Viejo", stock_actual: 2, stock_minimo: 7 }] });
    expect(antigua).toContain(">V1</td>");
    expect(antigua).toContain(">5</td>");    // faltante calculado: 7 − 2
    expect(antigua).toContain(">—</td>");    // sin costo
    sinHuecos(antigua);
  });
});

describe("htmlReporte", () => {
  const html = htmlReporte({ items: REPORTE });

  it("es un documento HTML completo, con estilos en línea", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<script");
    sinHuecos(html);
  });

  it("lleva el título y el periodo en la hora del centro de México", () => {
    expect(html).toContain("Reporte semanal de inventario");
    expect(html).toContain("30/09/2026 al 07/10/2026");
  });

  it("lleva el resumen", () => {
    for (const texto of ["Productos", "Con stock bajo", "Valor del inventario", "Reponer al mínimo", "$2,250.40", "$3,751.50"]) {
      expect(html).toContain(texto);
    }
  });

  it("lleva el inventario completo y resalta en rojo los productos bajos", () => {
    expect(html).toContain("Inventario completo");
    const filaBaja = html.slice(html.indexOf(">C1</td>") - 200, html.indexOf(">C1</td>"));
    const filaNormal = html.slice(html.indexOf(">C2</td>") - 200, html.indexOf(">C2</td>"));
    expect(filaBaja).toContain("background:#fdecea");
    expect(filaNormal).not.toContain("background:#fdecea");
    expect(html).toContain(">Stock bajo</span>");
    expect(html).toContain(">Suficiente</span>");
    expect(html).toContain(">$99.99</td>");
    expect(html).toContain(">$999.90</td>");
    expect(html).toContain(">Papelería</td>");
  });

  it("lleva los movimientos de la semana con fecha y hora de México", () => {
    expect(html).toContain("Movimientos de la semana");
    expect(html).toContain(">06/10/2026 14:30</td>");
    expect(html).toContain(">04/10/2026 10:05</td>");
    expect(html).toContain(">Salida</td>");
    expect(html).toContain(">Entrada</td>");
    expect(html).toContain("Entradas: 8 u.");
    expect(html).toContain("Salidas: 2 u.");
  });

  it("dice claramente cuando no hubo movimientos o el inventario está vacío", () => {
    const vacio = htmlReporte({ items: { ...REPORTE, productos: [], movimientos: [], entradas: 0, salidas: 0, resumen: { total: 0, bajos: 0, valor: 0, reponer: 0 } } });
    expect(vacio).toContain("No hubo movimientos esta semana.");
    expect(vacio).toContain("El inventario está vacío.");
    sinHuecos(vacio);
  });

  it("muestra como máximo 100 movimientos y avisa cuántos faltan", () => {
    expect(MAX_MOVIMIENTOS).toBe(100);
    const muchos = Array.from({ length: 105 }, (_, i) => ({ ...REPORTE.movimientos[0], nombre: `Producto mov ${i + 1}` }));
    const largo = htmlReporte({ items: { ...REPORTE, movimientos: muchos } });
    expect(largo.match(/Producto mov \d+</g)).toHaveLength(100);
    expect(largo).toContain("y 5 movimientos más");
  });

  it("escapa los textos de productos y movimientos", () => {
    const peligroso = htmlReporte({ items: {
      ...REPORTE,
      productos: [{ ...REPORTE.productos[0], nombre: "<img src=x>", categoria: "A<B" }],
      movimientos: [{ ...REPORTE.movimientos[0], nombre: "<b>negritas</b>" }],
    } });
    expect(peligroso).not.toContain("<img");
    expect(peligroso).not.toContain("<b>negritas");
    expect(peligroso).toContain("&lt;img src=x&gt;");
    expect(peligroso).toContain(">A&lt;B</td>");
  });
});

describe("htmlCorreo", () => {
  it("elige la plantilla según el tipo de correo", () => {
    expect(htmlCorreo({ tipo: "reporte_semanal", items: REPORTE })).toContain("Reporte semanal de inventario");
    expect(htmlCorreo({ tipo: "stock_bajo", items: ITEMS })).toContain("Alerta de stock bajo");
    expect(htmlCorreo({ items: ITEMS })).toContain("Alerta de stock bajo");   // sin tipo: alerta
  });

  it("si los datos no tienen la forma esperada devuelve undefined en vez de fallar", () => {
    expect(htmlCorreo({ tipo: "stock_bajo", items: null })).toBeUndefined();
    expect(htmlCorreo({ tipo: "stock_bajo", items: REPORTE })).toBeUndefined();
    expect(htmlCorreo({ tipo: "stock_bajo", items: [] })).toBeUndefined();
    expect(htmlCorreo({ tipo: "reporte_semanal", items: ITEMS })).toBeUndefined();
    expect(htmlCorreo({ tipo: "reporte_semanal", items: {} })).toBeUndefined();
    expect(htmlCorreo({ tipo: "otro", items: ITEMS })).toBeUndefined();
  });
});
