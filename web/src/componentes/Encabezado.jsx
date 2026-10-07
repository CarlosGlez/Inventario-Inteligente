import { NavLink } from "react-router-dom";
import { cerrarSesion } from "../lib/api.js";

const clase = ({ isActive }) => (isActive ? "active" : "");

// Título del proyecto y las tres pestañas.
export default function Encabezado() {
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <div>
          <span className="eyebrow">PROYECTO 2</span>
          <h1>Control Inteligente de Inventario</h1>
          <p>Detecta stock bajo, avisa por correo y estima cuándo se agotará cada producto.</p>
        </div>
        <div className="header-side">
          <button type="button" className="logout" onClick={() => cerrarSesion()}>Cerrar sesión</button>
          <nav aria-label="Navegación principal">
            <NavLink className={clase} to="/" end>Inventario</NavLink>
            <NavLink className={clase} to="/movimientos">Movimientos</NavLink>
            <NavLink className={clase} to="/alertas">Historial de alertas</NavLink>
          </nav>
        </div>
      </div>
    </header>
  );
}
