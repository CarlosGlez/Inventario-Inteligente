// Pruebas del bot (la Edge Function). La lógica vive en archivos sin red ni
// Deno, así que aquí se prueba con dependencias falsas.
import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import { configCorreo } from "../../supabase/functions/revisar-inventario/correo.ts";
import {
  entregarAlerta,
  esLlamadaPermitida,
  manejar,
  revisar,
} from "../../supabase/functions/revisar-inventario/entrega.ts";
import { enviarCorreo } from "../../supabase/functions/revisar-inventario/smtp.ts";

const COMPLETO = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "equipo@escuela.mx",
  SMTP_PASSWORD: "clave-de-aplicacion",
  SMTP_FROM: "equipo@escuela.mx",
  ALERT_TO: "almacen@escuela.mx",
};

const ALERTA = { id: 7, subject: "Alerta de inventario: 1 producto(s) con stock bajo", body: "Cuerpo del correo" };

// Dependencias falsas: una base de datos de mentira que recuerda los estados.
function depsFalsos(cambios = {}) {
  const estados = new Map([[7, "pendiente"], [3, "pendiente"]]);
  return {
    env: {},
    reclamar: vi.fn(async (id) => {
      if (!["pendiente", "error"].includes(estados.get(id))) return null;
      estados.set(id, "enviando");
      return { ...ALERTA, id };
    }),
    estadoActual: vi.fn(async (id) => estados.get(id) ?? null),
    cerrar: vi.fn(async (id, status) => { estados.set(id, status); }),
    enviar: vi.fn(async () => {}),
    crearAlerta: vi.fn(async () => null),
    pendientes: vi.fn(async () => []),
    cronSecret: "secreto-del-cron",
    validarToken: vi.fn(async (token) => token === "token-valido"),
    ...cambios,
  };
}

describe("configCorreo", () => {
  it("sin ningún secret SMTP entra en modo demostración", () => {
    expect(configCorreo({})).toEqual({ modo: "demo" });
    expect(configCorreo({ SMTP_HOST: "  ", SMTP_PORT: "465" })).toEqual({ modo: "demo" });
  });

  it("con secrets incompletos dice cuáles faltan", () => {
    expect(() => configCorreo({ SMTP_HOST: "smtp.example.org" }))
      .toThrow("Configuración SMTP incompleta: faltan SMTP_USER, SMTP_PASSWORD, SMTP_FROM, ALERT_TO.");
  });

  it("con todo completo usa el puerto 465 por defecto", () => {
    expect(configCorreo(COMPLETO)).toEqual({
      modo: "smtp", host: "smtp.gmail.com", port: 465, user: "equipo@escuela.mx",
      password: "clave-de-aplicacion", from: "equipo@escuela.mx", to: "almacen@escuela.mx",
    });
  });

  it("rechaza los puertos que Supabase bloquea", () => {
    expect(() => configCorreo({ ...COMPLETO, SMTP_PORT: "587" }))
      .toThrow("El puerto 587 está bloqueado en las Edge Functions de Supabase. Usa SMTP_PORT=465.");
    expect(() => configCorreo({ ...COMPLETO, SMTP_PORT: "25" })).toThrow(/puerto 25 está bloqueado/);
  });

  it("rechaza un puerto que no es número", () => {
    expect(() => configCorreo({ ...COMPLETO, SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
  });
});

describe("entregarAlerta", () => {
  it("sin secrets marca la alerta como simulada y no envía nada", async () => {
    const deps = depsFalsos();
    expect(await entregarAlerta(deps, 7)).toBe("simulado");
    expect(deps.cerrar).toHaveBeenCalledWith(7, "simulado", null);
    expect(deps.enviar).not.toHaveBeenCalled();
  });

  it("con secrets incompletos deja la alerta en error con el motivo", async () => {
    const deps = depsFalsos({ env: { SMTP_HOST: "smtp.example.org" } });
    expect(await entregarAlerta(deps, 7)).toBe("error");
    expect(deps.cerrar).toHaveBeenCalledWith(7, "error", expect.stringContaining("SMTP_USER"));
    expect(deps.enviar).not.toHaveBeenCalled();
  });

  it("si el envío falla deja la alerta en error, no en enviando", async () => {
    const deps = depsFalsos({ env: COMPLETO, enviar: vi.fn(async () => { throw new Error("Connection timeout"); }) });
    expect(await entregarAlerta(deps, 7)).toBe("error");
    expect(deps.cerrar).toHaveBeenCalledWith(7, "error", "Connection timeout");
    expect(await deps.estadoActual(7)).toBe("error");
  });

  it("si el envío sale bien manda el asunto y el cuerpo guardados", async () => {
    const deps = depsFalsos({ env: COMPLETO });
    expect(await entregarAlerta(deps, 7)).toBe("enviado");
    expect(deps.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ modo: "smtp", to: "almacen@escuela.mx" }),
      { subject: ALERTA.subject, body: ALERTA.body },
    );
    expect(deps.cerrar).toHaveBeenCalledWith(7, "enviado", null);
  });

  it("si otro proceso ya la está enviando, no envía y devuelve el estado actual", async () => {
    const deps = depsFalsos({ env: COMPLETO });
    await deps.reclamar(7); // otro proceso la tomó
    deps.reclamar.mockClear();
    expect(await entregarAlerta(deps, 7)).toBe("enviando");
    expect(deps.enviar).not.toHaveBeenCalled();
    expect(deps.cerrar).not.toHaveBeenCalled();
  });

  it("si la alerta no existe lo dice", async () => {
    await expect(entregarAlerta(depsFalsos(), 99)).rejects.toThrow("La alerta no existe.");
  });
});

describe("revisar", () => {
  it("envía la alerta nueva y las que se quedaron pendientes", async () => {
    const deps = depsFalsos({ crearAlerta: vi.fn(async () => 7), pendientes: vi.fn(async () => [3, 7]) });
    expect(await revisar(deps)).toEqual({
      alert_id: 7, status: "simulado", otras: [{ alert_id: 3, status: "simulado" }],
    });
  });

  it("sin episodios nuevos no hace nada", async () => {
    const deps = depsFalsos();
    expect(await revisar(deps)).toEqual({ alert_id: null, status: null, otras: [] });
    expect(deps.reclamar).not.toHaveBeenCalled();
  });

  it("si otra revisión ya tomó la alerta nueva, informa su estado actual", async () => {
    const deps = depsFalsos({ crearAlerta: vi.fn(async () => 7), pendientes: vi.fn(async () => []) });
    expect(await revisar(deps)).toEqual({ alert_id: 7, status: "pendiente", otras: [] });
  });
});

describe("esLlamadaPermitida", () => {
  const validarToken = async (token) => token === "token-valido";

  it("acepta al cron cuando el secreto coincide", async () => {
    expect(await esLlamadaPermitida({ secretoEsperado: "abc", secretoRecibido: "abc", validarToken })).toBe(true);
  });

  it("un secreto vacío nunca coincide con un encabezado vacío", async () => {
    expect(await esLlamadaPermitida({ secretoEsperado: "", secretoRecibido: "", validarToken })).toBe(false);
    expect(await esLlamadaPermitida({ secretoEsperado: undefined, secretoRecibido: null, validarToken })).toBe(false);
  });

  it("rechaza un secreto distinto sin sesión", async () => {
    expect(await esLlamadaPermitida({ secretoEsperado: "abc", secretoRecibido: "abd", validarToken })).toBe(false);
    expect(await esLlamadaPermitida({ secretoEsperado: "abc", secretoRecibido: "ab", validarToken })).toBe(false);
  });

  it("acepta a un usuario con sesión válida y rechaza una inválida", async () => {
    expect(await esLlamadaPermitida({ secretoEsperado: "abc", token: "token-valido", validarToken })).toBe(true);
    expect(await esLlamadaPermitida({ secretoEsperado: "abc", token: "otro", validarToken })).toBe(false);
  });
});

describe("manejar (la puerta de entrada HTTP)", () => {
  const URL_FN = "https://proyecto.supabase.co/functions/v1/revisar-inventario";
  const peticion = (opciones = {}) => new Request(URL_FN, { method: "POST", ...opciones });

  it("responde a la consulta previa del navegador (CORS)", async () => {
    const respuesta = await manejar(new Request(URL_FN, { method: "OPTIONS" }), depsFalsos());
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(respuesta.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
  });

  it("solo acepta POST", async () => {
    expect((await manejar(new Request(URL_FN, { method: "GET" }), depsFalsos())).status).toBe(405);
  });

  it("sin permiso responde 401 y no toca la base", async () => {
    const deps = depsFalsos();
    const respuesta = await manejar(peticion(), deps);
    expect(respuesta.status).toBe(401);
    expect(deps.crearAlerta).not.toHaveBeenCalled();
    const conMalSecreto = await manejar(peticion({ headers: { "x-cron-secret": "incorrecto" } }), deps);
    expect(conMalSecreto.status).toBe(401);
  });

  it("el cron con su secreto hace la revisión", async () => {
    const deps = depsFalsos();
    const respuesta = await manejar(peticion({ headers: { "x-cron-secret": "secreto-del-cron" }, body: "{}" }), deps);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ alert_id: null, status: null, otras: [] });
    expect(deps.crearAlerta).toHaveBeenCalledTimes(1);
  });

  it("un usuario con sesión puede reintentar una alerta", async () => {
    const deps = depsFalsos();
    const respuesta = await manejar(peticion({
      headers: { Authorization: "Bearer token-valido", "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: 7 }),
    }), deps);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ alert_id: 7, status: "simulado" });
    expect(deps.crearAlerta).not.toHaveBeenCalled();
    expect(respuesta.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("reintentar una alerta que no existe responde 404", async () => {
    const respuesta = await manejar(peticion({
      headers: { Authorization: "Bearer token-valido" }, body: JSON.stringify({ alert_id: 99 }),
    }), depsFalsos());
    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual({ error: "La alerta no existe." });
  });

  it("un alert_id que no es número responde 400", async () => {
    const respuesta = await manejar(peticion({
      headers: { Authorization: "Bearer token-valido" }, body: JSON.stringify({ alert_id: "abc" }),
    }), depsFalsos());
    expect(respuesta.status).toBe(400);
  });

  it("si la base falla responde 500 con el motivo", async () => {
    const deps = depsFalsos({ crearAlerta: vi.fn(async () => { throw new Error("la base no responde"); }) });
    const respuesta = await manejar(peticion({ headers: { "x-cron-secret": "secreto-del-cron" } }), deps);
    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toEqual({ error: "la base no responde" });
  });
});

describe("enviarCorreo", () => {
  it("si el servidor de correo no responde, corta el intento en vez de quedarse esperando", async () => {
    // Servidor que acepta la conexión y se queda callado, como un Gmail caído.
    const sockets = [];
    const servidor = net.createServer((socket) => { sockets.push(socket); });
    await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
    const config = { ...configCorreo(COMPLETO), host: "127.0.0.1", port: servidor.address().port };
    const inicio = Date.now();
    try {
      await expect(enviarCorreo(config, { subject: "Prueba", body: "Hola" }, { tiempoLimiteMs: 400 }))
        .rejects.toThrow();
      expect(Date.now() - inicio).toBeLessThan(5000);
    } finally {
      sockets.forEach((socket) => socket.destroy());
      servidor.close();
    }
  });
});
