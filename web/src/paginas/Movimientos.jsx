import { useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { cargarResumen, listarMovimientos } from "../lib/api.js";
import { fechaLocal } from "../lib/fechas.js";

const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

// Historial de entradas y salidas. Solo lectura.
export default function Movimientos() {
  const [movimientos, setMovimientos] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([listarMovimientos(), cargarResumen()])
      .then(([lista, r]) => { if (vigente) { setMovimientos(lista); setResumen(r); } })
      .catch((motivo) => { if (vigente) { setMovimientos([]); setAviso({ tipo: "error", texto: motivo.message }); } });
    return () => { vigente = false; };
  }, []);

  return (
    <Pagina resumen={resumen} aviso={aviso}>
      <div className="page-title">
        <div><h2>Movimientos</h2><p>Últimas 200 entradas y salidas registradas.</p></div>
      </div>
      <section className="card table-card">
        {movimientos === null && <p className="cargando">Cargando movimientos…</p>}
        {movimientos !== null && movimientos.length === 0 && <p>Todavía no hay movimientos.</p>}
        {movimientos !== null && movimientos.length > 0 && (
          <div className="table-scroll tabla-tarjetas">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Código</th><th>Producto</th><th>Tipo</th><th>Unidades</th><th>Antes</th><th>Después</th></tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td data-etiqueta="Fecha">{fechaLocal(m.created_at)}</td>
                    <td data-etiqueta="Código">{m.product_code}</td>
                    <td data-etiqueta="Producto">{m.product_name}</td>
                    <td data-etiqueta="Tipo">{mayuscula(m.tipo)}</td>
                    <td data-etiqueta="Unidades">{m.cantidad}</td>
                    <td data-etiqueta="Antes">{m.stock_anterior}</td>
                    <td data-etiqueta="Después">{m.stock_nuevo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Pagina>
  );
}
