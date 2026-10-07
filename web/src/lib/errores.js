// Convierte los errores de Supabase en mensajes claros en español.

/** Recibe cualquier error y devuelve el texto que se le muestra al usuario. */
export function mensajeError(error) {
  const texto = String(error?.message ?? "").trim();
  const codigo = error?.code;

  if (codigo === "23505") {
    return "Ese código ya existe. Usa otro código o edita el producto existente.";
  }
  if (codigo === "invalid_credentials" || /invalid login credentials/i.test(texto)) {
    return "Correo o contraseña incorrectos.";
  }
  if (error?.status === 401 || codigo === "PGRST301" || /jwt expired|invalid jwt/i.test(texto)) {
    return "Tu sesión expiró. Vuelve a iniciar sesión.";
  }
  if (/failed to fetch|networkerror|load failed|fetch failed|failed to send a request/i.test(texto)) {
    return "No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.";
  }
  if (error?.status === 404 && /non-2xx|not found/i.test(texto)) {
    return "La función revisar-inventario todavía no está desplegada en Supabase. Revisa el paso 4 del README.";
  }
  if (codigo === "22003") {
    return "El número es demasiado grande.";
  }
  if (codigo === "23514") {
    return "Algún dato no cumple las reglas del inventario: sin negativos y textos de 1 a 120 caracteres.";
  }
  if (codigo === "42501") {
    return "No tienes permiso para hacer esto.";
  }
  return texto || "Ocurrió un error inesperado.";
}
