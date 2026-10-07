import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);

// Configuración de Vite (el servidor de desarrollo) y de Vitest (las pruebas).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // La Edge Function importa nodemailer al estilo Deno ("npm:nodemailer@10").
    // Las pruebas del bot usan el mismo paquete, instalado aquí con npm.
    alias: { "npm:nodemailer@10": require.resolve("nodemailer") },
  },
  build: {
    // La librería de Excel pesa cerca de 1 MB; se descarga aparte y solo al
    // importar o exportar. Se sube el límite para que Vite no lo marque como aviso.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    // Las pruebas de pantallas piden un navegador simulado (jsdom) en su primera línea.
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
