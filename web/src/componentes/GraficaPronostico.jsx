import { useState } from "react";

// Gráfica de ventas reales + estimación con banda de confianza.
// Colores validados contra la superficie oscura (#13203b): ventas #3987e5,
// estimación #d95926. La identidad nunca depende solo del color: la estimación
// es punteada, hay leyenda, etiquetas directas y una tabla con los datos.
const ANCHO = 720;
const ALTO = 260;
const M = { arriba: 16, derecha: 16, abajo: 30, izquierda: 40 };
const W = ANCHO - M.izquierda - M.derecha;
const H = ALTO - M.arriba - M.abajo;

const fechaCorta = (iso) => {
  const [, mes, dia] = iso.split("-");
  return `${Number(dia)}/${Number(mes)}`;
};
const redondeo = (x) => Math.round(x * 10) / 10;

/**
 * historial:  [{ fecha, cantidad }] — termina hoy
 * pronostico: [{ fecha, cantidad }] — empieza hoy
 * intervalo:  { inferior, superior } por día
 * agotamiento: "YYYY-MM-DD" o null
 */
export default function GraficaPronostico({ nombre, historial, pronostico, intervalo, agotamiento }) {
  const [activo, setActivo] = useState(null);

  // Eje x: días del historial y, a continuación, los del pronóstico (hoy se comparte).
  const dias = [...historial.map((d) => d.fecha), ...pronostico.slice(1).map((d) => d.fecha)];
  const hoy = historial.length - 1;
  const n = dias.length;
  const maximo = Math.max(1, ...historial.map((d) => d.cantidad), ...pronostico.map((d) => d.cantidad), intervalo.superior) * 1.1;
  const x = (i) => M.izquierda + (n === 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v) => M.arriba + H - (v / maximo) * H;
  const lineaReal = historial.map((d, i) => `${x(i)},${y(d.cantidad)}`).join(" ");
  const lineaEstimada = pronostico.map((d, i) => `${x(hoy + i)},${y(d.cantidad)}`).join(" ");
  const banda = [
    ...pronostico.map((_, i) => `${x(hoy + i)},${y(intervalo.superior)}`),
    ...pronostico.map((_, i) => `${x(hoy + pronostico.length - 1 - i)},${y(intervalo.inferior)}`),
  ].join(" ");
  const indiceAgotamiento = agotamiento ? dias.indexOf(agotamiento) : -1;
  const marcas = [0, maximo / 2, maximo].map((v) => Math.round(v));

  function alMover(evento) {
    const caja = evento.currentTarget.getBoundingClientRect();
    const relativo = ((evento.clientX - caja.left) / caja.width) * ANCHO;
    const i = Math.round(((relativo - M.izquierda) / W) * (n - 1));
    setActivo(Math.max(0, Math.min(n - 1, i)));
  }

  const real = activo !== null && activo <= hoy ? historial[activo].cantidad : null;
  const estimado = activo !== null && activo >= hoy ? pronostico[activo - hoy].cantidad : null;

  return (
    <figure className="forecast-chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key key-real" /> Ventas reales</span>
        <span><i className="key key-estimada" /> Estimación</span>
        <span><i className="key key-banda" /> Banda de confianza</span>
        {agotamiento && <span><i className="key key-agotamiento" /> Agotamiento estimado</span>}
      </div>
      <div className="chart-area">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img"
          aria-label={`Ventas diarias de ${nombre}: ${historial.length} días de historial y ${pronostico.length} de estimación.`}
          onMouseMove={alMover} onMouseLeave={() => setActivo(null)}>
          {marcas.map((v) => (
            <g key={v} className="grid">
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)} />
              <text x={M.izquierda - 8} y={y(v) + 4} textAnchor="end">{v}</text>
            </g>
          ))}
          <polygon className="band" points={banda} />
          <polyline className="line-real" points={lineaReal} />
          <polyline className="line-estimada" points={lineaEstimada} />
          <line className="today" x1={x(hoy)} x2={x(hoy)} y1={M.arriba} y2={M.arriba + H} />
          <text className="axis" x={x(hoy)} y={ALTO - 8} textAnchor="middle">Hoy</text>
          <text className="axis" x={x(0)} y={ALTO - 8} textAnchor="start">{fechaCorta(dias[0])}</text>
          <text className="axis" x={x(n - 1)} y={ALTO - 8} textAnchor="end">{fechaCorta(dias[n - 1])}</text>
          {indiceAgotamiento >= 0 && (
            <g className="stockout">
              <line x1={x(indiceAgotamiento)} x2={x(indiceAgotamiento)} y1={M.arriba} y2={M.arriba + H} />
              <text x={x(indiceAgotamiento) - 6} y={M.arriba + 12} textAnchor="end">Agotamiento {fechaCorta(agotamiento)}</text>
            </g>
          )}
          {activo !== null && (
            <g className="crosshair">
              <line x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={M.arriba + H} />
              {real !== null && <circle className="dot-real" cx={x(activo)} cy={y(real)} r="4" />}
              {estimado !== null && <circle className="dot-estimada" cx={x(activo)} cy={y(estimado)} r="4" />}
            </g>
          )}
        </svg>
        {activo !== null && (
          <div className="chart-tooltip" style={{ left: `${(x(activo) / ANCHO) * 100}%` }} role="status">
            <strong>{fechaCorta(dias[activo])}{activo === hoy ? " · hoy" : ""}</strong>
            {real !== null && <span>Ventas: {real} u.</span>}
            {estimado !== null && <span>Estimación: {redondeo(estimado)} u.</span>}
            {estimado !== null && activo > hoy && <span>Rango: {redondeo(intervalo.inferior)}–{redondeo(intervalo.superior)} u.</span>}
          </div>
        )}
      </div>
      {agotamiento && indiceAgotamiento < 0 && (
        <figcaption>Agotamiento estimado el {agotamiento}, fuera del horizonte mostrado.</figcaption>
      )}
      <details className="chart-data">
        <summary>Ver los datos en tabla</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Fecha</th><th>Ventas reales</th><th>Estimación</th></tr></thead>
            <tbody>
              {dias.map((fecha, i) => (
                <tr key={fecha}>
                  <td>{fecha}</td>
                  <td>{i <= hoy ? historial[i].cantidad : "—"}</td>
                  <td>{i >= hoy ? redondeo(pronostico[i - hoy].cantidad) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
