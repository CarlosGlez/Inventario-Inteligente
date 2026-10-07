import { describe, expect, it } from "vitest";
import { avisoReintento, avisoRevision, puedeReintentar } from "../src/lib/avisos.js";
import { mensajeError } from "../src/lib/errores.js";

describe("avisoRevision", () => {
  it("sin episodios nuevos", () => {
    expect(avisoRevision({ alert_id: null, status: null, otras: [] }))
      .toEqual({ tipo: "success", texto: "Revisión completa. No hay episodios nuevos de stock bajo." });
  });
  it("alerta simulada", () => {
    expect(avisoRevision({ alert_id: 4, status: "simulado" }))
      .toEqual({ tipo: "info", texto: "Alerta simulada y guardada. No se envió ningún correo real." });
  });
  it("alerta enviada", () => {
    expect(avisoRevision({ alert_id: 4, status: "enviado" }))
      .toEqual({ tipo: "success", texto: "Alerta enviada por correo y guardada." });
  });
  it("falló el correo", () => {
    expect(avisoRevision({ alert_id: 4, status: "error" }))
      .toEqual({ tipo: "error", texto: "La alerta se guardó, pero falló el correo. Puedes reintentar en Historial de alertas." });
  });
});

describe("avisoReintento", () => {
  it("usa los mismos textos que la versión anterior", () => {
    expect(avisoReintento("simulado")).toEqual({ tipo: "info", texto: "Reintento: correo simulado; no se envió realmente." });
    expect(avisoReintento("enviado")).toEqual({ tipo: "info", texto: "Reintento: correo enviado." });
    expect(avisoReintento("error")).toEqual({ tipo: "error", texto: "Reintento: el envío volvió a fallar." });
    expect(avisoReintento("enviando")).toEqual({ tipo: "info", texto: "Reintento: enviando." });
  });
});

describe("puedeReintentar", () => {
  const ahora = new Date("2026-10-05T12:00:00Z");
  const hace = (minutos) => new Date(ahora.getTime() - minutos * 60000).toISOString();

  it("siempre se puede reintentar una alerta con error", () => {
    expect(puedeReintentar({ status: "error", last_attempt_at: hace(0) }, ahora)).toBe(true);
  });
  it("una alerta enviada o simulada no se reintenta", () => {
    expect(puedeReintentar({ status: "enviado", last_attempt_at: hace(60) }, ahora)).toBe(false);
    expect(puedeReintentar({ status: "simulado", last_attempt_at: hace(60) }, ahora)).toBe(false);
  });
  it("una alerta atorada más de 5 minutos se puede reintentar", () => {
    expect(puedeReintentar({ status: "enviando", last_attempt_at: hace(6) }, ahora)).toBe(true);
    expect(puedeReintentar({ status: "enviando", last_attempt_at: hace(4) }, ahora)).toBe(false);
    expect(puedeReintentar({ status: "pendiente", created_at: hace(6), last_attempt_at: null }, ahora)).toBe(true);
    expect(puedeReintentar({ status: "pendiente", created_at: hace(1), last_attempt_at: null }, ahora)).toBe(false);
  });
});

describe("mensajeError para el bot", () => {
  it("la función todavía no está desplegada", () => {
    expect(mensajeError({ status: 404, message: "Edge Function returned a non-2xx status code" }))
      .toBe("La función revisar-inventario todavía no está desplegada en Supabase. Revisa el paso 4 del README.");
  });
  it("una alerta inexistente conserva su mensaje", () => {
    expect(mensajeError({ status: 404, message: "La alerta no existe." })).toBe("La alerta no existe.");
  });
  it("sin conexión al llamar a la función", () => {
    expect(mensajeError({ message: "Failed to send a request to the Edge Function" }))
      .toBe("No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.");
  });
});
