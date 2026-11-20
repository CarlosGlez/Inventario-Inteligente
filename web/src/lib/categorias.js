const claveCategoria = (valor) => String(valor ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es");

export function categoriasUnicas(valores) {
  const unicas = new Map();
  for (const valor of valores) {
    const nombre = String(valor ?? "").trim();
    const clave = claveCategoria(nombre);
    if (clave && !unicas.has(clave)) unicas.set(clave, nombre);
  }
  return [...unicas.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export function resolverCategoria(valor, categorias) {
  const clave = claveCategoria(valor);
  return categorias.find((categoria) => claveCategoria(categoria) === clave) ?? String(valor ?? "").trim();
}
