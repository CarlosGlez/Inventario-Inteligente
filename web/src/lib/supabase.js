// Conexión con Supabase. Los dos datos salen de web/.env.local (ver .env.example).
// La clave que va aquí es la PÚBLICA: por sí sola no deja leer ni escribir nada,
// porque la base exige una sesión iniciada (RLS). La llave maestra nunca va aquí.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_KEY;

export const configurado = Boolean(url && clave);
export const supabase = configurado ? createClient(url, clave) : null;
