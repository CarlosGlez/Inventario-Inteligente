import { useEffect, useState } from "react";
import { dinero } from "../lib/dinero.js";
import DiasRestantes from "./DiasRestantes.jsx";

// Ancho de la barrita de stock: llena cuando el stock es el doble del mínimo.
function anchoBarra(p) {
  if (!p.stock_minimo) return 100;
  return Math.round(Math.min(100, (p.stock_actual * 100) / (p.stock_minimo * 2)));
}

function Estado({ p }) {
  if (p.bajo) return <span className="badge low">Stock bajo</span>;
  if (p.urgente) return <span className="badge warn">Por agotarse</span>;
  return <span className="badge ok">Suficiente</span>;
}

// Tabla de productos con buscador, filtros y las acciones de cada fila.
export default function TablaProductos({ productos, categorias, ocupado, onMovimiento, onEditar, onEliminar }) {
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [abierto, setAbierto] = useState(null); // "movimiento:3" o "editar:3"

  // Los formularios flotantes se cierran al hacer clic fuera o con Escape.
  useEffect(() => {
    const alHacerClic = (evento) => {
      if (!evento.target.closest?.(".actions details")) setAbierto(null);
    };
    const alTeclear = (evento) => {
      if (evento.key === "Escape") setAbierto(null);
    };
    document.addEventListener("click", alHacerClic);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("click", alHacerClic);
      document.removeEventListener("keydown", alTeclear);
    };
  }, []);

  if (productos.length === 0) {
    return (
      <section className="card table-card">
        <div className="table-head"><h3>Productos registrados</h3></div>
        <p>El inventario está vacío. Registra un producto o importa el Excel de ejemplo.</p>
      </section>
    );
  }

  const buscado = texto.trim().toLowerCase();
  const visibles = productos.filter((p) =>
    `${p.codigo} ${p.nombre}`.toLowerCase().includes(buscado)
    && (!categoria || p.categoria === categoria)
    && (!soloUrgentes || p.urgente));

  const alternar = (clave) => (evento) => {
    evento.preventDefault();
    setAbierto(abierto === clave ? null : clave);
  };

  async function enviarMovimiento(evento, id) {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.currentTarget));
    if (await onMovimiento(id, datos.tipo, datos.cantidad)) setAbierto(null);
  }

  async function enviarEdicion(evento, id) {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.currentTarget));
    if (await onEditar(id, datos)) setAbierto(null);
  }

  return (
    <section className="card table-card">
      <div className="table-head">
        <h3>Productos registrados</h3>
        <div className="filters" role="search">
          <input type="search" placeholder="Buscar por código o nombre…" aria-label="Buscar producto"
            value={texto} onChange={(e) => setTexto(e.target.value)} />
          <select aria-label="Filtrar por categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={soloUrgentes} onChange={(e) => setSoloUrgentes(e.target.checked)} /> Solo urgentes
          </label>
        </div>
      </div>
      <div className="table-scroll tabla-tarjetas">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Costo unit.</th>
              <th>Valor</th><th>Se agota en</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className={p.bajo ? "low-row" : ""} data-codigo={p.codigo}>
                <td data-etiqueta="Código"><strong>{p.codigo}</strong></td>
                <td data-etiqueta="Nombre">{p.nombre}</td>
                <td data-etiqueta="Categoría">{p.categoria}</td>
                <td data-etiqueta="Stock">
                  <div className="stock-cell">
                    <span>{p.stock_actual} <small>/ mín. {p.stock_minimo}</small></span>
                    <span className="meter"><span className={p.bajo ? "low" : "ok"} style={{ width: `${anchoBarra(p)}%` }} /></span>
                  </div>
                </td>
                <td data-etiqueta="Costo unit.">{dinero(p.costo)}</td>
                <td data-etiqueta="Valor">{dinero(p.stock_actual * p.costo)}</td>
                <td data-etiqueta="Se agota en">
                  <div>
                    <DiasRestantes producto={p} />
                    {p.consumo_diario !== null && <small className="sub">{p.consumo_diario} u./día</small>}
                  </div>
                </td>
                <td data-etiqueta="Estado"><Estado p={p} /></td>
                <td data-etiqueta="Acciones">
                  <div className="actions">
                    <details open={abierto === `movimiento:${p.id}`}>
                      <summary onClick={alternar(`movimiento:${p.id}`)}>Movimiento</summary>
                      {abierto === `movimiento:${p.id}` && (
                        <form className="inline-form" onSubmit={(e) => enviarMovimiento(e, p.id)}>
                          <select name="tipo" aria-label="Tipo de movimiento">
                            <option value="entrada">Entrada</option>
                            <option value="salida">Salida</option>
                          </select>
                          <input type="number" name="cantidad" min="1" step="1" placeholder="Unidades" aria-label="Unidades" required />
                          <button disabled={ocupado}>Registrar</button>
                        </form>
                      )}
                    </details>
                    <details open={abierto === `editar:${p.id}`}>
                      <summary onClick={alternar(`editar:${p.id}`)}>Editar</summary>
                      {abierto === `editar:${p.id}` && (
                        <form className="edit-form" onSubmit={(e) => enviarEdicion(e, p.id)}>
                          <label>Código<input name="codigo" defaultValue={p.codigo} maxLength={120} required /></label>
                          <label>Nombre<input name="nombre" defaultValue={p.nombre} maxLength={120} required /></label>
                          <label>Categoría<input name="categoria" defaultValue={p.categoria} maxLength={120} list="categorias" required /></label>
                          <label>Stock actual<input type="number" name="stock_actual" min="0" step="1" defaultValue={p.stock_actual} required /></label>
                          <label>Stock mínimo<input type="number" name="stock_minimo" min="0" step="1" defaultValue={p.stock_minimo} required /></label>
                          <label>Costo unitario ($)<input type="number" name="costo" min="0" step="0.01" defaultValue={Number(p.costo).toFixed(2)} required /></label>
                          <button disabled={ocupado}>Guardar cambios</button>
                        </form>
                      )}
                    </details>
                    <button type="button" className="danger" disabled={ocupado} onClick={() => onEliminar(p.id)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length === 0 && <p className="no-results">Ningún producto coincide con los filtros.</p>}
    </section>
  );
}
