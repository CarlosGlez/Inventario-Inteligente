// Tarjeta para subir un Excel. La lectura y validación ocurren en el navegador.
export default function ImportarExcel({ ocupado, onImportar }) {
  async function enviar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const archivo = formulario.elements.archivo.files[0];
    if (await onImportar(archivo)) formulario.reset();
  }

  return (
    <section className="card">
      <h3>Importar desde Excel</h3>
      <p>
        Columnas: <code>codigo, nombre, categoria, stock_actual, stock_minimo, costo</code>. Se revisa todo el archivo
        antes de guardar y los códigos existentes se actualizan. Si no trae <code>costo</code>, los productos
        existentes conservan el suyo.
      </p>
      <form className="stack" onSubmit={enviar}>
        <label>Archivo .xlsx<input type="file" name="archivo" accept=".xlsx" required /></label>
        <button disabled={ocupado}>Importar archivo</button>
      </form>
      <a className="download" href="/inventario_ejemplo.xlsx" download>Descargar Excel de ejemplo</a>
    </section>
  );
}
