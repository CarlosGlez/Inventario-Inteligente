import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import GraficaPronostico from "../componentes/GraficaPronostico.jsx";
import Pagina from "../componentes/Pagina.jsx";
import { cargarDashboard, crearOrdenRapida } from "../lib/api.js";
import {
  DIAS_ATENCION, DIAS_CRITICO, DIAS_EXCESO, ESTADOS, ESTADOS_CATEGORIA, SIN_CATEGORIA,
  enriquecerProductos, filtrarCategoria, requierenAtencion, resumenCategorias, tarjetas,
} from "../lib/dashboard.js";
import { dinero } from "../lib/dinero.js";
import { pronosticoProducto, resumenVentas, ventanaVentas } from "../lib/pronostico-avanzado.js";
import { DIAS_HISTORIAL, HORIZONTES, PERIODOS_HISTORIAL, analizarProductos, ventasPorCodigo } from "../lib/pronostico.js";
import { usePerfil } from "../lib/perfil.jsx";

const ESCALA_MAXIMA = 180; // días: las coberturas mayores se dibujan topadas y se rotulan
const formatoDias = (d) => `${d} día${d === 1 ? "" : "s"}`;
const unidades = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

function Estado({ estado, categoria = false }) {
  const info = (categoria ? ESTADOS_CATEGORIA : ESTADOS)[estado];
  return <span className={`badge estado-${estado}`}><span aria-hidden="true">{info.icono}</span> {info.etiqueta}</span>;
}

function Selector({ etiqueta, opciones, valor, onCambio, sufijo }) {
  return (
    <div className="segmented" role="group" aria-label={etiqueta}>
      <span>{etiqueta}</span>
      {opciones.map((o) => (
        <button key={o} type="button" aria-pressed={valor === o} onClick={() => onCambio(o)}>{o} {sufijo}</button>
      ))}
    </div>
  );
}

// Pestaña Dashboard: lectura para todos los roles; Compras y Admin pueden armar órdenes.
export default function Dashboard() {
  const perfil = usePerfil();
  const puedeOrdenar = perfil.role === "admin" || perfil.role === "compras";
  const navegar = useNavigate();
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [productoId, setProductoId] = useState(null);
  const [periodo, setPeriodo] = useState(30);
  const [horizonte, setHorizonte] = useState(30);

  const cargar = useCallback(async () => {
    try {
      setDatos(await cargarDashboard());
      setErrorCarga(null);
    } catch (motivo) {
      setErrorCarga(motivo.message);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = useMemo(() => new Date(), [datos]); // se renueva en cada recarga de datos
  const ventasPorProducto = useMemo(() => ventasPorCodigo(datos?.ventas), [datos]);
  const todos = useMemo(() => (datos
    ? enriquecerProductos(analizarProductos(datos.productos, datos.ventas ?? [], hoy), datos.relaciones)
    : []), [datos, hoy]);
  const categorias = useMemo(() => resumenCategorias(todos), [todos]);
  const visibles = useMemo(() => filtrarCategoria(todos, categoria), [todos, categoria]);
  const totales = useMemo(() => tarjetas(visibles), [visibles]);
  const atencion = useMemo(() => requierenAtencion(visibles), [visibles]);

  // Producto de la gráfica: el elegido si sigue visible; si no, el primero con ventas que requiera atención.
  const conVentas = visibles.filter((p) => p.consumo_diario_exacto > 0);
  const elegido = visibles.find((p) => p.id === productoId)
    ?? atencion.find((p) => p.consumo_diario_exacto > 0) ?? conVentas[0] ?? visibles[0] ?? null;
  const grafica = useMemo(() => {
    if (!elegido) return null;
    const ventas = ventasPorProducto.get(elegido.codigo) ?? [];
    return {
      historial: ventanaVentas(ventas, periodo, hoy),
      resumen: resumenVentas(ventas, periodo, hoy),
      pronostico: pronosticoProducto(elegido, ventas, hoy, horizonte, elegido.consumo_diario_exacto),
    };
  }, [elegido, ventasPorProducto, periodo, horizonte, hoy]);

  function alternarCategoria(nombre) {
    setCategoria((actual) => (actual === nombre ? "" : nombre));
  }

  async function armarOrden(p) {
    setOcupado(true);
    try {
      const orden = await crearOrdenRapida(p.id, Math.max(1, p.sugerido));
      navegar("/ordenes", { state: { aviso: { tipo: "success", texto: `Borrador ${orden.folio} listo para ${orden.proveedor}, con ${orden.cantidad} unidad(es).` } } });
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
      setOcupado(false);
    }
  }

  if (!datos) {
    return (
      <Pagina resumen={null} aviso={errorCarga ? { tipo: "error", texto: errorCarga } : null}>
        {errorCarga
          ? <p><button type="button" className="primary" onClick={cargar}>Reintentar</button></p>
          : <p className="cargando">Cargando dashboard…</p>}
      </Pagina>
    );
  }

  const maximoCobertura = Math.min(ESCALA_MAXIMA, Math.max(DIAS_EXCESO + 10, ...categorias.map((c) => c.cobertura ?? 0)));
  const ancho = (dias) => `${Math.max(1, (Math.min(dias, maximoCobertura) / maximoCobertura) * 100)}%`;
  const maximoValor = Math.max(1, ...categorias.map((c) => c.valor));
  const valorTotal = categorias.reduce((s, c) => s + c.valor, 0);
  const porValor = [...categorias].sort((a, b) => b.valor - a.valor);

  return (
    <Pagina resumen={null} aviso={aviso}>
      <div className="page-title">
        <div>
          <h2>Dashboard</h2>
          <p>Cobertura = stock ÷ ventas diarias promedio de los últimos {DIAS_HISTORIAL} días (los días sin ventas cuentan). Mismos cálculos que Inventario.</p>
        </div>
        {categoria && (
          <div className="title-actions">
            <span className="filter-chip">Categoría: <strong>{categoria}</strong></span>
            <button type="button" onClick={() => setCategoria("")}>Quitar filtro</button>
          </div>
        )}
      </div>

      {todos.length === 0 ? (
        <section className="card"><p>No hay productos registrados. Da de alta productos en Inventario para ver el análisis.</p></section>
      ) : <>
        <section className="stats dashboard-stats" aria-label="Indicadores">
          <div className={`stat ${totales.agotados ? "warning" : ""}`}><span>Productos agotados</span><strong>{totales.agotados}</strong></div>
          <div className={`stat ${totales.bajo_minimo ? "warning" : ""}`}><span>Bajo el mínimo</span><strong>{totales.bajo_minimo}</strong></div>
          <div className="stat money">
            <span>Valor del inventario</span><strong>{dinero(totales.valor_total)}</strong>
            {totales.valor_inmovilizado > 0 && <small className="muted-small">Inmovilizado sin rotación: {dinero(totales.valor_inmovilizado)}</small>}
          </div>
          <div className="stat money"><span>Costo total del faltante</span><strong>{dinero(totales.costo_faltante)}</strong></div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Cobertura por categoría</h3>
              <p className="muted">Selecciona una categoría para filtrar todo el Dashboard. Crítico: menos de {DIAS_CRITICO} días · atención: {DIAS_CRITICO}–{DIAS_ATENCION} · exceso: más de {DIAS_EXCESO}.</p>
            </div>
          </div>
          <ul className="hbars">
            {categorias.map((c) => (
              <li key={c.nombre}>
                <button type="button" className="hbar" aria-pressed={categoria === c.nombre} onClick={() => alternarCategoria(c.nombre)}
                  title={`${c.nombre}: ${c.cobertura === null ? "sin rotación" : formatoDias(c.cobertura)} · ${c.productos} producto(s), ${c.en_riesgo} en riesgo`}>
                  <span className="hbar-name">{c.nombre}{c.nombre === SIN_CATEGORIA && <small> (productos sin categoría)</small>}</span>
                  <span className="hbar-track">
                    {c.cobertura !== null && <span className={`hbar-fill estado-${c.estado}`} style={{ width: ancho(c.cobertura) }} />}
                  </span>
                  <span className="hbar-value">
                    {c.cobertura === null ? "Sin rotación" : `${c.cobertura > maximoCobertura ? "> " : ""}${formatoDias(c.cobertura)}`}
                  </span>
                  <Estado estado={c.estado} categoria />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card table-card">
          <div className="table-head">
            <h3>Requiere atención</h3>
            <span className="muted">{atencion.length} producto(s) · críticos primero; dentro de cada estado, mayor costo del faltante</span>
          </div>
          {atencion.length === 0 ? (
            <p className="empty-ok">Ningún producto {categoria ? "de esta categoría " : ""}está crítico ni en atención.</p>
          ) : (
            <div className="table-scroll tabla-tarjetas">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Cobertura</th><th>Agotamiento estimado</th>
                    <th>Sugerido</th><th>Costo del faltante</th><th>Proveedor</th><th>Estado</th><th>Orden</th>
                  </tr>
                </thead>
                <tbody>
                  {atencion.map((p) => (
                    <tr key={p.id} className={p.estado === "critico" ? "low-row" : ""}>
                      <td data-etiqueta="Producto"><button type="button" className="link-button" onClick={() => setProductoId(p.id)}>{p.nombre}</button><small className="sub">{p.codigo}</small></td>
                      <td data-etiqueta="Categoría">{p.categoria}</td>
                      <td data-etiqueta="Stock">{p.stock_actual}</td>
                      <td data-etiqueta="Mínimo">{p.stock_minimo}</td>
                      <td data-etiqueta="Cobertura">{p.dias_restantes === null ? "Sin rotación" : formatoDias(p.dias_restantes)}</td>
                      <td data-etiqueta="Agotamiento">{Number(p.stock_actual) === 0 ? "Agotado" : p.fecha_agotamiento_estimada ?? "—"}</td>
                      <td data-etiqueta="Sugerido">{p.sugerido} u.</td>
                      <td data-etiqueta="Costo faltante">{dinero(p.costo_faltante)}</td>
                      <td data-etiqueta="Proveedor">{p.proveedor?.nombre ?? <span className="muted">Sin proveedor</span>}</td>
                      <td data-etiqueta="Estado"><Estado estado={p.estado} /></td>
                      <td data-etiqueta="Orden">
                        {!puedeOrdenar ? <span className="muted">Solo lectura</span>
                          : !p.proveedor ? <Link to="/proveedores">Asignar proveedor</Link>
                            : Number(p.stock_actual) === 0
                              ? <button type="button" className="primary" disabled={ocupado} onClick={() => armarOrden(p)}>Armar orden</button>
                              : <Link to="/alertas">Desde alertas</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Pronóstico de ventas</h3>
              <p className="muted">Solo cuenta salidas con motivo venta. El promedio divide entre todos los días del periodo.</p>
            </div>
            {elegido && (
              <label className="product-picker">Producto
                <select value={elegido.id} onChange={(e) => setProductoId(Number(e.target.value))}>
                  {visibles.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}{p.consumo_diario_exacto > 0 ? "" : " (sin rotación)"}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="chart-controls">
            <Selector etiqueta="Historial" opciones={PERIODOS_HISTORIAL} valor={periodo} onCambio={setPeriodo} sufijo="días" />
            <Selector etiqueta="Horizonte" opciones={HORIZONTES} valor={horizonte} onCambio={setHorizonte} sufijo="días" />
          </div>
          {grafica && <>
            <dl className="sales-summary">
              <div><dt>Vendidas en {periodo} días</dt><dd>{grafica.resumen.unidades} u.</dd></div>
              <div><dt>Promedio diario</dt><dd>{unidades(Math.round(grafica.resumen.promedio_diario * 100) / 100)} u.</dd></div>
              <div><dt>Estimación diaria</dt><dd>{grafica.pronostico.demanda_diaria_esperada} u.</dd></div>
              <div><dt>Modelo · confianza</dt><dd>{grafica.pronostico.modelo_pronostico} · {grafica.pronostico.confianza}</dd></div>
            </dl>
            {grafica.resumen.unidades === 0 && grafica.pronostico.demanda_diaria_esperada === 0
              ? <p className="empty-ok">{elegido.nombre} no tiene ventas en el último año: no hay base para estimar su demanda.</p>
              : <GraficaPronostico nombre={elegido.nombre} historial={grafica.historial} pronostico={grafica.pronostico.serie_pronostico}
                  intervalo={grafica.pronostico.intervalo} agotamiento={grafica.pronostico.fecha_agotamiento_estimada} />}
          </>}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Valor del inventario por categoría</h3>
              <p className="muted">Stock × costo. Total: {dinero(valorTotal)}{totales.valor_inmovilizado > 0 && !categoria ? ` · ${dinero(totales.valor_inmovilizado)} inmovilizado en productos sin rotación` : ""}.</p>
            </div>
          </div>
          <ul className="hbars">
            {porValor.map((c) => (
              <li key={c.nombre}>
                <button type="button" className="hbar" aria-pressed={categoria === c.nombre} onClick={() => alternarCategoria(c.nombre)}
                  title={`${c.nombre}: ${dinero(c.valor)}`}>
                  <span className="hbar-name">{c.nombre}</span>
                  <span className="hbar-track"><span className="hbar-fill valor" style={{ width: `${Math.max(1, (c.valor / maximoValor) * 100)}%` }} /></span>
                  <span className="hbar-value">{dinero(c.valor)}</span>
                  <span className="hbar-share">{valorTotal ? Math.round((c.valor / valorTotal) * 100) : 0} %</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </>}
    </Pagina>
  );
}
