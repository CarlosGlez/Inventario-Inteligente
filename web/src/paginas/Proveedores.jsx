import { useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { eliminarProveedor, guardarProveedor, listarProveedores, vincularProductoProveedor } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import { usePerfil } from "../lib/perfil.jsx";
import { dinero } from "../lib/dinero.js";

export default function Proveedores() {
  const perfil = usePerfil();
  const puedeGestionar = perfil.role === "admin" || perfil.role === "compras";
  const [lista, setLista] = useState([]);
  const [productos, setProductos] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [proveedorId, setProveedorId] = useState("");
  const [proveedorEditando, setProveedorEditando] = useState(null);
  const [vista, setVista] = useState("activos");
  const [ocupado, setOcupado] = useState(false);
  const [accionId, setAccionId] = useState(null);
  const activos = lista.filter((p) => p.activo !== false);
  const archivados = lista.filter((p) => p.activo === false);
  const visibles = vista === "activos" ? activos : archivados;

  async function cargar() {
    const [proveedores, resultadoProductos] = await Promise.all([
      listarProveedores(),
      supabase.from("products").select("id,codigo,nombre").order("nombre"),
    ]);
    if (resultadoProductos.error) throw resultadoProductos.error;
    setLista(proveedores);
    setProductos(resultadoProductos.data);
  }

  useEffect(() => {
    cargar().catch((e) => setAviso({ tipo: "error", texto: e.message }));
  }, []);

  async function guardar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const f = new FormData(evento.currentTarget);
    const editando = proveedorEditando;
    setOcupado(true);
    try {
      await guardarProveedor({
        nombre: f.get("nombre"),
        correo: f.get("correo"),
        telefono: f.get("telefono"),
        lead_time_dias: Number(f.get("lead_time_dias")),
        minimo_compra: Number(f.get("minimo_compra")),
      }, editando?.id ?? null);
      await cargar();
      formulario.reset();
      setProveedorEditando(null);
      setAviso({ tipo: "success", texto: editando ? "Proveedor actualizado." : "Proveedor registrado." });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function vincular(evento) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    try {
      await vincularProductoProveedor(Number(f.get("proveedor_id")), Number(f.get("product_id")), Number(f.get("costo_unitario")), Number(f.get("minimo_unidades")));
      setAviso({ tipo: "success", texto: "Producto vinculado al proveedor." });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
  }

  async function cambiarEstado(p, activo) {
    setAccionId(p.id);
    try {
      await guardarProveedor({ activo }, p.id);
      await cargar();
      if (!activo && String(proveedorId) === String(p.id)) setProveedorId("");
      setVista(activo ? "activos" : "archivados");
      setAviso({ tipo: "success", texto: activo ? `${p.nombre} está activo otra vez.` : `${p.nombre} quedó archivado.` });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setAccionId(null);
    }
  }

  async function eliminar(p) {
    if (perfil.role !== "admin") return;
    if (!window.confirm(`¿Eliminar a ${p.nombre}? Si tiene órdenes, se archivará para conservar el historial.`)) return;
    setAccionId(p.id);
    try {
      const resultado = await eliminarProveedor(p.id);
      await cargar();
      if (String(proveedorId) === String(p.id)) setProveedorId("");
      if (resultado.archivado) setVista("archivados");
      setAviso({
        tipo: "success",
        texto: resultado.archivado
          ? `${p.nombre} tenía órdenes asociadas y se archivó para conservar el historial.`
          : `${p.nombre} se eliminó.`,
      });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setAccionId(null);
    }
  }

  function editar(p) {
    setProveedorEditando(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <Pagina aviso={aviso} resumen={null}>
    <div className="page-title"><div><h2>Proveedores</h2><p>Contactos, plazo de entrega y catálogo de productos surtidos.</p></div></div>
    <div className="two-columns">
      {puedeGestionar && <form key={proveedorEditando?.id ?? "nuevo"} className="card form-card" onSubmit={guardar}>
        <h3>{proveedorEditando ? `Editar proveedor: ${proveedorEditando.nombre}` : "Registrar proveedor"}</h3>
        <label>Nombre<input name="nombre" maxLength="160" defaultValue={proveedorEditando?.nombre ?? ""} required /></label>
        <label>Correo<input type="email" name="correo" defaultValue={proveedorEditando?.correo ?? ""} required /></label>
        <label>Teléfono<input name="telefono" defaultValue={proveedorEditando?.telefono ?? ""} /></label>
        <label>Plazo de entrega (días)<input type="number" min="0" max="365" name="lead_time_dias" defaultValue={proveedorEditando?.lead_time_dias ?? 7} required /></label>
        <label>Compra mínima ($)<input type="number" min="0" step="0.01" name="minimo_compra" defaultValue={proveedorEditando?.minimo_compra ?? 0} required /></label>
        <div className="provider-form-actions">
          <button className="primary" disabled={ocupado}>{proveedorEditando ? "Guardar cambios" : "Registrar proveedor"}</button>
          {proveedorEditando && <button type="button" disabled={ocupado} onClick={() => setProveedorEditando(null)}>Cancelar edición</button>}
        </div>
      </form>}
      {puedeGestionar && <form className="card form-card" onSubmit={vincular}>
        <h3>Asignar producto</h3>
        <label>Proveedor<select name="proveedor_id" required onChange={(e) => setProveedorId(e.target.value)}><option value="">Seleccionar</option>{activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label>Producto<select name="product_id" required><option value="">Seleccionar</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
        <label>Costo unitario ($)<input name="costo_unitario" type="number" min="0" step="0.01" defaultValue="0" required /></label>
        <label>Mínimo de unidades<input name="minimo_unidades" type="number" min="1" defaultValue="1" required /></label>
        <button disabled={!proveedorId}>Vincular</button>
      </form>}
    </div>

    <section className="card provider-table-card">
      <div className="provider-table-head">
        <div><h3>Directorio de proveedores</h3><p>Administra los datos y el estado de cada proveedor.</p></div>
        <label>Mostrar
          <select aria-label="Mostrar proveedores" value={vista} onChange={(e) => setVista(e.target.value)}>
            <option value="activos">Activos ({activos.length})</option>
            <option value="archivados">Archivados ({archivados.length})</option>
          </select>
        </label>
      </div>
      {visibles.length === 0 ? <p className="provider-empty">No hay proveedores {vista === "activos" ? "activos" : "archivados"}.</p>
        : <div className="table-scroll"><table className="providers-table">
          <thead><tr><th>Proveedor</th><th>Correo</th><th>Teléfono</th><th>Entrega</th><th>Compra mínima</th><th>Estado</th>{puedeGestionar && <th>Acciones</th>}</tr></thead>
          <tbody>{visibles.map((p) => <tr key={p.id}>
            <td data-etiqueta="Proveedor"><strong>{p.nombre}</strong></td>
            <td data-etiqueta="Correo">{p.correo}</td>
            <td data-etiqueta="Teléfono">{p.telefono || "—"}</td>
            <td data-etiqueta="Entrega">{p.lead_time_dias} días</td>
            <td data-etiqueta="Compra mínima">{dinero(p.minimo_compra)}</td>
            <td data-etiqueta="Estado"><span className={`badge ${p.activo ? "ok" : "muted"}`}>{p.activo ? "Activo" : "Archivado · inactivo"}</span></td>
            {puedeGestionar && <td data-etiqueta="Acciones"><div className="provider-actions">
              <button type="button" disabled={accionId === p.id || ocupado} onClick={() => editar(p)}>Editar</button>
              <button type="button" disabled={accionId === p.id} onClick={() => cambiarEstado(p, !p.activo)}>{p.activo ? "Archivar" : "Reactivar"}</button>
              {perfil.role === "admin" && <button type="button" className="danger" disabled={accionId === p.id} onClick={() => eliminar(p)}>Eliminar</button>}
            </div></td>}
          </tr>)}</tbody>
        </table></div>}
    </section>
  </Pagina>;
}
