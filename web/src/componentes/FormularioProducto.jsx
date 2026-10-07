// Formulario para dar de alta un producto.
export default function FormularioProducto({ categorias, ocupado, onGuardar }) {
  async function enviar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = Object.fromEntries(new FormData(formulario));
    if (await onGuardar(datos)) formulario.reset(); // solo se limpia si se guardó
  }

  return (
    <section className="card">
      <h3>Registrar producto</h3>
      <form className="form-grid" onSubmit={enviar}>
        <label>Código<input name="codigo" maxLength={120} required /></label>
        <label>Nombre<input name="nombre" maxLength={120} required /></label>
        <label>Categoría<input name="categoria" maxLength={120} list="categorias" required /></label>
        <label>Costo unitario ($)<input type="number" name="costo" min="0" step="0.01" placeholder="0.00" required /></label>
        <label>Stock actual<input type="number" name="stock_actual" min="0" step="1" required /></label>
        <label>Stock mínimo<input type="number" name="stock_minimo" min="0" step="1" required /></label>
        <datalist id="categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        <button className="primary" disabled={ocupado}>Guardar producto</button>
      </form>
    </section>
  );
}
