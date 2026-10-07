// Mostrar fechas. La base las guarda con zona horaria; aquí se muestran en la
// hora local de quien mira la página.

const dos = (n) => String(n).padStart(2, "0");

/** "2026-10-05T19:39:59Z" -> "2026-10-05 13:39:59" (si tu zona es UTC-6). */
export function fechaLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} `
    + `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}
