import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { alCambiarSesion, obtenerSesion } from "./lib/api.js";
import { configurado } from "./lib/supabase.js";
import Alertas from "./paginas/Alertas.jsx";
import Inventario from "./paginas/Inventario.jsx";
import Login from "./paginas/Login.jsx";
import Movimientos from "./paginas/Movimientos.jsx";

// Punto de partida: decide qué se muestra según haya sesión o no.
export default function App() {
  // undefined = todavía no sabemos · null = sin sesión · objeto = con sesión
  const [sesion, setSesion] = useState(undefined);

  useEffect(() => {
    if (!configurado) return undefined;
    let vigente = true;
    obtenerSesion()
      .then((actual) => { if (vigente) setSesion(actual); })
      .catch(() => { if (vigente) setSesion(null); });
    // Si la sesión vence o se cierra en otra pestaña, se vuelve al login.
    const dejarDeEscuchar = alCambiarSesion((nueva) => setSesion(nueva));
    return () => { vigente = false; dejarDeEscuchar(); };
  }, []);

  if (!configurado) {
    return (
      <div className="login-page">
        <div className="card login-card">
          <h1>Falta configurar Supabase</h1>
          <p>
            Copia <code>web/.env.example</code> como <code>web/.env.local</code>, escribe la URL y la clave pública
            de tu proyecto y vuelve a ejecutar <code>npm run dev</code>. Los pasos están en el README.
          </p>
        </div>
      </div>
    );
  }
  if (sesion === undefined) return <p className="cargando">Cargando…</p>;
  if (sesion === null) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Inventario />} />
      <Route path="/movimientos" element={<Movimientos />} />
      <Route path="/alertas" element={<Alertas />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
