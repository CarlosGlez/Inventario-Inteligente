import { describe, expect, it } from "vitest";
import { mensajeError } from "../src/lib/errores.js";
import { fechaLocal } from "../src/lib/fechas.js";

describe("mensajeError", () => {
  it("código repetido", () => {
    expect(mensajeError({ code: "23505", message: 'duplicate key value violates unique constraint "products_codigo_key"' }))
      .toBe("Ese código ya existe. Usa otro código o edita el producto existente.");
  });

  it("sesión vencida", () => {
    const esperado = "Tu sesión expiró. Vuelve a iniciar sesión.";
    expect(mensajeError({ code: "PGRST301", message: "JWT expired" })).toBe(esperado);
    expect(mensajeError({ status: 401, message: "No autorizado." })).toBe(esperado);
  });

  it("sin internet", () => {
    const esperado = "No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.";
    expect(mensajeError(new TypeError("Failed to fetch"))).toBe(esperado);
    expect(mensajeError({ message: "TypeError: NetworkError when attempting to fetch resource." })).toBe(esperado);
  });

  it("los errores de nuestras funciones se muestran tal cual", () => {
    expect(mensajeError({ code: "P0001", message: "La salida supera el stock disponible; el inventario no puede quedar negativo." }))
      .toBe("La salida supera el stock disponible; el inventario no puede quedar negativo.");
    expect(mensajeError(new Error("costo: este campo es obligatorio."))).toBe("costo: este campo es obligatorio.");
  });

  it("traduce los errores crudos de la base", () => {
    expect(mensajeError({ code: "22003", message: "numeric field overflow" })).toBe("El número es demasiado grande.");
    expect(mensajeError({ code: "42501", message: "permission denied for table movements" }))
      .toBe("No tienes permiso para hacer esto.");
    expect(mensajeError({ code: "23514", message: 'violates check constraint "products_stock_actual_check"' }))
      .toBe("Algún dato no cumple las reglas del inventario: sin negativos y textos de 1 a 120 caracteres.");
  });

  it("credenciales incorrectas al iniciar sesión", () => {
    expect(mensajeError({ code: "invalid_credentials", message: "Invalid login credentials" }))
      .toBe("Correo o contraseña incorrectos.");
  });

  it("nunca devuelve vacío", () => {
    expect(mensajeError(null)).toBe("Ocurrió un error inesperado.");
    expect(mensajeError({})).toBe("Ocurrió un error inesperado.");
  });
});

describe("fechaLocal", () => {
  it("muestra fecha y hora local con el formato de siempre", () => {
    const d = new Date(2026, 9, 5, 13, 39, 59); // 5 de octubre de 2026, hora local
    expect(fechaLocal(d.toISOString())).toBe("2026-10-05 13:39:59");
  });

  it("devuelve vacío cuando no hay fecha", () => {
    expect(fechaLocal(null)).toBe("");
    expect(fechaLocal("")).toBe("");
  });
});
