// "Se agota en": Agotado, Sin consumo, o los días estimados (en rojo si son 7 o menos).
import { DIAS_AVISO } from "../lib/pronostico.js";

export default function DiasRestantes({ producto }) {
  if (producto.stock_actual === 0) return <span className="days danger-text">Agotado</span>;
  if (producto.dias_restantes === null) return <span className="days muted">Sin consumo</span>;
  const dias = producto.dias_restantes;
  const texto = `~${dias} día${dias === 1 ? "" : "s"}`;
  return <span className={dias <= DIAS_AVISO ? "days danger-text" : "days"}>{texto}</span>;
}
