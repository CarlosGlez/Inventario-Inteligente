// La parte "inteligente": estima cuánto dura el stock y qué conviene comprar.
// Son funciones puras: reciben datos y devuelven datos, sin tocar la base.

export const DIAS_HISTORIAL = 30; // ventana de salidas que se analiza (la calcula la vista consumo_30d)
export const DIAS_COBERTURA = 14; // días de consumo que debe cubrir la compra sugerida
export const DIAS_AVISO = 7;      // con estos días restantes o menos, es urgente

const MS_POR_DIA = 86400000;

/**
 * Agrega a cada producto su pronóstico.
 *   productos: filas de la tabla products
 *   consumo:   filas de la vista consumo_30d -> { product_code, total, primera }
 *
 * consumo diario = total de salidas / días desde la primera salida (mínimo 1 día)
 * días restantes = stock / consumo diario, redondeado hacia abajo
 * sugerido       = lo que falte para el mínimo, o para cubrir 14 días; lo que sea mayor
 * urgente        = está bajo el mínimo, o le quedan 7 días o menos
 */
export function conPronostico(productos, consumo, ahora = new Date()) {
  const diarioPorCodigo = new Map();
  for (const fila of consumo) {
    const dias = (ahora.getTime() - new Date(fila.primera).getTime()) / MS_POR_DIA;
    diarioPorCodigo.set(fila.product_code, Number(fila.total) / Math.max(1, dias));
  }

  return productos.map((producto) => {
    const diario = diarioPorCodigo.get(producto.codigo) || null;
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
      dias_restantes: diasRestantes,
      sugerido,
      costo_sugerido: Math.round(sugerido * costo * 100) / 100,
      bajo,
      urgente: bajo || (diasRestantes !== null && diasRestantes <= DIAS_AVISO),
    };
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
