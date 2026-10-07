import { useEffect, useRef } from "react";

// Mensaje de resultado: verde (success), rojo (error) o azul (info).
export default function Aviso({ aviso }) {
  const caja = useRef(null);

  // El aviso aparece arriba, pero la acción pudo hacerse muy abajo en la tabla.
  // Cada vez que cambia, la página se desplaza para que quede a la vista.
  useEffect(() => {
    if (aviso) caja.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [aviso]);

  if (!aviso) return null;
  return <div ref={caja} className={`notice ${aviso.tipo}`} role="alert">{aviso.texto}</div>;
}
