import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Pagina from "../componentes/Pagina.jsx";
import { cargarResumen, listarAlertas, reintentarAlerta, revisarAhora } from "../lib/api.js";
import { ETIQUETAS_ESTADO, avisoReintento, avisoRevision, puedeReintentar } from "../lib/avisos.js";
import { dinero } from "../lib/dinero.js";
import { fechaLocal } from "../lib/fechas.js";

// Historial de avisos de stock bajo, con el correo generado y su resultado.
export default function Alertas() {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [alertas, setAlertas] = useState(null);
  const [resumen, setResumen] = useState(null);
  // Si se llegó aquí desde "Revisar inventario ahora", el resultado viene en la navegación.
  const [aviso, setAviso] = useState(ubicacion.state?.aviso ?? null);
  const [ocupado, setOcupado] = useState(false);

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
  const reintentar = (id) => ejecutar(() => reintentarAlerta(id), (resultado) => avisoReintento(resultado.status));

  return (
    <Pagina resumen={resumen} aviso={aviso}>
      <div className="page-title">
        <div>
          <h2>Historial de alertas</h2>
          <p>Un aviso nuevo se crea cuando un producto cae por debajo de su mínimo. Tras recuperarse, una nueva caída genera otro aviso.</p>
        </div>
        <button type="button" className="primary" disabled={ocupado} onClick={revisar}>Revisar inventario ahora</button>
      </div>

      {alertas === null && <p className="cargando">Cargando alertas…</p>}
      {alertas !== null && alertas.length === 0 && (
        <section className="card"><p>No hay alertas. Pulsa “Revisar inventario ahora” para probar el flujo.</p></section>
      )}
      {alertas !== null && alertas.length > 0 && (
        <div className="alert-list">
          {alertas.map((alerta) => (
            <article className="card alert-card" key={alerta.id}>
              <div className="alert-top">
                <div>
                  <h3>Alerta #{alerta.id}</h3>
                  <span>{fechaLocal(alerta.created_at)} · {alerta.items.length} producto(s)</span>
                </div>
                <span className={`badge ${alerta.status}`}>{ETIQUETAS_ESTADO[alerta.status] ?? alerta.status}</span>
              </div>
              <ul>
                {alerta.items.map((item) => (
                  <li key={item.codigo}>
                    <strong>{item.codigo} — {item.nombre}</strong>: actual {item.stock_actual}, mínimo {item.stock_minimo}
                    {item.costo_reponer !== undefined && (
                      <> · reponer {item.faltante} u. × {dinero(item.costo)} = <strong>{dinero(item.costo_reponer)}</strong></>
                    )}
                  </li>
                ))}
              </ul>
              <details>
                <summary>Ver correo generado y resultado</summary>
                <p><strong>Asunto:</strong> {alerta.subject}</p>
                <pre>{alerta.body}</pre>
                <p>
                  Intentos: {alerta.attempts}
                  {alerta.last_attempt_at && <> · Último intento: {fechaLocal(alerta.last_attempt_at)}</>}
                </p>
                {alerta.error && <p className="error-text"><strong>Error:</strong> {alerta.error}</p>}
              </details>
              {puedeReintentar(alerta) && (
                <button type="button" disabled={ocupado} onClick={() => reintentar(alerta.id)}>Reintentar envío</button>
              )}
            </article>
          ))}
        </div>
      )}
    </Pagina>
  );
}
