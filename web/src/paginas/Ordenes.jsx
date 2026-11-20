import { useCallback, useEffect, useMemo, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { enviarOrdenProveedor, listarOrdenes, recibirLineaOrden } from "../lib/api.js";
import { fechaLocal } from "../lib/fechas.js";
import { dinero } from "../lib/dinero.js";
import { usePerfil } from "../lib/perfil.jsx";

const totalOrden = (orden) => (orden.orden_lineas ?? []).reduce(
  (centavos, linea) => centavos + Number(linea.cantidad ?? 0) * Math.round(Number(linea.costo_unitario ?? 0) * 100), 0,
) / 100;

function fechaOrden(orden) {
  const fecha = new Date(orden.created_at);
  if (Number.isNaN(fecha.getTime())) return "";
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

export default function Ordenes() {
  const perfil = usePerfil();
  const [ordenes, setOrdenes] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [producto, setProducto] = useState("");
  const [montoMinimo, setMontoMinimo] = useState("");
  const [montoMaximo, setMontoMaximo] = useState("");
  const [ordenar, setOrdenar] = useState("fecha_desc");
  const cargar = useCallback(() => listarOrdenes().then(setOrdenes).catch((e) => setAviso({ tipo: "error", texto: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);

  const proveedores = useMemo(() => [...new Map(ordenes.map((o) => [String(o.proveedor_id), o.proveedores?.nombre ?? "Proveedor"])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es")), [ordenes]);
  const productos = useMemo(() => {
    const lista = new Map();
    for (const orden of ordenes) for (const linea of orden.orden_lineas ?? []) {
      const codigo = linea.product_code ?? linea.products?.codigo ?? "";
      const nombre = linea.product_name ?? linea.products?.nombre ?? "Producto";
      if (codigo) lista.set(codigo, `${codigo} · ${nombre}`);
    }
    return [...lista.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [ordenes]);
  const ordenesVisibles = useMemo(() => ordenes.filter((o) => {
    const fecha = fechaOrden(o);
    const total = totalOrden(o);
    const lineas = o.orden_lineas ?? [];
    return (!desde || fecha >= desde)
      && (!hasta || fecha <= hasta)
      && (!estado || o.estado === estado)
      && (!proveedor || String(o.proveedor_id) === proveedor)
      && (!producto || lineas.some((l) => (l.product_code ?? l.products?.codigo) === producto))
      && (montoMinimo === "" || total >= Number(montoMinimo))
      && (montoMaximo === "" || total <= Number(montoMaximo));
  }).sort((a, b) => {
    if (ordenar.startsWith("fecha")) {
      const diferencia = Date.parse(a.created_at) - Date.parse(b.created_at);
      return ordenar === "fecha_asc" ? diferencia : -diferencia;
    }
    const diferencia = totalOrden(a) - totalOrden(b);
    return ordenar === "monto_asc" ? diferencia : -diferencia;
  }), [ordenes, desde, hasta, estado, proveedor, producto, montoMinimo, montoMaximo, ordenar]);

  async function recibir(linea) {
    const cantidad = Number(window.prompt(`Unidades pendientes: ${linea.cantidad - linea.recibida}`, String(linea.cantidad - linea.recibida)));
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    try { await recibirLineaOrden(linea.id, cantidad); await cargar(); setAviso({ tipo: "success", texto: "Recepción registrada y stock actualizado." }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  async function enviar(id) {
    try { const r = await enviarOrdenProveedor(id); await cargar(); setAviso({ tipo: r.status === "error" ? "error" : "info", texto: r.status === "simulado" ? "Envío simulado: no se contactó al proveedor. DEMO_MODE está activo." : `Orden ${r.status}; destinatario ${r.recipient ?? "registrado"}; ID ${r.message_id ?? "sin ID"}.` }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  function imprimir(orden) {
    const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const lineas = (orden.orden_lineas ?? []).map((l) => `<tr><td>${escape(l.product_code ?? l.products?.codigo)}</td><td>${escape(l.product_name ?? l.products?.nombre)}</td><td>${l.cantidad}</td><td>${Number(l.costo_unitario).toFixed(2)}</td><td>${(l.cantidad * Number(l.costo_unitario)).toFixed(2)}</td></tr>`).join("");
    const ventana = window.open("", "_blank");
    if (!ventana) { setAviso({ tipo: "error", texto: "Permite ventanas emergentes para imprimir la orden como PDF." }); return; }
    ventana.document.write(`<meta charset="utf-8"><title>${escape(orden.folio)}</title><h1>Orden de compra ${escape(orden.folio)}</h1><p>Proveedor: ${escape(orden.proveedores?.nombre)}</p><table border="1" cellpadding="8"><thead><tr><th>Código</th><th>Producto</th><th>Unidades</th><th>Costo unitario</th><th>Subtotal</th></tr></thead><tbody>${lineas}</tbody></table><p>Usa Imprimir → Guardar como PDF.</p><script>window.print()<\/script>`);
    ventana.document.close();
  }
  return <Pagina aviso={aviso} resumen={null}><div className="page-title"><div><h2>Órdenes de compra</h2><p>Los borradores se generan desde una alerta y agrupan líneas por proveedor.</p></div></div>
    {ordenes.length === 0 && <section className="card"><p>No hay órdenes. En Historial de alertas puedes generar un borrador desde una alerta.</p></section>}
    {ordenes.length > 0 && <section className="card order-filters" aria-label="Filtros de órdenes de compra">
      <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option>{[...new Set(ordenes.map((o) => o.estado))].sort().map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
      <label>Proveedor<select value={proveedor} onChange={(e) => setProveedor(e.target.value)}><option value="">Todos</option>{proveedores.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
      <label>Producto<select value={producto} onChange={(e) => setProducto(e.target.value)}><option value="">Todos</option>{productos.map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}</select></label>
      <label>Monto mínimo<input type="number" min="0" step="0.01" value={montoMinimo} onChange={(e) => setMontoMinimo(e.target.value)} placeholder="$0.00" /></label>
      <label>Monto máximo<input type="number" min="0" step="0.01" value={montoMaximo} onChange={(e) => setMontoMaximo(e.target.value)} placeholder="Sin límite" /></label>
      <label>Ordenar por<select value={ordenar} onChange={(e) => setOrdenar(e.target.value)}>
        <option value="fecha_desc">Fecha: más reciente primero</option>
        <option value="fecha_asc">Fecha: más antigua primero</option>
        <option value="monto_asc">Monto: menor a mayor</option>
        <option value="monto_desc">Monto: mayor a menor</option>
      </select></label>
    </section>}
    {ordenes.length > 0 && ordenesVisibles.length === 0 && <section className="card"><p>No hay órdenes que coincidan con esos filtros.</p></section>}
    <div className="alert-list">{ordenesVisibles.map((o) => <article className="card" key={o.id}><div className="alert-top"><h3>{o.folio} · {o.proveedores?.nombre}</h3><span className="badge">{o.estado}</span></div><p>Creada: {fechaLocal(o.created_at)}</p><p className="order-total"><strong>Monto final: {dinero(totalOrden(o))}</strong></p><div className="title-actions"><button type="button" onClick={() => imprimir(o)}>Exportar a PDF</button>{(perfil.role === "admin" || perfil.role === "compras") && o.estado === "borrador" && <button type="button" onClick={() => enviar(o.id)}>Enviar al proveedor</button>}</div><ul>{o.orden_lineas?.map((l) => <li key={l.id}>{l.product_code ?? l.products?.codigo} · {l.product_name ?? l.products?.nombre}: {l.recibida}/{l.cantidad} unidades
      {(perfil.role === "admin" || perfil.role === "almacen") && !["recibida", "cancelada"].includes(o.estado) && <button type="button" onClick={() => recibir(l)}>Registrar recepción</button>}</li>)}</ul></article>)}</div>
  </Pagina>;
}
