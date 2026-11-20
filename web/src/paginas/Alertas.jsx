import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Pagina from "../componentes/Pagina.jsx";
import { cargarResumen, consultarModoCorreo, crearBorradores, enviarReporte, listarAlertas, listarProductosBajos, reintentarAlerta, revisarAhora } from "../lib/api.js";
import { ETIQUETAS_ESTADO, avisoReintento, avisoReporte, avisoRevision, puedeReintentar } from "../lib/avisos.js";
import { dinero } from "../lib/dinero.js";
import { fechaLocal } from "../lib/fechas.js";
import { calcularReposicion, crearCsvAlertas } from "../lib/alertas.js";
import { usePerfil } from "../lib/perfil.jsx";

const tipoDe = (a) => a.tipo === "orden_compra" ? "orden_compra" : a.tipo === "reporte_semanal" ? "reporte_semanal" : "stock_bajo";
const textoTipo = (tipo) => ({ stock_bajo: "Alerta de stock", orden_compra: "Orden de compra", reporte_semanal: "Reporte semanal" })[tipo];
const cantidad = (i) => calcularReposicion(i).faltante;
const costoUnitario = (i) => calcularReposicion(i).costoUnitario;
const subtotal = (i) => calcularReposicion(i).subtotal;
const fechaDia = (a) => new Date(a.created_at).toLocaleDateString("en-CA");
const tituloDia = (key) => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  const fecha = new Date(`${key}T12:00:00`);
  if (fecha.toDateString() === hoy.toDateString()) return "Hoy";
  if (fecha.toDateString() === ayer.toDateString()) return "Ayer";
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
};

function Estado({ alerta }) {
  const estado = alerta.delivery_status ?? alerta.status;
  const icono = estado === "enviado" || estado === "entregado" ? "✓" : estado === "error" || estado === "fallido" || estado === "rebotado" ? "!" : "◷";
  const texto = ETIQUETAS_ESTADO[estado] ?? (estado === "entregado" ? "Enviado" : estado === "fallido" || estado === "rebotado" ? "Error de envío" : estado);
  return <span className={`badge status-badge ${estado}`}><span aria-hidden="true">{icono}</span> {texto}</span>;
}

function CorreoYResultado({ alerta }) {
  return <details className="mail-details"><summary>Ver correo generado y resultado</summary>
    <p><strong>Asunto:</strong> {alerta.subject}</p><pre>{alerta.body}</pre>
    <p>Intentos: {alerta.attempts}{alerta.last_attempt_at && <> · Último intento: {fechaLocal(alerta.last_attempt_at)}</>}</p>
    <p>Destinatario: {alerta.recipient ?? "sin registro"} · Entrega: {alerta.delivery_status ?? alerta.status}
      {alerta.message_id && <> · ID: <code>{alerta.message_id}</code></>}{alerta.sent_at && <> · Enviado: {fechaLocal(alerta.sent_at)}</>}</p>
    {alerta.error && <p className="error-text"><strong>Error:</strong> {alerta.error}</p>}
  </details>;
}

function TablaReposicion({ items }) {
  const productos = [...items].sort((a, b) => (Number(a.stock_actual) / Math.max(1, Number(a.stock_minimo)))
    - (Number(b.stock_actual) / Math.max(1, Number(b.stock_minimo))));
  const total = productos.reduce((s, i) => s + subtotal(i), 0);
  const conAgotamiento = productos.some((i) => i.fecha_agotamiento_estimada);
  return <div className="table-scroll alert-table-scroll"><table className="replenishment-table">
    <thead><tr><th>Producto</th><th>Actual</th><th>Mínimo</th><th>Nivel</th>{conAgotamiento && <th>Se agota en</th>}<th>Reponer</th><th>Costo</th></tr></thead>
    <tbody>{productos.map((i) => {
      const actual = Number(i.stock_actual) || 0, minimo = Number(i.stock_minimo) || 0;
      const porcentaje = minimo > 0 ? Math.min(100, actual / minimo * 100) : 100;
      const nivel = actual <= minimo * .5 ? "Crítico" : actual < minimo ? "Por agotarse" : "Suficiente";
      const clase = nivel === "Crítico" ? "critical" : nivel === "Por agotarse" ? "warning" : "healthy";
      return <tr key={i.id ?? i.codigo}><td><strong>{i.codigo} — {i.nombre}</strong></td><td>{actual}</td><td>{minimo}</td>
        <td><span className="stock-level" aria-label={`${nivel}: ${actual} de ${minimo} unidades`}>
          <span className="stock-track" role="progressbar" aria-valuenow={actual} aria-valuemin="0" aria-valuemax={Math.max(1, minimo)} aria-label={`Stock de ${i.nombre}`}>
            <span className={clase} style={{ width: `${porcentaje}%` }} /></span><small>{nivel} · {actual}/{minimo}</small>
        </span></td>{conAgotamiento && <td>{i.fecha_agotamiento_estimada ? Math.max(0, Math.ceil((new Date(i.fecha_agotamiento_estimada).getTime() - Date.now()) / 86400000)) + " días" : "—"}</td>}
        <td>{cantidad(i)} u.</td><td>{dinero(costoUnitario(i))}<small className="sub">{dinero(subtotal(i))} subtotal</small></td></tr>;
    })}</tbody><tfoot><tr><th colSpan={conAgotamiento ? 6 : 5}>Total de reposición al mínimo</th><th>{dinero(total)}</th></tr></tfoot>
  </table></div>;
}

function Tarjeta({ alerta, children }) {
  const tipo = tipoDe(alerta);
  const items = Array.isArray(alerta.items) ? alerta.items : [];
  const reporte = tipo === "reporte_semanal" && !Array.isArray(alerta.items) ? alerta.items ?? {} : null;
  const lineasOrden = tipo === "orden_compra" ? items : [];
  return <article className={`card alert-card type-${tipo}`}>
    <div className="alert-top"><div><span className="type-label">{textoTipo(tipo)}</span>
      <h3>{tipo === "stock_bajo" ? `Alerta #${alerta.id}` : tipo === "orden_compra" ? `Orden de compra #${alerta.orden_id ?? alerta.id}` : `Reporte semanal #${alerta.id}`}</h3>
      <span>{fechaLocal(alerta.created_at)} · {tipo === "stock_bajo" ? `${items.length} producto(s)` : tipo === "orden_compra" ? `${lineasOrden.length} línea(s)` : `${reporte?.resumen?.total ?? 0} producto(s) · ${reporte?.movimientos?.length ?? 0} movimiento(s)`}</span>
    </div><Estado alerta={alerta} /></div>
    {tipo === "stock_bajo" && <TablaReposicion items={items} />}
    {tipo === "orden_compra" && <><p>Proveedor: {alerta.recipient ?? "sin destinatario"} · Orden de compra preparada para aprobación manual.</p>
      <ul>{lineasOrden.map((l, i) => <li key={`${l.codigo}-${i}`}><strong>{l.codigo} — {l.nombre}</strong>: {l.cantidad} u. × {dinero(l.costo_unitario)} = {dinero(l.subtotal ?? Number(l.cantidad) * Number(l.costo_unitario))}</li>)}</ul></>}
    {reporte && <ul><li>Productos con stock bajo: <strong>{reporte.resumen?.bajos ?? 0}</strong></li><li>Valor del inventario: <strong>{dinero(reporte.resumen?.valor)}</strong></li>
      <li>Movimientos de la semana: Entradas: {reporte.entradas ?? 0} u. · Salidas: {reporte.salidas ?? 0} u.</li></ul>}
    <CorreoYResultado alerta={alerta} />{children}
  </article>;
}

export default function Alertas() {
  const perfil = usePerfil(), ubicacion = useLocation(), navegar = useNavigate();
  const [alertas, setAlertas] = useState(null), [resumen, setResumen] = useState(null), [bajos, setBajos] = useState([]), [modoDemo, setModoDemo] = useState(false);
  const [aviso, setAviso] = useState(ubicacion.state?.aviso ?? null), [ocupado, setOcupado] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState(""), [filtroTipo, setFiltroTipo] = useState("");
  const [desde, setDesde] = useState(""), [hasta, setHasta] = useState(""), [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [lista, r, productos, demo] = await Promise.all([
        listarAlertas(), cargarResumen(), listarProductosBajos(), consultarModoCorreo().catch(() => false),
      ]);
      setAlertas(lista); setResumen(r); setBajos(productos.filter((p) => Number(p.stock_actual) < Number(p.stock_minimo))); setModoDemo(demo);
    } catch (e) { setAlertas((a) => a ?? []); setAviso({ tipo: "error", texto: e.message }); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (ubicacion.state?.aviso) navegar(".", { replace: true, state: null }); }, [ubicacion.state, navegar]);
  async function ejecutar(accion, crearAviso) {
    setOcupado(true);
    try { setAviso(crearAviso(await accion())); await cargar(); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
    finally { setOcupado(false); }
  }
  const revisar = () => ejecutar(revisarAhora, avisoRevision);
  const reporte = () => ejecutar(enviarReporte, (r) => avisoReporte(r.status));

  const visibles = useMemo(() => (alertas ?? []).filter((a) => {
    const tipo = tipoDe(a), estado = a.delivery_status ?? a.status, dia = fechaDia(a);
    const term = busqueda.trim().toLocaleLowerCase("es");
    const items = Array.isArray(a.items) ? a.items : Array.isArray(a.items?.productos) ? a.items.productos : [];
    return (!filtroEstado || estado === filtroEstado) && (!filtroTipo || tipo === filtroTipo)
      && (!desde || dia >= desde) && (!hasta || dia <= hasta)
      && (!term || items.some((i) => `${i.codigo} ${i.nombre}`.toLocaleLowerCase("es").includes(term)));
  }), [alertas, filtroEstado, filtroTipo, desde, hasta, busqueda]);
  const grupos = useMemo(() => Object.groupBy ? Object.groupBy(visibles, fechaDia)
    : visibles.reduce((g, a) => ((g[fechaDia(a)] ??= []).push(a), g), {}), [visibles]);
  const exportarCsv = () => {
    const filas = visibles.map((a) => ({ ...a, tipo: textoTipo(tipoDe(a)) }));
    const csv = crearCsvAlertas(filas);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "historial_alertas.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const criticos = bajos.filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo) * .5).length;
  const porAgotarse = bajos.length - criticos;

  return <Pagina resumen={resumen} aviso={aviso} nivelStock={{ bajos: bajos.length, criticos, porAgotarse }}>
    <div className="page-title alerts-title"><div><h2>Historial de alertas</h2><p>Alertas de stock, órdenes de compra y reportes semanales.</p></div>
      <div className="title-actions">
        {(perfil.role === "admin" || perfil.role === "compras") && <button type="button" className="primary" disabled={ocupado || !alertas?.some((a) => tipoDe(a) === "stock_bajo")} onClick={() => {
          const a = (alertas ?? []).find((x) => tipoDe(x) === "stock_bajo");
          if (a) ejecutar(() => crearBorradores(a.id), () => ({ tipo: "success", texto: "Borradores agrupados por proveedor creados." }));
        }}>Crear borradores de compra</button>}
        <button type="button" className="button" disabled={!visibles.length} onClick={exportarCsv}>Exportar CSV</button>
        {(perfil.role === "admin" || perfil.role === "compras") && <button type="button" className="button" disabled={ocupado} onClick={reporte}>Enviar reporte ahora</button>}
        {perfil.role !== "consulta" && <button type="button" className="button" disabled={ocupado} onClick={revisar}>Revisar inventario ahora</button>}
      </div>
    </div>
    {modoDemo && <div className="demo-banner" role="status"><strong>Modo simulado activo.</strong> Sin SMTP configurado, las alertas se guardan pero no se envían.</div>}
    <section className="alert-filters card" aria-label="Filtros del historial">
      <label>Tipo<select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}><option value="">Todos los tipos</option><option value="stock_bajo">Alerta de stock</option><option value="orden_compra">Orden de compra</option><option value="reporte_semanal">Reporte semanal</option></select></label>
      <label>Estado<select aria-label="Filtrar por estado de entrega" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}><option value="">Todos los estados</option>{["pendiente","enviado","entregado","rebotado","fallido","error","simulado"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <label className="search-filter">Producto<input type="search" placeholder="Nombre o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
    </section>
    {alertas === null && <p className="cargando">Cargando alertas…</p>}
    {alertas?.length === 0 && <section className="card"><p>No hay alertas. Pulsa “Revisar inventario ahora” para probar el flujo.</p></section>}
    {alertas?.length > 0 && Object.keys(grupos).length === 0 && <section className="card"><p>No hay resultados para estos filtros.</p></section>}
    {Object.keys(grupos).sort((a,b) => b.localeCompare(a)).map((dia) => <section className="day-group" key={dia}>
      <h3>{tituloDia(dia)}</h3><div className="alert-list">{grupos[dia].map((a) => <Tarjeta key={a.id} alerta={a}>
        {puedeReintentar(a) && (perfil.role === "admin" || perfil.role === "compras") && <button type="button" disabled={ocupado} onClick={() => ejecutar(() => reintentarAlerta(a.id), (r) => avisoReintento(r.status))}>Reintentar envío</button>}
      </Tarjeta>)}</div></section>)}
  </Pagina>;
}
