/** Cantidad y costo para volver al stock mínimo. */
export function calcularReposicion(item) {
  const faltante = Math.max(0, Number(item.faltante ?? (Number(item.stock_minimo) - Number(item.stock_actual)) ?? 0));
  const costo = Number(item.costo ?? 0);
  return { faltante, costoUnitario: costo, subtotal: Math.round(faltante * costo * 100) / 100 };
}

export function crearCsvAlertas(filas) {
  const escapar = (valor) => `"${String(valor ?? "").replaceAll('"', '""')}"`;
  const contenido = [
    "id,fecha,tipo,destinatario,estado_entrega,message_id,intentos",
    ...filas.map((a) => [a.id, a.created_at, a.tipo, a.recipient, a.delivery_status ?? a.status, a.message_id, a.attempts]
      .map(escapar).join(",")),
  ].join("\r\n");
  return `\ufeff${contenido}`;
}
