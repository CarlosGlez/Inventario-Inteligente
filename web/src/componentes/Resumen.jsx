import { dinero } from "../lib/dinero.js";
import { fechaLocal } from "../lib/fechas.js";

// Las cuatro tarjetas de arriba: productos, stock bajo, valor y última revisión.
export default function Resumen({ resumen }) {
  const r = resumen ?? {};
  const dato = (valor) => (resumen ? valor : "—");
  return (
    <section className="stats" aria-label="Resumen">
      <div className="stat"><span>Productos</span><strong>{dato(r.total)}</strong></div>
      <div className="stat warning"><span>Stock bajo</span><strong>{dato(r.bajos)}</strong></div>
      <div className="stat money">
        <span>Valor del inventario</span>
        <strong className="date">{dato(dinero(r.valor))}</strong>
        {Number(r.reponer) > 0 && <small>Reponer al mínimo: {dinero(r.reponer)}</small>}
      </div>
      <div className="stat">
        <span>Última revisión</span>
        <strong className="date">{dato(r.ultima_revision ? fechaLocal(r.ultima_revision) : "Aún no se ha revisado")}</strong>
      </div>
    </section>
  );
}
