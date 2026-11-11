import { useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { actualizarPerfil, crearUsuario, listarPerfiles } from "../lib/api.js";

const ROLES = ["admin", "almacen", "compras", "consulta"];
export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [aviso, setAviso] = useState(null);
  async function cargar() { try { setUsuarios(await listarPerfiles()); } catch (e) { setAviso({ tipo: "error", texto: e.message }); } }
  useEffect(() => { cargar(); }, []);
  async function guardar(id, form) {
    try { await actualizarPerfil(id, form.role, form.active); await cargar(); setAviso({ tipo: "success", texto: "Permisos actualizados." }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  async function crear(evento) {
    evento.preventDefault(); const f = new FormData(evento.currentTarget);
    try { const usuario = await crearUsuario(f.get("email"), f.get("password"), f.get("role")); await cargar(); evento.currentTarget.reset(); setAviso({ tipo: "success", texto: `Usuario creado (${usuario.user_id}). Comparte la contraseña inicial que ingresaste por un canal seguro.` }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  return <Pagina aviso={aviso} resumen={null}><div className="page-title"><div><h2>Usuarios y roles</h2><p>El backend crea la cuenta y aplica el rol solicitado; la contraseña no se guarda en el perfil.</p></div></div>
    <form className="card form-card" onSubmit={crear}><h3>Crear usuario</h3><label>Correo<input type="email" name="email" required /></label><label>Contraseña inicial (12 caracteres mínimo)<input type="password" name="password" minLength="12" autoComplete="new-password" required /></label><label>Rol<select name="role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label><button className="primary">Crear cuenta</button></form>
    <section className="card table-card"><div className="table-scroll tabla-tarjetas"><table><thead><tr><th>Correo</th><th>ID</th><th>Rol</th><th>Activo</th><th>Acción</th></tr></thead><tbody>{usuarios.map((u) => <Fila key={u.user_id} usuario={u} guardar={guardar} />)}</tbody></table></div></section>
  </Pagina>;
}
function Fila({ usuario, guardar }) {
  const [role, setRole] = useState(usuario.role); const [active, setActive] = useState(usuario.active);
  return <tr><td data-etiqueta="Correo">{usuario.email}</td><td data-etiqueta="ID">{usuario.user_id}</td><td data-etiqueta="Rol"><select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
    <td data-etiqueta="Activo"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /></td><td data-etiqueta="Acción"><button onClick={() => guardar(usuario.user_id, { role, active })}>Guardar</button></td></tr>;
}
