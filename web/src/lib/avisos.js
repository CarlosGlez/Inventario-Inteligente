// Textos de los avisos que aparecen después de revisar o reintentar.
// Son los mismos mensajes de la versión Flask.

export const ETIQUETAS_ESTADO = {
  simulado: "Simulado: no enviado",
  enviado: "Enviado",
  error: "Error de envío",
  pendiente: "Pendiente",
  enviando: "Enviando",
};

// Una alerta que lleva más de estos minutos sin terminar se considera atorada.
const MINUTOS_ATORADA = 5;

/** Aviso tras pulsar "Revisar inventario ahora". */
export function avisoRevision(resultado) {
  if (resultado?.alert_id === null || resultado?.alert_id === undefined) {
    return { tipo: "success", texto: "Revisión completa. No hay episodios nuevos de stock bajo." };
  }
  if (resultado.status === "simulado") {
    return { tipo: "info", texto: "Alerta simulada y guardada. No se envió ningún correo real." };
  }
  if (resultado.status === "enviado") {
    return { tipo: "success", texto: "Alerta enviada por correo y guardada." };
  }
  return { tipo: "error", texto: "La alerta se guardó, pero falló el correo. Puedes reintentar en Historial de alertas." };
}

/** Aviso tras pulsar "Reintentar envío". */
export function avisoReintento(status) {
  const detalle = {
    simulado: "correo simulado; no se envió realmente",
    enviado: "correo enviado",
    error: "el envío volvió a fallar",
  }[status] ?? status;
  return { tipo: status === "error" ? "error" : "info", texto: `Reintento: ${detalle}.` };
}

/** ¿Se muestra el botón "Reintentar envío" en esta alerta? */
export function puedeReintentar(alerta, ahora = new Date()) {
  if (alerta.status === "error") return true;
  if (alerta.status !== "pendiente" && alerta.status !== "enviando") return false;
  const desde = new Date(alerta.last_attempt_at ?? alerta.created_at).getTime();
  return ahora.getTime() - desde > MINUTOS_ATORADA * 60000;
}
