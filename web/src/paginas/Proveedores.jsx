import { useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { guardarProveedor, listarProveedores, vincularProductoProveedor } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

export default function Proveedores() {
  const [lista, setLista] = useState([]);
  const [productos, setProductos] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [proveedorId, setProveedorId] = useState("");
  useEffect(() => {
    Promise.all([listarProveedores(), supabase.from("products").select("id,codigo,nombre").order("nombre")])
      .then(([p, r]) => { if (r.error) throw r.error; setLista(p); setProductos(r.data); })
      .catch((e) => setAviso({ tipo: "error", texto: e.message }));
  }, []);
  async function guardar(evento) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    try {
      await guardarProveedor({ nombre: f.get("nombre"), correo: f.get("correo"), telefono: f.get("telefono"), lead_time_dias: Number(f.get("lead_time_dias")), minimo_compra: Number(f.get("minimo_compra")) });
      setLista(await listarProveedores()); evento.currentTarget.reset();
      setAviso({ tipo: "success", texto: "Proveedor registrado." });
    } catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  async function vincular(evento) {
    evento.preventDefault(); const f = new FormData(evento.currentTarget);
    try {
      await vincularProductoProveedor(Number(f.get("proveedor_id")), Number(f.get("product_id")), Number(f.get("costo_unitario")), Number(f.get("minimo_unidades")));
      setAviso({ tipo: "success", texto: "Producto vinculado al proveedor." });
    } catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  return <Pagina aviso={aviso} resumen={null}>
    <div className="page-title"><div><h2>Proveedores</h2><p>Contactos, plazo de entrega y catálogo de productos surtidos.</p></div></div>
    <div className="two-columns">
      <form className="card form-card" onSubmit={guardar}><h3>Registrar proveedor</h3>
        <label>Nombre<input name="nombre" maxLength="160" required /></label><label>Correo<input type="email" name="correo" required /></label>
        <label>Teléfono<input name="telefono" /></label><label>Lead time (días)<input type="number" min="0" max="365" name="lead_time_dias" defaultValue="7" required /></label>
        <label>Compra mínima ($)<input type="number" min="0" step="0.01" name="minimo_compra" defaultValue="0" required /></label><button className="primary">Guardar</button>
      </form>
      <form className="card form-card" onSubmit={vincular}><h3>Asignar producto</h3>
        <label>Proveedor<select name="proveedor_id" required onChange={(e) => setProveedorId(e.target.value)}><option value="">Seleccionar</option>{lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label>Producto<select name="product_id" required><option value="">Seleccionar</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
        <label>Costo unitario ($)<input name="costo_unitario" type="number" min="0" step="0.01" defaultValue="0" required /></label><label>Mínimo de unidades<input name="minimo_unidades" type="number" min="1" defaultValue="1" required /></label>
        <button disabled={!proveedorId}>Vincular</button>
      </form>
    </div>
    <section className="card"><h3>Proveedores registrados ({lista.length})</h3><ul>{lista.map((p) => <li key={p.id}><strong>{p.nombre}</strong> · {p.correo} · lead time {p.lead_time_dias} días · mínimo {p.minimo_compra}</li>)}</ul></section>
  </Pagina>;
}
