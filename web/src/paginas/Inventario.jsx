import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormularioProducto from "../componentes/FormularioProducto.jsx";
import ImportarExcel from "../componentes/ImportarExcel.jsx";
import Pagina from "../componentes/Pagina.jsx";
import Prioridad from "../componentes/Prioridad.jsx";
import TablaProductos from "../componentes/TablaProductos.jsx";
import {
  cargarInventario, eliminarProducto, eliminarTodosProductos, guardarProducto, importarProductos, registrarMovimiento, revisarAhora,
} from "../lib/api.js";
import { avisoRevision } from "../lib/avisos.js";
import { crearExcel, descargar, leerExcel, revisarArchivo } from "../lib/excel.js";
import { conPronostico, prioridadReabasto } from "../lib/pronostico.js";
import { pronosticoProducto } from "../lib/pronostico-avanzado.js";
import { usePerfil } from "../lib/perfil.jsx";

const dos = (n) => String(n).padStart(2, "0");

// Pantalla principal: resumen, reabasto, alta, importación y tabla.
export default function Inventario() {
  const perfil = usePerfil();
  const puedeEditar = perfil.role === "admin" || perfil.role === "almacen";
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
  const productos = useMemo(() => {
    if (!datos) return [];
    const baselines = conPronostico(datos.productos, datos.consumo);
    return baselines.map((p) => {
      const avanzado = pronosticoProducto(p, (datos.ventas ?? []).filter((v) => v.product_code === p.codigo), new Date(), 14, p.consumo_diario);
      const diario = avanzado.demanda_diaria_esperada;
      const dias = diario > 0 ? Math.floor(p.stock_actual / diario) : null;
      const sugerido = Math.max(p.stock_minimo - p.stock_actual, Math.ceil(diario * 14) - p.stock_actual, 0);
      return {
        ...p, ...avanzado, consumo_diario: diario > 0 ? diario : null, dias_restantes: dias,
        sugerido, costo_sugerido: Math.round(sugerido * Number(p.costo) * 100) / 100,
        urgente: p.bajo || (dias !== null && dias <= 7),
      };
    });
  }, [datos]);
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
  const alMover = (id, tipo, cantidad, motivo) => ejecutar(() => registrarMovimiento(id, tipo, cantidad, motivo), "Movimiento registrado.");

  function alEliminar(id) {
    if (!window.confirm("¿Eliminar este producto?")) return Promise.resolve(false);
    return ejecutar(() => eliminarProducto(id), "Producto eliminado. Su historial anterior se conserva.");
  }

  function borrarTodos() {
    const cantidadProductos = datos?.productos.length ?? 0;
    if (!cantidadProductos || perfil.role !== "admin") return;
    if (!window.confirm(`Vas a eliminar los ${cantidadProductos} productos del inventario. Se conservarán los movimientos y las líneas históricas de órdenes. ¿Deseas continuar?`)) return;
    if (window.prompt(`Confirmación final: escribe ELIMINAR para borrar los ${cantidadProductos} productos.`)?.trim() !== "ELIMINAR") {
      setAviso({ tipo: "info", texto: "No se borraron productos; la confirmación no coincidió." });
      return;
    }
    ejecutar(eliminarTodosProductos, (total) => `Se eliminaron ${total} productos. Los movimientos y las líneas históricas de órdenes se conservaron.`);
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
          <p>Las salidas marcadas como venta alimentan la selección automática del pronóstico. Las salidas históricas sin clasificar permanecen en el baseline heredado.</p>
        </div>
      <div className="title-actions">
          <button type="button" className="button" disabled={ocupado} onClick={exportar}>Exportar a Excel</button>
          {perfil.role !== "consulta" && <button type="button" className="primary" disabled={ocupado} onClick={revisar}>Revisar inventario ahora</button>}
          {perfil.role === "admin" && <button type="button" className="danger" disabled={ocupado || productos.length === 0} onClick={borrarTodos}>Borrar todos los productos</button>}
        </div>
      </div>

      <Prioridad prioridad={prioridad} />

      {puedeEditar && <div className="two-columns">
        <FormularioProducto categorias={categorias} ocupado={ocupado} onGuardar={alGuardar} />
        <ImportarExcel ocupado={ocupado} onImportar={alImportar} />
      </div>}

      <TablaProductos productos={productos} categorias={categorias} ocupado={ocupado} puedeEditar={puedeEditar} puedeEliminar={perfil.role === "admin"}
        onMovimiento={alMover} onEditar={alEditar} onEliminar={alEliminar} />
    </Pagina>
  );
}
