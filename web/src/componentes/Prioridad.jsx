import { dinero } from "../lib/dinero.js";
import DiasRestantes from "./DiasRestantes.jsx";

const MAXIMO_VISIBLE = 6;

// Panel "Reabastecer primero": lo que se agotaría antes va arriba.
export default function Prioridad({ prioridad }) {
  const total = prioridad.reduce((suma, p) => suma + p.costo_sugerido, 0);
  return (
    <section className="card priority-card">
      <div className="priority-head">
        <div>
          <h3>Reabastecer primero</h3>
          <p>Ordenado por lo que se agotaría antes. La cantidad sugerida cubre el mínimo o 14 días de consumo.</p>
        </div>
        {prioridad.length > 0 && (
          <div className="priority-total"><span>Compra sugerida</span><strong>{dinero(total)}</strong></div>
        )}
      </div>
      {prioridad.length > 0 ? (
        <>
          <ol className="priority-list">
            {prioridad.slice(0, MAXIMO_VISIBLE).map((p, i) => (
              <li key={p.id}>
                <span className="rank">{i + 1}</span>
                <div className="priority-name"><strong>{p.nombre}</strong><span>{p.codigo} · {p.categoria}</span></div>
                <div className="priority-meta">
                  <span>Stock {p.stock_actual} / mín. {p.stock_minimo}</span>
                  <DiasRestantes producto={p} />
                </div>
                <div className="priority-buy"><strong>+{p.sugerido} u.</strong><span>{dinero(p.costo_sugerido)}</span></div>
              </li>
            ))}
          </ol>
          {prioridad.length > MAXIMO_VISIBLE && (
            <p className="more">y {prioridad.length - MAXIMO_VISIBLE} producto(s) más en la tabla.</p>
          )}
        </>
      ) : (
        <p className="empty-ok">Todo en orden: ningún producto está bajo el mínimo ni por agotarse en los próximos 7 días.</p>
      )}
    </section>
  );
}
