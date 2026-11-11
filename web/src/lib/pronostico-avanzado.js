// Modelos puros de pronóstico diario. Las cantidades negativas se descartan;
// los huecos del calendario se representan como días con demanda cero.
const DIA = 86400000;
const VENTANA_BASELINE = 30;

function claveDia(fecha) {
  const d = new Date(fecha);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function serieDiaria(observaciones, desde = null, hasta = new Date()) {
  const mapa = new Map();
  for (const fila of observaciones ?? []) {
    const cantidad = Number(fila.cantidad ?? fila.total);
    const fecha = fila.fecha ?? fila.dia ?? fila.created_at;
    if (!Number.isFinite(cantidad) || cantidad < 0 || !fecha || Number.isNaN(new Date(fecha).getTime())) continue;
    const dia = claveDia(fecha);
    mapa.set(dia, (mapa.get(dia) ?? 0) + cantidad);
  }
  const fin = Date.parse(`${claveDia(hasta)}T00:00:00Z`);
  const fechas = [...mapa.keys()].map((d) => Date.parse(`${d}T00:00:00Z`));
  const corte = desde ? Date.parse(`${claveDia(desde)}T00:00:00Z`) : (fechas.length ? Math.min(...fechas) : fin);
  const inicio = fechas.length ? Math.max(corte, Math.min(...fechas)) : corte;
  const serie = [];
  for (let t = inicio; t <= fin; t += DIA) {
    const fecha = new Date(t).toISOString().slice(0, 10);
    serie.push({ fecha, cantidad: mapa.get(fecha) ?? 0 });
  }
  return serie;
}

const promedio = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

// Misma definición que la regla heredada: total de salidas recientes dividido
// por días desde la primera salida (mínimo un día), usando la ventana de 30d.
export function baseline30(serie) {
  const positivas = serie.filter((d) => d.cantidad > 0);
  if (!positivas.length) return 0;
  const fin = Date.parse(`${serie.at(-1).fecha}T00:00:00Z`);
  const inicioVentana = fin - (VENTANA_BASELINE - 1) * DIA;
  const recientes = positivas.filter((d) => Date.parse(`${d.fecha}T00:00:00Z`) >= inicioVentana);
  if (!recientes.length) return 0;
  const transcurridos = Math.max(1, (fin - Date.parse(`${recientes[0].fecha}T00:00:00Z`)) / DIA);
  return recientes.reduce((s, d) => s + d.cantidad, 0) / transcurridos;
}

export function mediaPonderada(serie, ventana = 28) {
  const datos = serie.slice(-ventana);
  const pesoTotal = datos.reduce((s, _, i) => s + i + 1, 0);
  return pesoTotal ? datos.reduce((s, d, i) => s + d.cantidad * (i + 1), 0) / pesoTotal : 0;
}

export function suavizamientoExponencial(serie, alpha = 0.25) {
  if (!serie.length) return 0;
  return serie.slice(1).reduce((nivel, d) => alpha * d.cantidad + (1 - alpha) * nivel, serie[0].cantidad);
}

export function pronosticarEstacional(serie, fechaInicio, horizonte = 14) {
  const nivel = promedio(serie.slice(-84).map((d) => d.cantidad));
  if (serie.length < 56 || nivel === 0) return Array.from({ length: horizonte }, () => Math.max(0, nivel));
  const base = serie.slice(-365);
  const media = promedio(base.map((d) => d.cantidad));
  const diaSemana = new Map();
  const mes = new Map();
  for (let i = 0; i < 7; i++) {
    const grupo = base.filter((d) => new Date(`${d.fecha}T00:00:00Z`).getUTCDay() === i).map((d) => d.cantidad);
    diaSemana.set(i, clamp(promedio(grupo) / (media || 1), 0.5, 2));
  }
  for (let i = 0; i < 12; i++) {
    const grupo = base.filter((d) => new Date(`${d.fecha}T00:00:00Z`).getUTCMonth() === i).map((d) => d.cantidad);
    if (grupo.length >= 3) mes.set(i, clamp(promedio(grupo) / (media || 1), 0.6, 1.8));
  }
  const fecha = new Date(`${claveDia(fechaInicio)}T00:00:00Z`);
  return Array.from({ length: horizonte }, (_, i) => {
    const d = new Date(fecha.getTime() + i * DIA);
    return Math.max(0, media * (diaSemana.get(d.getUTCDay()) ?? 1) * (mes.get(d.getUTCMonth()) ?? 1));
  });
}

export const MODELOS = {
  baseline30: (s) => Array(7).fill(baseline30(s)),
  ponderado: (s) => Array(7).fill(mediaPonderada(s)),
  exponencial: (s) => Array(7).fill(suavizamientoExponencial(s)),
  estacional: (s, fecha) => pronosticarEstacional(s, fecha, 7),
};

export function mae(real, predicho) {
  return promedio(real.map((v, i) => Math.abs(v - (predicho[i] ?? 0))));
}

export function seleccionarModelo(serie, { minimoDias = 56, horizonte = 7 } = {}) {
  const elegibles = serie.length >= minimoDias + horizonte ? ["baseline30", "ponderado", "exponencial", "estacional"] : [];
  if (!elegibles.length) return { modelo: "baseline30", error: null, confianza: "baja" };
  const errores = Object.fromEntries(elegibles.map((nombre) => [nombre, []]));
  const inicio = Math.max(minimoDias, serie.length - 84);
  for (let origen = inicio; origen + horizonte <= serie.length; origen += horizonte) {
    const entrenamiento = serie.slice(0, origen);
    const real = serie.slice(origen, origen + horizonte).map((d) => d.cantidad);
    for (const nombre of elegibles) {
      const pred = MODELOS[nombre](entrenamiento, serie[origen].fecha).slice(0, horizonte);
      errores[nombre].push(mae(real, pred));
    }
  }
  const puntuaciones = elegibles.map((nombre) => ({ nombre, error: promedio(errores[nombre]) }));
  puntuaciones.sort((a, b) => a.error - b.error);
  return { modelo: puntuaciones[0].nombre, error: puntuaciones[0].error, confianza: serie.length >= 180 ? "media" : "baja" };
}

export function pronosticoProducto(producto, observaciones, hoy = new Date(), horizonte = 14, baselineHeredado = null) {
  const desde = new Date(new Date(hoy).getTime() - 364 * DIA);
  const serie = serieDiaria(observaciones, desde, hoy);
  const seleccion = seleccionarModelo(serie);
  const funcion = MODELOS[seleccion.modelo];
  const valores = seleccion.modelo === "baseline30" && baselineHeredado !== null
    ? Array.from({ length: horizonte }, () => baselineHeredado)
    : seleccion.modelo === "estacional"
      ? pronosticarEstacional(serie, claveDia(hoy), horizonte)
      : Array.from({ length: horizonte }, () => funcion(serie)[0] ?? 0);
  const demanda = seleccion.modelo === "baseline30" && baselineHeredado !== null ? baselineHeredado : promedio(valores);
  const dias = demanda > 0 ? Math.floor(Number(producto.stock_actual) / demanda) : null;
  const fecha = dias === null ? null : new Date(Date.parse(`${claveDia(hoy)}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
  const historial = serie.slice(-28).map((d) => d.cantidad);
  const dispersion = Math.sqrt(promedio(historial.map((v) => (v - promedio(historial)) ** 2)));
  return {
    ...producto, modelo_pronostico: seleccion.modelo, error_validacion: seleccion.error,
    confianza: seleccion.confianza, demanda_diaria_esperada: Math.round(demanda * 100) / 100,
    fecha_agotamiento_estimada: fecha,
    intervalo: { inferior: Math.max(0, demanda - dispersion), superior: demanda + dispersion },
    serie_historial: serie.slice(-28).map((d) => d.cantidad),
    serie_pronostico: valores.map((cantidad, i) => ({ fecha: new Date(Date.parse(`${claveDia(hoy)}T00:00:00Z`) + i * DIA).toISOString().slice(0, 10), cantidad })),
  };
}
