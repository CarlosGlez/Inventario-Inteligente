import Aviso from "./Aviso.jsx";
import Encabezado from "./Encabezado.jsx";
import Resumen from "./Resumen.jsx";

// Marco común de las tres pantallas: encabezado, resumen, aviso y pie.
export default function Pagina({ resumen, aviso, children }) {
  return (
    <>
      <Encabezado />
      <main className="wrap">
        <Resumen resumen={resumen} />
        <Aviso aviso={aviso} />
        {children}
      </main>
      <footer className="wrap">
        El bot revisa el inventario cada minuto en la nube, aunque esta página esté cerrada. Sin SMTP configurado, las alertas son simuladas.
      </footer>
    </>
  );
}
