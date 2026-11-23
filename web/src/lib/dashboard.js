// Cálculos del Dashboard. Funciones puras que parten de analizarProductos()
// (la misma función que usa Inventario), así que no hay un segundo modelo.

export const DIAS_CRITICO = 7;   // cobertura < 7 días: crítico
export const DIAS_ATENCION = 14; // cobertura 7–14 días (inclusive): atención
export const DIAS_EXCESO = 90;   // cobertura > 90 días: exceso
export const PROPORCION_CATEGORIA = 0.25; // > 25 % en rojo/ámbar: la categoría requiere atención

// El estado nunca se comunica solo con color: cada uno lleva icono y etiqueta.
export const ESTADOS = {
  critico: { etiqueta: "Crítico", icono: "✖", orden: 0 },
  atencion: { etiqueta: "Atención", icono: "!", orden: 1 },
  sin_rotacion: { etiqueta: "Sin rotación", icono: "–", orden: 2 },
  exceso: { etiqueta: "Exceso", icono: "▲", orden: 3 },
  saludable: { etiqueta: "Saludable", icono: "✓", orden: 4 },
};

export const ESTADOS_CATEGORIA = {
  atencion: { etiqueta: "Requiere atención", icono: "!" },
  sin_rotacion: { etiqueta: "Sin rotación", icono: "–" },
  exceso: { etiqueta: "Exceso", icono: "▲" },
  saludable: { etiqueta: "Saludable", icono: "✓" },
};

export const SIN_CATEGORIA = "Sin categoría";
const categoriaDe = (p) => (String(p.categoria ?? "").trim() || SIN_CATEGORIA);
const centavos = (x) => Math.round(x * 100) / 100;

/**
 * Semáforo de un producto; se aplica la primera regla que coincida.
 *   1. Crítico:   stock = 0 o cobertura < 7 días
 *   2. Atención:  bajo el mínimo o cobertura de 7 a 14 días
 *   3. Exceso:    cobertura > 90 días
 *   4. Saludable: el resto, con ventas
 * Sin ventas en 30 días la cobertura no existe: queda "Sin rotación" (neutro),
 * salvo que esté agotado (crítico) o bajo el mínimo (atención).
 */
export function clasificarProducto(p) {
  if (Number(p.stock_actual) === 0) return "critico";
  const bajo = Number(p.stock_actual) < Number(p.stock_minimo);
  const dias = p.dias_restantes;
  if (dias === null || dias === undefined) return bajo ? "atencion" : "sin_rotacion";
  if (dias < DIAS_CRITICO) return "critico";
  if (bajo || dias <= DIAS_ATENCION) return "atencion";
  if (dias > DIAS_EXCESO) return "exceso";
  return "saludable";
}

/** Proveedor activo de menor costo: el mismo criterio que usa crear_orden_rapida. */
export function proveedorPorProducto(relaciones) {
  const mejor = new Map();
  for (const r of relaciones ?? []) {
    if (r.proveedores && r.proveedores.activo === false) continue;
    const actual = mejor.get(r.product_id);
    const costo = Number(r.costo_unitario ?? 0);
    if (!actual || costo < actual.costo || (costo === actual.costo && r.proveedor_id < actual.id)) {
      mejor.set(r.product_id, { id: r.proveedor_id, nombre: r.proveedores?.nombre ?? "Proveedor", costo });
    }
  }
  return mejor;
}

/** Agrega estado, valor, costo del faltante y proveedor a cada producto analizado. */
export function enriquecerProductos(productos, relaciones = []) {
  const proveedores = proveedorPorProducto(relaciones);
  return productos.map((p) => {
    const estado = clasificarProducto(p);
    return {
      ...p,
      categoria: categoriaDe(p),
      estado,
      valor: centavos(Number(p.stock_actual) * (Number(p.costo) || 0)),
      costo_faltante: centavos(Number(p.costo_sugerido) || 0),
      proveedor: proveedores.get(p.id) ?? null,
    };
  });
}

/** Tarjetas superiores. */
export function tarjetas(productos) {
  const suma = (lista, campo) => centavos(lista.reduce((s, p) => s + p[campo], 0));
  return {
    agotados: productos.filter((p) => Number(p.stock_actual) === 0).length,
    bajo_minimo: productos.filter((p) => Number(p.stock_actual) < Number(p.stock_minimo)).length,
    valor_total: suma(productos, "valor"),
    costo_faltante: suma(productos, "costo_faltante"),
    valor_inmovilizado: suma(productos.filter((p) => p.estado === "sin_rotacion"), "valor"),
  };
}

/**
 * Resumen por categoría. La cobertura de la categoría es la suma del stock de
 * sus productos con ventas ÷ la suma de su consumo diario (no un promedio de
 * coberturas). Los productos sin rotación quedan fuera de esa cobertura.
 */
export function resumenCategorias(productos) {
  const grupos = new Map();
  for (const p of productos) {
    if (!grupos.has(p.categoria)) grupos.set(p.categoria, []);
    grupos.get(p.categoria).push(p);
  }
  return [...grupos.entries()].map(([nombre, lista]) => {
    const conVentas = lista.filter((p) => p.consumo_diario_exacto > 0);
    const consumo = conVentas.reduce((s, p) => s + p.consumo_diario_exacto, 0);
    const stock = conVentas.reduce((s, p) => s + Number(p.stock_actual), 0);
    const cobertura = consumo > 0 ? Math.floor(stock / consumo) : null;
    const criticos = lista.filter((p) => p.estado === "critico").length;
    const enRiesgo = lista.filter((p) => p.estado === "critico" || p.estado === "atencion").length;
    const requiere = criticos > 0 || enRiesgo / lista.length > PROPORCION_CATEGORIA;
    return {
      nombre,
      productos: lista.length,
      criticos,
      en_riesgo: enRiesgo,
      cobertura,
      valor: centavos(lista.reduce((s, p) => s + p.valor, 0)),
      estado: requiere ? "atencion" : cobertura === null ? "sin_rotacion" : cobertura > DIAS_EXCESO ? "exceso" : "saludable",
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

/** Tabla "Requiere atención": críticos primero; dentro de cada estado, mayor costo del faltante. */
export function requierenAtencion(productos) {
  return productos
    .filter((p) => p.estado === "critico" || p.estado === "atencion")
    .sort((a, b) => ESTADOS[a.estado].orden - ESTADOS[b.estado].orden
      || b.costo_faltante - a.costo_faltante
      || a.nombre.localeCompare(b.nombre, "es"));
}

export const filtrarCategoria = (productos, categoria) => (categoria ? productos.filter((p) => p.categoria === categoria) : productos);
