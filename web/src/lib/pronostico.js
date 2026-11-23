// La parte "inteligente": estima cuánto dura el stock y qué conviene comprar.
// Son funciones puras: reciben datos y devuelven datos, sin tocar la base.
import { pronosticoProducto, resumenVentas } from "./pronostico-avanzado.js";

export const DIAS_HISTORIAL = 30; // ventana de ventas que define la cobertura
export const DIAS_COBERTURA = 14; // días de consumo que debe cubrir la compra sugerida
export const DIAS_AVISO = 7;      // con estos días restantes o menos, es urgente
export const PERIODOS_HISTORIAL = [30, 60, 90];
export const HORIZONTES = [7, 30, 90];

/** Agrupa las filas de ventas_diarias_365d por código de producto. */
export function ventasPorCodigo(ventas) {
  const mapa = new Map();
  for (const fila of ventas ?? []) {
    if (!mapa.has(fila.product_code)) mapa.set(fila.product_code, []);
    mapa.get(fila.product_code).push(fila);
  }
  return mapa;
}

/**
 * Agrega a cada producto su cobertura.
 *   productos: filas de la tabla products
 *   ventas:    filas de la vista ventas_diarias_365d -> { product_code, fecha, cantidad }
 *              (solo salidas con motivo venta; mermas y ajustes no son demanda)
 *
 * consumo diario = ventas de los últimos 30 días ÷ 30 (los días sin ventas cuentan)
 * días restantes = stock / consumo diario, redondeado hacia abajo (cobertura)
 * sugerido       = lo que falte para el mínimo, o para cubrir 14 días; lo que sea mayor
 * urgente        = está bajo el mínimo, o le quedan 7 días o menos
 */
export function conPronostico(productos, ventas, ahora = new Date()) {
  const porCodigo = ventasPorCodigo(ventas);
  return productos.map((producto) => {
    const diario = resumenVentas(porCodigo.get(producto.codigo), DIAS_HISTORIAL, ahora).promedio_diario || null;
    const costo = Number(producto.costo) || 0;
    const diasRestantes = diario ? Math.floor(producto.stock_actual / diario) : null;
    const sugerido = Math.max(
      producto.stock_minimo - producto.stock_actual,
      Math.ceil((diario ?? 0) * DIAS_COBERTURA) - producto.stock_actual,
      0,
    );
    const bajo = producto.stock_actual < producto.stock_minimo; // la igualdad no cuenta
    return {
      ...producto,
      consumo_diario: diario ? Math.round(diario * 100) / 100 : null,
      consumo_diario_exacto: diario,
      dias_restantes: diasRestantes,
      sugerido,
      costo_sugerido: Math.round(sugerido * costo * 100) / 100,
      bajo,
      urgente: bajo || (diasRestantes !== null && diasRestantes <= DIAS_AVISO),
    };
  });
}

/**
 * Cobertura (conPronostico) + modelo de pronóstico de ventas de cada producto.
 * Inventario y Dashboard usan esta misma función para que sus números coincidan.
 * La cobertura y la urgencia usan el promedio de 30 días; la cantidad sugerida
 * usa la demanda que estima el modelo seleccionado.
 */
export function analizarProductos(productos, ventas, ahora = new Date(), horizonte = DIAS_COBERTURA) {
  const porCodigo = ventasPorCodigo(ventas);
  return conPronostico(productos, ventas, ahora).map((p) => {
    const avanzado = pronosticoProducto(p, porCodigo.get(p.codigo) ?? [], ahora, horizonte, p.consumo_diario_exacto);
    const demanda = avanzado.demanda_diaria_esperada;
    const sugerido = Math.max(p.stock_minimo - p.stock_actual, Math.ceil(demanda * DIAS_COBERTURA) - p.stock_actual, 0);
    return { ...avanzado, ...p, sugerido, costo_sugerido: Math.round(sugerido * (Number(p.costo) || 0) * 100) / 100 };
  });
}

/** "Reabastecer primero": urgentes con algo que comprar; lo que se agota antes va arriba. */
export function prioridadReabasto(productos) {
  const SIN_CONSUMO = 1e6; // los que no tienen consumo van después de los que sí
  const dias = (p) => (p.dias_restantes !== null && p.dias_restantes !== undefined ? p.dias_restantes : SIN_CONSUMO);
  return productos
    .filter((p) => p.urgente && p.sugerido > 0)
    .sort((a, b) => dias(a) - dias(b) || (a.stock_actual - a.stock_minimo) - (b.stock_actual - b.stock_minimo));
}
