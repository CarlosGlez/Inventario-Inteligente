import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { alCambiarSesion, obtenerPerfil, obtenerSesion } from "./lib/api.js";
import { PerfilProveedor } from "./lib/perfil.jsx";
import { configurado } from "./lib/supabase.js";
import Alertas from "./paginas/Alertas.jsx";
import Inventario from "./paginas/Inventario.jsx";
import Login from "./paginas/Login.jsx";
import Movimientos from "./paginas/Movimientos.jsx";
import Proveedores from "./paginas/Proveedores.jsx";
import Ordenes from "./paginas/Ordenes.jsx";
import Usuarios from "./paginas/Usuarios.jsx";

// Punto de partida: decide qué se muestra según haya sesión o no.
export default function App() {
  // undefined = todavía no sabemos · null = sin sesión · objeto = con sesión
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    if (!configurado) return undefined;
    let vigente = true;
    obtenerSesion()
      .then(async (actual) => { if (vigente) { setSesion(actual); setPerfil(actual ? await obtenerPerfil(actual.user.id) : null); } })
      .catch(() => { if (vigente) { setSesion(null); setPerfil(null); } });
    // Si la sesión vence o se cierra en otra pestaña, se vuelve al login.
    const dejarDeEscuchar = alCambiarSesion((nueva) => {
      setSesion(nueva);
      setPerfil(nueva ? undefined : null);
      if (nueva) obtenerPerfil(nueva.user.id).then(setPerfil).catch(() => setPerfil(null));
    });
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
  if (sesion === undefined || (sesion && perfil === undefined)) return <p className="cargando">Cargando…</p>;
  if (sesion === null) return <Login />;
  if (!perfil?.active) return <div className="login-page"><section className="card"><h1>Cuenta desactivada</h1><p>Solicita al administrador que reactive tu acceso.</p></section></div>;

  return (
    <PerfilProveedor value={perfil}>
      <Routes>
        <Route path="/" element={<Inventario />} />
        <Route path="/movimientos" element={<Movimientos />} />
        <Route path="/alertas" element={<Alertas />} />
        <Route path="/proveedores" element={perfil.role === "admin" || perfil.role === "compras" ? <Proveedores /> : <Navigate to="/" replace />} />
        <Route path="/ordenes" element={perfil.role !== "consulta" ? <Ordenes /> : <Navigate to="/" replace />} />
        <Route path="/usuarios" element={perfil.role === "admin" ? <Usuarios /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PerfilProveedor>
  );
}
