import { useState } from "react";
import { resolverCategoria } from "../lib/categorias.js";

const CREAR_CATEGORIA = "__crear_categoria__";

// Formulario para dar de alta un producto con categoría existente o nueva.
export default function FormularioProducto({ categorias, ocupado, onGuardar }) {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");

  async function enviar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = Object.fromEntries(new FormData(formulario));
    datos.categoria = resolverCategoria(datos.categoria, categorias);
    if (await onGuardar(datos)) {
      formulario.reset();
      setCategoriaSeleccionada("");
    }
  }

  return (
    <section className="card">
      <h3>Registrar producto</h3>
      <form className="form-grid" onSubmit={enviar}>
        <p className="field-note">El código se asignará automáticamente al guardar y no se puede modificar.</p>
        <label>Nombre<input name="nombre" maxLength={120} required /></label>
        <label>Categoría
          <select aria-label="Categoría" value={categoriaSeleccionada} required
            onChange={(e) => setCategoriaSeleccionada(e.target.value)}>
            <option value="">Selecciona una categoría</option>
            {categorias.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
            <option value={CREAR_CATEGORIA}>Crear una categoría nueva…</option>
          </select>
        </label>
        {categoriaSeleccionada === CREAR_CATEGORIA
          ? <label>Nueva categoría<input name="categoria" maxLength={120} placeholder="Escribe el nombre" required /></label>
          : <input type="hidden" name="categoria" value={categoriaSeleccionada} />}
        <label>Costo unitario ($)<input type="number" name="costo" min="0" step="0.01" placeholder="0.00" required /></label>
        <label>Stock actual<input type="number" name="stock_actual" min="0" step="1" required /></label>
        <label>Stock mínimo<input type="number" name="stock_minimo" min="0" step="1" required /></label>
        <button className="primary" disabled={ocupado}>Guardar producto</button>
      </form>
    </section>
  );
}
