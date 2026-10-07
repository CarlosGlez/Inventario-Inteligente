// @vitest-environment jsdom
// Pruebas de las pantallas. Las llamadas a Supabase se sustituyen por funciones
// falsas (api.js simulado), así se prueba lo que la persona ve y hace.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => ({ configurado: true, supabase: {} }));
vi.mock("../src/lib/api.js", () => ({
  cargarInventario: vi.fn(),
  cargarResumen: vi.fn(),
  guardarProducto: vi.fn(),
  eliminarProducto: vi.fn(),
  registrarMovimiento: vi.fn(),
  importarProductos: vi.fn(),
  listarMovimientos: vi.fn(),
  listarAlertas: vi.fn(),
  revisarAhora: vi.fn(),
  reintentarAlerta: vi.fn(),
  enviarReporte: vi.fn(),
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
  alCambiarSesion: vi.fn(() => () => {}),
}));

import App from "../src/App.jsx";
import * as api from "../src/lib/api.js";

const RESUMEN = { total: 2, bajos: 1, valor: 1335, reponer: 225, ultima_revision: "2026-10-05T19:39:59Z" };
const BAJO = { id: 1, codigo: "P003", nombre: "Bolígrafo azul", categoria: "Papelería", stock_actual: 7, stock_minimo: 12, costo: 45, low_active: true };
const SUFICIENTE = { id: 2, codigo: "P008", nombre: "Grapadora", categoria: "Oficina", stock_actual: 5, stock_minimo: 3, costo: 120, low_active: false };

function abrir(ruta = "/") {
  return render(<MemoryRouter initialEntries={[ruta]}><App /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.obtenerSesion.mockResolvedValue({ user: { email: "equipo@escuela.mx" } });
  api.alCambiarSesion.mockReturnValue(() => {});
  api.cargarInventario.mockResolvedValue({ productos: [BAJO, SUFICIENTE], consumo: [], resumen: RESUMEN });
  api.cargarResumen.mockResolvedValue(RESUMEN);
  api.listarMovimientos.mockResolvedValue([]);
  api.listarAlertas.mockResolvedValue([]);
});
afterEach(cleanup);

describe("sesión", () => {
  it("sin sesión muestra el formulario para entrar", async () => {
    api.obtenerSesion.mockResolvedValue(null);
    abrir();
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeTruthy();
    expect(api.cargarInventario).not.toHaveBeenCalled();
  });

  it("con credenciales incorrectas muestra el motivo", async () => {
    api.obtenerSesion.mockResolvedValue(null);
    api.iniciarSesion.mockRejectedValue(new Error("Correo o contraseña incorrectos."));
    abrir();
    fireEvent.change(await screen.findByLabelText("Correo"), { target: { value: "a@b.mx" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "mala" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeTruthy();
    expect(api.iniciarSesion).toHaveBeenCalledWith("a@b.mx", "mala");
  });
});

describe("Inventario", () => {
  it("muestra el resumen, el panel de reabasto y la tabla", async () => {
    abrir();
    expect(await screen.findByText("Reabastecer primero")).toBeTruthy();
    expect(screen.getByText("$1,335.00")).toBeTruthy();                 // valor del inventario
    expect(screen.getByText("Reponer al mínimo: $225.00")).toBeTruthy();
    expect(screen.getByText("Stock bajo", { selector: ".badge" })).toBeTruthy();
    expect(screen.getByText("Suficiente", { selector: ".badge" })).toBeTruthy();
    const fila = screen.getByText("P003").closest("tr");
    expect(within(fila).getByText("$45.00")).toBeTruthy();              // costo unitario
    expect(within(fila).getByText("$315.00")).toBeTruthy();             // 7 × 45
    expect(within(fila).getByText("Sin consumo")).toBeTruthy();
    expect(fila.className).toContain("low-row");
  });

  it("el panel de reabasto sugiere llegar al mínimo y suma la compra", async () => {
    abrir();
    const panel = (await screen.findByText("Reabastecer primero")).closest("section");
    expect(within(panel).getByText("Bolígrafo azul")).toBeTruthy();
    expect(within(panel).getByText("+5 u.")).toBeTruthy();
    expect(within(panel).getAllByText("$225.00")).toHaveLength(2);      // el producto y el total
    expect(within(panel).queryByText("Grapadora")).toBeNull();
  });

  it("'Solo urgentes' y el buscador filtran la tabla", async () => {
    abrir();
    await screen.findByText("P003");
    const filas = () => screen.getAllByRole("row").filter((fila) => fila.dataset.codigo);
    expect(filas()).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Solo urgentes"));
    expect(filas().map((fila) => fila.dataset.codigo)).toEqual(["P003"]);
    fireEvent.click(screen.getByLabelText("Solo urgentes"));
    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "Oficina" } });
    expect(filas().map((fila) => fila.dataset.codigo)).toEqual(["P008"]);
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "no existe" } });
    expect(filas()).toHaveLength(0);
    expect(screen.getByText("Ningún producto coincide con los filtros.")).toBeTruthy();
  });

  it("con el inventario vacío invita a registrar o importar", async () => {
    api.cargarInventario.mockResolvedValue({ productos: [], consumo: [], resumen: { ...RESUMEN, total: 0, bajos: 0, valor: 0, reponer: 0, ultima_revision: null } });
    abrir();
    expect(await screen.findByText("El inventario está vacío. Registra un producto o importa el Excel de ejemplo.")).toBeTruthy();
    expect(screen.getByText("Aún no se ha revisado")).toBeTruthy();
    expect(screen.getByText(/Todo en orden/)).toBeTruthy();
  });

  it("si la carga falla muestra el motivo y permite reintentar", async () => {
    api.cargarInventario.mockRejectedValueOnce(new Error("No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo."));
    abrir();
    expect(await screen.findByText("No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("P003")).toBeTruthy();
  });

  it("registrar un producto llama a la base, avisa y recarga la lista", async () => {
    api.guardarProducto.mockResolvedValue(undefined);
    abrir();
    const formulario = (await screen.findByText("Registrar producto")).closest("section");
    const escribir = (etiqueta, valor) => fireEvent.change(within(formulario).getByLabelText(etiqueta), { target: { value: valor } });
    escribir("Código", "P099"); escribir("Nombre", "Tijeras"); escribir("Categoría", "Oficina");
    escribir("Costo unitario ($)", "35.50"); escribir("Stock actual", "4"); escribir("Stock mínimo", "2");
    fireEvent.click(within(formulario).getByRole("button", { name: "Guardar producto" }));
    expect(await screen.findByText("Producto registrado.")).toBeTruthy();
    expect(api.guardarProducto).toHaveBeenCalledWith(
      { codigo: "P099", nombre: "Tijeras", categoria: "Oficina", costo: "35.50", stock_actual: "4", stock_minimo: "2" }, null);
    expect(api.cargarInventario).toHaveBeenCalledTimes(2);
  });

  it("un movimiento rechazado muestra el error y no pierde la tabla", async () => {
    api.registrarMovimiento.mockRejectedValue(new Error("La salida supera el stock disponible; el inventario no puede quedar negativo."));
    abrir();
    const fila = (await screen.findByText("P003")).closest("tr");
    fireEvent.click(within(fila).getByText("Movimiento"));
    fireEvent.change(within(fila).getByLabelText("Tipo de movimiento"), { target: { value: "salida" } });
    fireEvent.change(within(fila).getByLabelText("Unidades"), { target: { value: "99" } });
    fireEvent.click(within(fila).getByRole("button", { name: "Registrar" }));
    expect(await screen.findByText("La salida supera el stock disponible; el inventario no puede quedar negativo.")).toBeTruthy();
    expect(api.registrarMovimiento).toHaveBeenCalledWith(1, "salida", "99");
    expect(screen.getByText("P003")).toBeTruthy();
  });

  it("lleva la vista al aviso, porque la acción pudo ocurrir muy abajo en la tabla", async () => {
    const desplazar = vi.fn();
    Element.prototype.scrollIntoView = desplazar;
    api.registrarMovimiento.mockRejectedValue(new Error("La salida supera el stock disponible; el inventario no puede quedar negativo."));
    abrir();
    const fila = (await screen.findByText("P003")).closest("tr");
    expect(desplazar).not.toHaveBeenCalled();
    fireEvent.click(within(fila).getByText("Movimiento"));
    fireEvent.change(within(fila).getByLabelText("Unidades"), { target: { value: "99" } });
    fireEvent.click(within(fila).getByRole("button", { name: "Registrar" }));
    const aviso = await screen.findByRole("alert");
    await waitFor(() => expect(desplazar).toHaveBeenCalledTimes(1));
    expect(desplazar.mock.instances[0]).toBe(aviso);
    delete Element.prototype.scrollIntoView;
  });

  it("eliminar pide confirmación", async () => {
    api.eliminarProducto.mockResolvedValue(undefined);
    const confirmar = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    abrir();
    const fila = (await screen.findByText("P008")).closest("tr");
    fireEvent.click(within(fila).getByRole("button", { name: "Eliminar" }));
    expect(api.eliminarProducto).not.toHaveBeenCalled();
    fireEvent.click(within(fila).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("Producto eliminado. Su historial anterior se conserva.")).toBeTruthy();
    expect(api.eliminarProducto).toHaveBeenCalledWith(2);
    confirmar.mockRestore();
  });

  it("'Revisar inventario ahora' lleva al historial con el resultado", async () => {
    api.revisarAhora.mockResolvedValue({ alert_id: 9, status: "simulado", otras: [] });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Revisar inventario ahora" }));
    expect(await screen.findByText("Alerta simulada y guardada. No se envió ningún correo real.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Historial de alertas" })).toBeTruthy();
  });
});

describe("Movimientos", () => {
  it("sin movimientos lo dice", async () => {
    abrir("/movimientos");
    expect(await screen.findByText("Todavía no hay movimientos.")).toBeTruthy();
  });

  it("lista los movimientos con su stock anterior y nuevo", async () => {
    api.listarMovimientos.mockResolvedValue([
      { id: 5, created_at: "2026-10-05T19:00:00Z", product_code: "P003", product_name: "Bolígrafo azul", tipo: "salida", cantidad: 3, stock_anterior: 10, stock_nuevo: 7 },
    ]);
    abrir("/movimientos");
    const fila = (await screen.findByText("Bolígrafo azul")).closest("tr");
    expect(within(fila).getByText("Salida")).toBeTruthy();
    expect([...fila.querySelectorAll("td")].slice(4).map((celda) => celda.textContent)).toEqual(["3", "10", "7"]);
  });
});

describe("Historial de alertas", () => {
  const alerta = (cambios) => ({
    id: 1, created_at: "2026-10-05T19:20:15Z", status: "simulado", attempts: 1, last_attempt_at: "2026-10-05T19:20:15Z", error: null,
    subject: "Alerta de inventario: 1 producto(s) con stock bajo", body: "Productos por debajo del stock mínimo:",
    items: [{ id: 1, codigo: "P003", nombre: "Bolígrafo azul", stock_actual: 7, stock_minimo: 12, costo: 45, faltante: 5, costo_reponer: 225 }],
    ...cambios,
  });

  it("sin alertas invita a probar el flujo", async () => {
    abrir("/alertas");
    expect(await screen.findByText("No hay alertas. Pulsa “Revisar inventario ahora” para probar el flujo.")).toBeTruthy();
  });

  it("una alerta simulada lo dice claramente y no ofrece reintentar", async () => {
    api.listarAlertas.mockResolvedValue([alerta({ id: 1 })]);
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Alerta #1")).closest("article");
    expect(within(tarjeta).getByText("Simulado: no enviado")).toBeTruthy();
    expect(within(tarjeta).getByText("$225.00")).toBeTruthy();
    expect(within(tarjeta).getByText("Alerta de inventario: 1 producto(s) con stock bajo")).toBeTruthy();
    expect(within(tarjeta).queryByRole("button", { name: "Reintentar envío" })).toBeNull();
  });

  it("una alerta con error muestra el motivo y se puede reintentar", async () => {
    api.listarAlertas.mockResolvedValue([alerta({ id: 2, status: "error", error: "Connection timeout" })]);
    api.reintentarAlerta.mockResolvedValue({ alert_id: 2, status: "enviado" });
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Alerta #2")).closest("article");
    expect(within(tarjeta).getByText("Error de envío")).toBeTruthy();
    expect(within(tarjeta).getByText("Connection timeout")).toBeTruthy();
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Reintentar envío" }));
    expect(await screen.findByText("Reintento: correo enviado.")).toBeTruthy();
    expect(api.reintentarAlerta).toHaveBeenCalledWith(2);
    expect(api.listarAlertas).toHaveBeenCalledTimes(2);
  });

  it("si la revisión falla muestra el motivo", async () => {
    api.revisarAhora.mockRejectedValue(new Error("Tu sesión expiró. Vuelve a iniciar sesión."));
    abrir("/alertas");
    fireEvent.click(await screen.findByRole("button", { name: "Revisar inventario ahora" }));
    expect(await screen.findByText("Tu sesión expiró. Vuelve a iniciar sesión.")).toBeTruthy();
  });
});

describe("Reporte semanal", () => {
  const reporte = (cambios) => ({
    id: 4, tipo: "reporte_semanal", created_at: "2026-10-05T14:00:00Z", status: "enviado", attempts: 1,
    last_attempt_at: "2026-10-05T14:00:02Z", error: null,
    subject: "Reporte semanal de inventario: 28/09/2026 al 05/10/2026", body: "Reporte semanal de inventario\nPeriodo: 28/09/2026 al 05/10/2026",
    items: {
      desde: "2026-09-28T14:00:00Z", hasta: "2026-10-05T14:00:00Z",
      resumen: { total: 16, bajos: 6, valor: 7138.5, reponer: 742.5 },
      productos: [{ codigo: "P003" }, { codigo: "P008" }],
      movimientos: [{ codigo: "P003", tipo: "salida", cantidad: 3 }],
      entradas: 20, salidas: 23,
    },
    ...cambios,
  });

  it("el reporte aparece en el historial con su resumen, junto a las alertas", async () => {
    api.listarAlertas.mockResolvedValue([
      reporte({}),
      { id: 1, created_at: "2026-10-05T19:20:15Z", status: "simulado", attempts: 1, last_attempt_at: null, error: null, subject: "Asunto", body: "Cuerpo",
        items: [{ id: 1, codigo: "P003", nombre: "Bolígrafo azul", stock_actual: 7, stock_minimo: 12, costo: 45, faltante: 5, costo_reponer: 225 }] },
    ]);
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Reporte semanal #4")).closest("article");
    expect(within(tarjeta).getByText("Enviado")).toBeTruthy();
    expect(within(tarjeta).getByText(/16 producto\(s\) · 1 movimiento\(s\)/)).toBeTruthy();
    expect(within(tarjeta).getByText("$7,138.50")).toBeTruthy();
    expect(within(tarjeta).getByText(/Entradas: 20 u\. · Salidas: 23 u\./)).toBeTruthy();
    expect(within(tarjeta).getByText("Reporte semanal de inventario: 28/09/2026 al 05/10/2026")).toBeTruthy();
    expect(screen.getByText("Alerta #1")).toBeTruthy();     // las alertas se siguen viendo igual
  });

  it("'Enviar reporte ahora' pide el reporte al bot, avisa y recarga el historial", async () => {
    api.enviarReporte.mockResolvedValue({ alert_id: 4, status: "enviado" });
    abrir("/alertas");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar reporte ahora" }));
    expect(await screen.findByText("Reporte semanal enviado por correo.")).toBeTruthy();
    expect(api.enviarReporte).toHaveBeenCalledTimes(1);
    expect(api.listarAlertas).toHaveBeenCalledTimes(2);
  });

  it("si el envío del reporte falla lo dice y el reporte se puede reintentar", async () => {
    api.listarAlertas.mockResolvedValue([reporte({ status: "error", error: "Connection timeout" })]);
    api.reintentarAlerta.mockResolvedValue({ alert_id: 4, status: "enviado" });
    abrir("/alertas");
    const tarjeta = (await screen.findByText("Reporte semanal #4")).closest("article");
    expect(within(tarjeta).getByText("Connection timeout")).toBeTruthy();
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Reintentar envío" }));
    expect(await screen.findByText("Reintento: correo enviado.")).toBeTruthy();
    expect(api.reintentarAlerta).toHaveBeenCalledWith(4);
  });

  it("un reporte con datos incompletos no rompe la pantalla", async () => {
    api.listarAlertas.mockResolvedValue([reporte({ items: {} }), reporte({ id: 5, items: null })]);
    abrir("/alertas");
    expect(await screen.findByText("Reporte semanal #4")).toBeTruthy();
    expect(screen.getByText("Reporte semanal #5")).toBeTruthy();
  });

  it("si el bot rechaza el reporte muestra el motivo", async () => {
    api.enviarReporte.mockRejectedValue(new Error("Tu sesión expiró. Vuelve a iniciar sesión."));
    abrir("/alertas");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar reporte ahora" }));
    expect(await screen.findByText("Tu sesión expiró. Vuelve a iniciar sesión.")).toBeTruthy();
  });
});

describe("navegación", () => {
  it("las pestañas cambian de pantalla y 'Cerrar sesión' cierra la sesión", async () => {
    abrir();
    await screen.findByText("P003");
    fireEvent.click(screen.getByRole("link", { name: "Movimientos" }));
    expect(await screen.findByText("Todavía no hay movimientos.")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Historial de alertas" }));
    expect(await screen.findByRole("heading", { name: "Historial de alertas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(api.cerrarSesion).toHaveBeenCalled());
  });
});
