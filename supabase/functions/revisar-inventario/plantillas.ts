// Correos con formato (HTML): la alerta de stock bajo y el reporte semanal.
//
// Son funciones puras: reciben los datos guardados en el historial (la columna
// "items") y devuelven el HTML del correo. No usan red ni Deno, así que se
// prueban con Vitest.
//
// Reglas del HTML para correo, distintas a las de una página web:
//   · los estilos van en línea (style="..."); muchos lectores ignoran <style>
//   · la estructura se arma con tablas, que es lo que todos entienden
//   · todo texto que venga de la base se "escapa" antes de insertarlo

// Las fechas se muestran en la hora del centro de México.
const ZONA = "America/Mexico_City";

// Gmail recorta los correos muy largos; el reporte muestra hasta este número
// de movimientos y avisa cuántos quedaron fuera.
export const MAX_MOVIMIENTOS = 100;

const ROJO = "#c62828";
const ROJO_SUAVE = "#fdecea";
const VERDE = "#1b7f4d";
const VERDE_SUAVE = "#e6f4ec";
const MARINO = "#0f1b33";
const DORADO = "#f5b82e";
const GRIS = "#5b667a";
const BORDE = "#d9dee8";

type Fila = Record<string, unknown>;

/** Neutraliza los símbolos que HTML interpreta: un nombre como <b>Tinta</b> se ve tal cual. */
export function escapar(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** 3751.5 -> "$3,751.50". Si no hay dato, una raya. */
function dinero(valor: unknown): string {
  const n = numero(valor);
  if (n === null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function entero(valor: unknown): string {
  const n = numero(valor);
  return n === null ? "—" : String(n);
}

function partesDeFecha(iso: unknown): Record<string, string> | null {
  const fecha = new Date(String(iso ?? ""));
  if (Number.isNaN(fecha.getTime())) return null;
  const formato = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return Object.fromEntries(formato.formatToParts(fecha).map((parte) => [parte.type, parte.value]));
}

/** "2026-10-08T03:00:00Z" -> "07/10/2026" (hora del centro de México). */
function soloFecha(iso: unknown): string {
  const p = partesDeFecha(iso);
  return p ? `${p.day}/${p.month}/${p.year}` : "—";
}

/** "2026-10-06T20:30:00Z" -> "06/10/2026 14:30". */
function fechaHora(iso: unknown): string {
  const p = partesDeFecha(iso);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : "—";
}

// ---- Piezas compartidas -------------------------------------------------------

const TH = `padding:9px 10px;background:${MARINO};color:#ffffff;font-size:12px;text-align:left;`;
const TD = `padding:9px 10px;border-bottom:1px solid ${BORDE};`;
const DER = "text-align:right;";

function th(texto: string, derecha = false): string {
  return `<th style="${TH}${derecha ? DER : ""}">${texto}</th>`;
}

function td(contenido: string, extra = ""): string {
  return `<td style="${TD}${extra}">${contenido}</td>`;
}

function tabla(encabezados: string, filas: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" `
    + `style="border-collapse:collapse;font-size:13px;color:#1c2333;">`
    + `<thead><tr>${encabezados}</tr></thead><tbody>${filas}</tbody></table>`;
}

function documento(titulo: string, colorEncabezado: string, encabezado: string, cuerpo: string): string {
  return `<!doctype html>`
    + `<html lang="es"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${escapar(titulo)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f2f4f8;font-family:Arial,Helvetica,sans-serif;color:#1c2333;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8;">`
    + `<tr><td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" width="720" cellpadding="0" cellspacing="0" `
    + `style="width:100%;max-width:720px;background:#ffffff;border:1px solid ${BORDE};">`
    + `<tr><td style="background:${colorEncabezado};color:#ffffff;padding:22px 24px;">${encabezado}</td></tr>`
    + `<tr><td style="padding:22px 24px;">${cuerpo}</td></tr>`
    + `<tr><td style="padding:14px 24px;border-top:1px solid ${BORDE};font-size:12px;color:${GRIS};">`
    + `Generado automáticamente por Control inteligente de inventario y alertas de stock.</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

function etiqueta(texto: string, color: string, fondo: string): string {
  return `<span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:11px;`
    + `font-weight:bold;white-space:nowrap;color:${color};background:${fondo};">${texto}</span>`;
}

// ---- Alerta de stock bajo -----------------------------------------------------

/** Correo de alerta: encabezado rojo y una tabla con los productos bajo su mínimo. */
export function htmlAlerta(alerta: { items: unknown }): string {
  const items = alerta.items as Fila[];
  const cuantos = items.length;

  let total = 0;
  let hayCostos = false;
  const filas = items.map((item) => {
    const actual = numero(item.stock_actual);
    const minimo = numero(item.stock_minimo);
    // Las alertas antiguas no guardaban el faltante: se calcula.
    const faltante = numero(item.faltante) ?? (actual !== null && minimo !== null ? minimo - actual : null);
    const costo = numero(item.costo);
    const reponer = numero(item.costo_reponer) ?? (costo !== null && faltante !== null ? costo * faltante : null);
    if (reponer !== null) {
      total += reponer;
      hayCostos = true;
    }
    return `<tr>`
      + td(escapar(item.codigo), "font-weight:bold;")
      + td(escapar(item.nombre))
      + td(entero(actual), DER)
      + td(entero(minimo), DER)
      + td(entero(faltante), `${DER}color:${ROJO};font-weight:bold;`)
      + td(dinero(costo), DER)
      + td(dinero(reponer), `${DER}font-weight:bold;`)
      + `</tr>`;
  }).join("");

  const filaTotal = hayCostos
    ? `<tr><td colspan="6" style="padding:11px 10px;${DER}font-weight:bold;">Costo estimado para llegar al mínimo</td>`
      + `<td style="padding:11px 10px;${DER}font-weight:bold;color:${ROJO};font-size:15px;">${dinero(total)}</td></tr>`
    : "";

  const encabezado =
    `<div style="font-size:11px;letter-spacing:2px;font-weight:bold;">CONTROL INTELIGENTE DE INVENTARIO</div>`
    + `<div style="font-size:23px;font-weight:bold;margin-top:6px;">&#9888; Alerta de stock bajo</div>`
    + `<div style="font-size:14px;margin-top:4px;">${cuantos} ${cuantos === 1 ? "producto" : "productos"} por debajo de su mínimo</div>`;

  const cuerpo =
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;">`
    + `Estos productos cayeron por debajo de su stock mínimo y necesitan reabastecerse.</p>`
    + tabla(
      th("Código") + th("Producto") + th("Stock actual", true) + th("Mínimo", true)
        + th("Faltante", true) + th("Costo unitario", true) + th("Costo de reposición", true),
      filas + filaTotal,
    )
    + `<p style="margin:16px 0 0;font-size:12px;color:${GRIS};line-height:1.5;">`
    + `No se repetirá este aviso mientras los productos sigan bajos. `
    + `Si un producto se recupera y vuelve a caer, se enviará una alerta nueva.</p>`;

  return documento("Alerta de stock bajo", ROJO, encabezado, cuerpo);
}

// ---- Reporte semanal ----------------------------------------------------------

function dato(titulo: string, valor: string, color: string): string {
  return `<td width="25%" style="padding:12px 10px;border:1px solid ${BORDE};vertical-align:top;">`
    + `<div style="font-size:11px;color:${GRIS};">${titulo}</div>`
    + `<div style="font-size:18px;font-weight:bold;margin-top:4px;color:${color};">${valor}</div></td>`;
}

function subtitulo(texto: string): string {
  return `<h2 style="margin:26px 0 10px;font-size:16px;color:${MARINO};">${texto}</h2>`;
}

/** Correo del reporte: resumen, inventario completo y movimientos de la semana. */
export function htmlReporte(alerta: { items: unknown }): string {
  const r = alerta.items as Fila;
  const resumen = (r.resumen ?? {}) as Fila;
  const productos = r.productos as Fila[];
  const movimientos = r.movimientos as Fila[];
  const periodo = `${soloFecha(r.desde)} al ${soloFecha(r.hasta)}`;
  const bajos = numero(resumen.bajos) ?? 0;

  const filasProductos = productos.map((p) => {
    const bajo = p.bajo === true;
    return `<tr${bajo ? ` style="background:${ROJO_SUAVE};"` : ""}>`
      + td(escapar(p.codigo), "font-weight:bold;")
      + td(escapar(p.nombre))
      + td(escapar(p.categoria))
      + td(entero(p.stock_actual), `${DER}${bajo ? `color:${ROJO};font-weight:bold;` : ""}`)
      + td(entero(p.stock_minimo), DER)
      + td(dinero(p.costo), DER)
      + td(dinero(p.valor), DER)
      + td(bajo ? etiqueta("Stock bajo", ROJO, "#ffffff") : etiqueta("Suficiente", VERDE, VERDE_SUAVE))
      + `</tr>`;
  }).join("");

  const visibles = movimientos.slice(0, MAX_MOVIMIENTOS);
  const ocultos = movimientos.length - visibles.length;
  const filasMovimientos = visibles.map((m) => {
    const entrada = m.tipo === "entrada";
    return `<tr>`
      + td(fechaHora(m.fecha), "white-space:nowrap;")
      + td(escapar(m.codigo), "font-weight:bold;")
      + td(escapar(m.nombre))
      + td(entrada ? "Entrada" : "Salida", `font-weight:bold;color:${entrada ? VERDE : ROJO};`)
      + td(entero(m.cantidad), DER)
      + td(entero(m.stock_anterior), DER)
      + td(entero(m.stock_nuevo), DER)
      + `</tr>`;
  }).join("");

  const encabezado =
    `<div style="font-size:11px;letter-spacing:2px;font-weight:bold;color:${DORADO};">CONTROL INTELIGENTE DE INVENTARIO</div>`
    + `<div style="font-size:23px;font-weight:bold;margin-top:6px;">Reporte semanal de inventario</div>`
    + `<div style="font-size:14px;margin-top:4px;">${periodo}</div>`;

  const cuerpo =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>`
    + dato("Productos", entero(resumen.total), MARINO)
    + dato("Con stock bajo", entero(bajos), bajos > 0 ? ROJO : VERDE)
    + dato("Valor del inventario", dinero(resumen.valor), MARINO)
    + dato("Reponer al mínimo", dinero(resumen.reponer), bajos > 0 ? ROJO : MARINO)
    + `</tr></table>`

    + subtitulo("Inventario completo")
    + (productos.length > 0
      ? tabla(
        th("Código") + th("Producto") + th("Categoría") + th("Stock", true) + th("Mínimo", true)
          + th("Costo unit.", true) + th("Valor", true) + th("Estado"),
        filasProductos,
      )
      : `<p style="margin:0;font-size:14px;color:${GRIS};">El inventario está vacío.</p>`)

    + subtitulo("Movimientos de la semana")
    + (movimientos.length > 0
      ? `<p style="margin:0 0 10px;font-size:13px;color:${GRIS};">`
        + `${movimientos.length} ${movimientos.length === 1 ? "movimiento" : "movimientos"} · `
        + `<span style="color:${VERDE};font-weight:bold;">Entradas: ${entero(r.entradas)} u.</span> · `
        + `<span style="color:${ROJO};font-weight:bold;">Salidas: ${entero(r.salidas)} u.</span></p>`
        + tabla(
          th("Fecha") + th("Código") + th("Producto") + th("Tipo") + th("Unidades", true)
            + th("Antes", true) + th("Después", true),
          filasMovimientos,
        )
        + (ocultos > 0
          ? `<p style="margin:10px 0 0;font-size:12px;color:${GRIS};">`
            + `y ${ocultos} ${ocultos === 1 ? "movimiento" : "movimientos"} más. El historial completo está en la página.</p>`
          : "")
      : `<p style="margin:0;font-size:14px;color:${GRIS};">No hubo movimientos esta semana.</p>`);

  return documento("Reporte semanal de inventario", MARINO, encabezado, cuerpo);
}

// ---- Elegir la plantilla --------------------------------------------------------

const esObjeto = (valor: unknown): valor is Fila => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/**
 * Devuelve el HTML que corresponde al tipo de correo. Si los datos guardados no
 * tienen la forma esperada devuelve undefined: el correo sale solo como texto,
 * que es mejor que no enviarlo.
 */
export function htmlCorreo(alerta: { tipo?: string; items?: unknown }): string | undefined {
  try {
    const tipo = alerta.tipo ?? "stock_bajo";
    if (tipo === "stock_bajo") {
      const items = alerta.items;
      if (!Array.isArray(items) || items.length === 0 || !items.every(esObjeto)) return undefined;
      return htmlAlerta({ items });
    }
    if (tipo === "reporte_semanal") {
      const r = alerta.items;
      if (!esObjeto(r) || !Array.isArray(r.productos) || !Array.isArray(r.movimientos)) return undefined;
      if (!r.productos.every(esObjeto) || !r.movimientos.every(esObjeto)) return undefined;
      return htmlReporte({ items: r });
    }
    return undefined;
  } catch {
    return undefined;
  }
}
