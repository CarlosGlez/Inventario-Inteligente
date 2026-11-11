import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Pagina from "../componentes/Pagina.jsx";
import { cargarResumen, enviarReporte, listarAlertas, reintentarAlerta, revisarAhora } from "../lib/api.js";
import { ETIQUETAS_ESTADO, avisoReintento, avisoReporte, avisoRevision, puedeReintentar } from "../lib/avisos.js";
import { dinero } from "../lib/dinero.js";
import { fechaLocal } from "../lib/fechas.js";
import { crearBorradores } from "../lib/api.js";
import { usePerfil } from "../lib/perfil.jsx";

// Parte común de las dos tarjetas: el correo guardado y el resultado del envío.
function CorreoYResultado({ alerta }) {
  return (
    <details>
      <summary>Ver correo generado y resultado</summary>
      <p><strong>Asunto:</strong> {alerta.subject}</p>
      <pre>{alerta.body}</pre>
      <p>
        Intentos: {alerta.attempts}
        {alerta.last_attempt_at && <> · Último intento: {fechaLocal(alerta.last_attempt_at)}</>}
      </p>
      <p>Destinatario: {alerta.recipient ?? "sin registro"} · Entrega: {alerta.delivery_status ?? alerta.status}
        {alerta.message_id && <> · ID de mensaje: <code>{alerta.message_id}</code></>}
        {alerta.sent_at && <> · Enviado: {fechaLocal(alerta.sent_at)}</>}
      </p>
      {alerta.error && <p className="error-text"><strong>Error:</strong> {alerta.error}</p>}
    </details>
  );
}

function Estado({ alerta }) {
  return <span className={`badge ${alerta.status}`}>{ETIQUETAS_ESTADO[alerta.status] ?? alerta.status}</span>;
}

// Tarjeta de una alerta de stock bajo: los productos que cayeron bajo su mínimo.
function TarjetaAlerta({ alerta, children }) {
  const items = Array.isArray(alerta.items) ? alerta.items : [];
  return (
    <article className="card alert-card">
      <div className="alert-top">
        <div>
          <h3>Alerta #{alerta.id}</h3>
          <span>{fechaLocal(alerta.created_at)} · {items.length} producto(s)</span>
        </div>
        <Estado alerta={alerta} />
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.codigo}>
            <strong>{item.codigo} — {item.nombre}</strong>: actual {item.stock_actual}, mínimo {item.stock_minimo}
            {item.costo_reponer !== undefined && (
              <> · reponer {item.faltante} u. × {dinero(item.costo)} = <strong>{dinero(item.costo_reponer)}</strong></>
            )}
          </li>
        ))}
      </ul>
      <CorreoYResultado alerta={alerta} />
      {children}
    </article>
  );
}

// Tarjeta de un reporte semanal: el resumen de la "foto" que se envió.
// El detalle completo (las tablas) va en el correo.
function TarjetaReporte({ alerta, children }) {
  const foto = alerta.items && !Array.isArray(alerta.items) ? alerta.items : {};
  const resumen = foto.resumen ?? {};
  const movimientos = Array.isArray(foto.movimientos) ? foto.movimientos.length : 0;
  return (
    <article className="card alert-card">
      <div className="alert-top">
        <div>
          <h3>Reporte semanal #{alerta.id}</h3>
          <span>{fechaLocal(alerta.created_at)} · {resumen.total ?? 0} producto(s) · {movimientos} movimiento(s)</span>
        </div>
        <Estado alerta={alerta} />
      </div>
      <ul>
        <li>Productos con stock bajo: <strong>{resumen.bajos ?? 0}</strong></li>
        <li>Valor del inventario: <strong>{dinero(resumen.valor)}</strong></li>
        <li>Movimientos de la semana: Entradas: {foto.entradas ?? 0} u. · Salidas: {foto.salidas ?? 0} u.</li>
      </ul>
      <CorreoYResultado alerta={alerta} />
      {children}
    </article>
  );
}

function TarjetaOrden({ alerta, children }) {
  const lineas = Array.isArray(alerta.items) ? alerta.items : [];
  return <article className="card alert-card"><div className="alert-top"><div><h3>Correo de orden #{alerta.orden_id ?? alerta.id}</h3><span>{fechaLocal(alerta.created_at)} · {lineas.length} línea(s)</span></div><Estado alerta={alerta} /></div>
    <p>Proveedor: {alerta.recipient ?? "sin destinatario"} · Orden de compra enviada mediante aprobación manual.</p>
    <ul>{lineas.map((l, i) => <li key={`${l.codigo}-${i}`}><strong>{l.codigo} — {l.nombre}</strong>: {l.cantidad} u. × {dinero(l.costo_unitario)} = {dinero(l.subtotal)}</li>)}</ul>
    <CorreoYResultado alerta={alerta} />{children}</article>;
}

function TarjetaPruebaCorreo({ alerta, children }) {
  return <article className="card alert-card"><div className="alert-top"><div><h3>Prueba SMTP #{alerta.id}</h3><span>{fechaLocal(alerta.created_at)}</span></div><Estado alerta={alerta} /></div>
    <p>{alerta.body}</p><CorreoYResultado alerta={alerta} />{children}</article>;
}

// Historial de correos del bot: alertas de stock bajo y reportes semanales.
export default function Alertas() {
  const perfil = usePerfil();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [alertas, setAlertas] = useState(null);
  const [resumen, setResumen] = useState(null);
  // Si se llegó aquí desde "Revisar inventario ahora", el resultado viene en la navegación.
  const [aviso, setAviso] = useState(ubicacion.state?.aviso ?? null);
  const [ocupado, setOcupado] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [lista, r] = await Promise.all([listarAlertas(), cargarResumen()]);
      setAlertas(lista);
      setResumen(r);
    } catch (motivo) {
      setAlertas((actual) => actual ?? []);
      setAviso({ tipo: "error", texto: motivo.message });
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // El aviso ya se copió al estado; se quita de la navegación para que no
  // reaparezca al recargar la página.
  useEffect(() => {
    if (ubicacion.state?.aviso) navegar(".", { replace: true, state: null });
  }, [ubicacion.state, navegar]);

  async function ejecutar(accion, crearAviso) {
    setOcupado(true);
    try {
      setAviso(crearAviso(await accion()));
      await cargar();
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
    } finally {
      setOcupado(false);
    }
  }

  const revisar = () => ejecutar(revisarAhora, avisoRevision);
  const reporte = () => ejecutar(enviarReporte, (resultado) => avisoReporte(resultado.status));
  const reintentar = (id) => ejecutar(() => reintentarAlerta(id), (resultado) => avisoReintento(resultado.status));
  const exportarCsv = () => {
    const filas = (alertas ?? []).filter((a) => !filtroEstado || (a.delivery_status ?? a.status) === filtroEstado);
    const escapar = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const contenido = ["id,fecha,tipo,destinatario,estado_entrega,message_id,intentos", ...filas.map((a) => [a.id, a.created_at, a.tipo, a.recipient, a.delivery_status ?? a.status, a.message_id, a.attempts].map(escapar).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", contenido], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a"); enlace.href = url; enlace.download = "historial_alertas.csv"; enlace.click(); URL.revokeObjectURL(url);
  };

  return (
    <Pagina resumen={resumen} aviso={aviso}>
      <div className="page-title">
        <div>
          <h2>Historial de alertas</h2>
          <p>
            Un aviso nuevo se crea cuando un producto cae por debajo de su mínimo. Tras recuperarse, una nueva caída
            genera otro aviso. Los reportes semanales también quedan aquí.
          </p>
        </div>
        <div className="title-actions">
          <select aria-label="Filtrar por estado de entrega" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>{["pendiente", "enviado", "entregado", "rebotado", "fallido", "simulado"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button type="button" className="button" disabled={!alertas?.length} onClick={exportarCsv}>Exportar CSV</button>
          {(perfil.role === "admin" || perfil.role === "compras") && <button type="button" className="button" disabled={ocupado} onClick={reporte}>Enviar reporte ahora</button>}
          {perfil.role !== "consulta" && <button type="button" className="primary" disabled={ocupado} onClick={revisar}>Revisar inventario ahora</button>}
        </div>
      </div>

      {alertas === null && <p className="cargando">Cargando alertas…</p>}
      {alertas !== null && alertas.length === 0 && (
        <section className="card"><p>No hay alertas. Pulsa “Revisar inventario ahora” para probar el flujo.</p></section>
      )}
      {alertas !== null && alertas.length > 0 && (
        <div className="alert-list">
          {alertas.filter((a) => !filtroEstado || (a.delivery_status ?? a.status) === filtroEstado).map((alerta) => {
            const Tarjeta = alerta.tipo === "reporte_semanal" ? TarjetaReporte : alerta.tipo === "orden_compra" ? TarjetaOrden : alerta.tipo === "prueba_correo" ? TarjetaPruebaCorreo : TarjetaAlerta;
            return (
              <Tarjeta key={alerta.id} alerta={alerta}>
                {puedeReintentar(alerta) && (perfil.role === "admin" || perfil.role === "compras") && (
                  <button type="button" disabled={ocupado} onClick={() => reintentar(alerta.id)}>Reintentar envío</button>
                )}
                {alerta.tipo !== "reporte_semanal" && (perfil.role === "admin" || perfil.role === "compras") && (
                  <button type="button" disabled={ocupado} onClick={() => ejecutar(() => crearBorradores(alerta.id), () => ({ tipo: "success", texto: "Borradores agrupados por proveedor creados." }))}>Crear borradores de compra</button>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </Pagina>
  );
}
