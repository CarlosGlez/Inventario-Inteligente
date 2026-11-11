import { useCallback, useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { enviarOrdenProveedor, listarOrdenes, recibirLineaOrden } from "../lib/api.js";
import { fechaLocal } from "../lib/fechas.js";
import { usePerfil } from "../lib/perfil.jsx";

export default function Ordenes() {
  const perfil = usePerfil();
  const [ordenes, setOrdenes] = useState([]);
  const [aviso, setAviso] = useState(null);
  const cargar = useCallback(() => listarOrdenes().then(setOrdenes).catch((e) => setAviso({ tipo: "error", texto: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);
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
    const lineas = (orden.orden_lineas ?? []).map((l) => `<tr><td>${escape(l.products?.codigo)}</td><td>${escape(l.products?.nombre)}</td><td>${l.cantidad}</td><td>${Number(l.costo_unitario).toFixed(2)}</td><td>${(l.cantidad * Number(l.costo_unitario)).toFixed(2)}</td></tr>`).join("");
    const ventana = window.open("", "_blank");
    if (!ventana) { setAviso({ tipo: "error", texto: "Permite ventanas emergentes para imprimir la orden como PDF." }); return; }
    ventana.document.write(`<meta charset="utf-8"><title>${escape(orden.folio)}</title><h1>Orden de compra ${escape(orden.folio)}</h1><p>Proveedor: ${escape(orden.proveedores?.nombre)}</p><table border="1" cellpadding="8"><thead><tr><th>Código</th><th>Producto</th><th>Unidades</th><th>Costo unitario</th><th>Subtotal</th></tr></thead><tbody>${lineas}</tbody></table><p>Usa Imprimir → Guardar como PDF.</p><script>window.print()<\/script>`);
    ventana.document.close();
  }
  return <Pagina aviso={aviso} resumen={null}><div className="page-title"><div><h2>Órdenes de compra</h2><p>Los borradores se generan desde una alerta y agrupan líneas por proveedor.</p></div></div>
    {ordenes.length === 0 && <section className="card"><p>No hay órdenes. En Historial de alertas puedes generar un borrador desde una alerta.</p></section>}
    <div className="alert-list">{ordenes.map((o) => <article className="card" key={o.id}><div className="alert-top"><h3>{o.folio} · {o.proveedores?.nombre}</h3><span className="badge">{o.estado}</span></div><p>Creada: {fechaLocal(o.created_at)}</p><div className="title-actions"><button type="button" onClick={() => imprimir(o)}>Exportar a PDF</button>{(perfil.role === "admin" || perfil.role === "compras") && o.estado === "borrador" && <button type="button" onClick={() => enviar(o.id)}>Enviar al proveedor</button>}</div><ul>{o.orden_lineas?.map((l) => <li key={l.id}>{l.products?.codigo} · {l.products?.nombre}: {l.recibida}/{l.cantidad} unidades
      {(perfil.role === "admin" || perfil.role === "almacen") && !["recibida", "cancelada"].includes(o.estado) && <button type="button" onClick={() => recibir(l)}>Registrar recepción</button>}</li>)}</ul></article>)}</div>
  </Pagina>;
}
