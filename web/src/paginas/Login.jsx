import { useState } from "react";
import { iniciarSesion } from "../lib/api.js";

// Pantalla de entrada. Los usuarios se crean en el panel de Supabase;
// aquí no hay registro público.
export default function Login() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      await iniciarSesion(correo.trim(), clave);
      // Al entrar, Supabase avisa el cambio de sesión y App muestra el inventario.
    } catch (motivo) {
      setError(motivo.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={enviar}>
        <span className="eyebrow">PROYECTO 2</span>
        <h1>Control Inteligente de Inventario</h1>
        <p>Inicia sesión para administrar el inventario.</p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <label>Correo
          <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </label>
        <label>Contraseña
          <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
        </label>
        <button className="primary" disabled={ocupado}>Iniciar sesión</button>
      </form>
    </div>
  );
}
