import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormularioProducto from "../componentes/FormularioProducto.jsx";
import ImportarExcel from "../componentes/ImportarExcel.jsx";
import Pagina from "../componentes/Pagina.jsx";
import Prioridad from "../componentes/Prioridad.jsx";
import TablaProductos from "../componentes/TablaProductos.jsx";
import {
  cargarInventario, eliminarProducto, guardarProducto, importarProductos, registrarMovimiento, revisarAhora,
} from "../lib/api.js";
import { avisoRevision } from "../lib/avisos.js";
import { crearExcel, descargar, leerExcel, revisarArchivo } from "../lib/excel.js";
import { conPronostico, prioridadReabasto } from "../lib/pronostico.js";

const dos = (n) => String(n).padStart(2, "0");

// Pantalla principal: resumen, reabasto, alta, importación y tabla.
export default function Inventario() {
  const navegar = useNavigate();
  const [datos, setDatos] = useState(null);       // { productos, consumo, resumen }
  const [errorCarga, setErrorCarga] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await cargarInventario());
      setErrorCarga(null);
    } catch (motivo) {
      setErrorCarga(motivo.message);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // El pronóstico se calcula aquí, con los datos que entregó la base.
  const productos = useMemo(() => (datos ? conPronostico(datos.productos, datos.consumo) : []), [datos]);
  const prioridad = useMemo(() => prioridadReabasto(productos), [productos]);
  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [productos],
  );

  // Ejecuta una acción, muestra el resultado y recarga la lista.
  // Devuelve true si salió bien (los formularios lo usan para limpiarse).
  async function ejecutar(accion, textoExito) {
    setOcupado(true);
    try {
      const resultado = await accion();
      setAviso({ tipo: "success", texto: typeof textoExito === "function" ? textoExito(resultado) : textoExito });
      await cargar();
      return true;
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const alGuardar = (datosProducto) => ejecutar(() => guardarProducto(datosProducto, null), "Producto registrado.");
  const alEditar = (id, datosProducto) => ejecutar(() => guardarProducto(datosProducto, id), "Producto actualizado.");
  const alMover = (id, tipo, cantidad) => ejecutar(() => registrarMovimiento(id, tipo, cantidad), "Movimiento registrado.");

  function alEliminar(id) {
    if (!window.confirm("¿Eliminar este producto?")) return Promise.resolve(false);
    return ejecutar(() => eliminarProducto(id), "Producto eliminado. Su historial anterior se conserva.");
  }

  const alImportar = (archivo) => ejecutar(async () => {
    revisarArchivo(archivo);                                        // extensión y tamaño
    const items = await leerExcel(await archivo.arrayBuffer());     // valida todas las filas
    return importarProductos(items);                                // guarda todo o nada
  }, (cuantos) => `Importación completada: ${cuantos} producto(s) creados o actualizados.`);

  async function exportar() {
    setOcupado(true);
    try {
      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
      descargar(await crearExcel(datos.productos), `inventario_${fecha}.xlsx`);
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
    } finally {
      setOcupado(false);
    }
  }

  async function revisar() {
    setOcupado(true);
    try {
      const resultado = await revisarAhora();
      navegar("/alertas", { state: { aviso: avisoRevision(resultado) } });
    } catch (motivo) {
      setAviso({ tipo: "error", texto: motivo.message });
      setOcupado(false);
    }
  }

  if (!datos) {
    return (
      <Pagina resumen={null} aviso={errorCarga ? { tipo: "error", texto: errorCarga } : null}>
        {errorCarga
          ? <p><button type="button" className="primary" onClick={cargar}>Reintentar</button></p>
          : <p className="cargando">Cargando inventario…</p>}
      </Pagina>
    );
  }

  return (
    <Pagina resumen={datos.resumen} aviso={errorCarga ? { tipo: "error", texto: errorCarga } : aviso}>
      <div className="page-title">
        <div>
          <h2>Inventario</h2>
          <p>Los productos bajo el mínimo aparecen resaltados. El pronóstico usa las salidas de los últimos 30 días.</p>
        </div>
        <div className="title-actions">
          <button type="button" className="button" disabled={ocupado} onClick={exportar}>Exportar a Excel</button>
          <button type="button" className="primary" disabled={ocupado} onClick={revisar}>Revisar inventario ahora</button>
        </div>
      </div>

      <Prioridad prioridad={prioridad} />

      <div className="two-columns">
        <FormularioProducto categorias={categorias} ocupado={ocupado} onGuardar={alGuardar} />
        <ImportarExcel ocupado={ocupado} onImportar={alImportar} />
      </div>

      <TablaProductos productos={productos} categorias={categorias} ocupado={ocupado}
        onMovimiento={alMover} onEditar={alEditar} onEliminar={alEliminar} />
    </Pagina>
  );
}
