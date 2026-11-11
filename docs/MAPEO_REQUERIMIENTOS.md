# Mapeo de requerimientos

Estado al 2026-11-11. “Parcial” indica que existe implementación, pero faltan verificaciones externas o subrequisitos.

| Requisito | Estado | Implementación/archivos | Cómo verificar |
|---|---|---|---|
| Línea 1: arquitectura y stack | Completo en documentación | `docs/ARQUITECTURA.md`, `docs/AUDITORIA_INICIAL.md`, `README.md` | Revisar los diagramas Mermaid y comparar versiones con `web/package.json` |
| Línea 2: pronóstico medido | Parcial | `web/src/lib/pronostico-avanzado.js`, `scripts/generar_datos_sinteticos.py`, `scripts/evaluar_pronostico.py`, `web/tests/pronostico-avanzado.test.js` | `npm test`; `python scripts/evaluar_pronostico.py`; revisar `docs/EVALUACION_PRONOSTICO.md` generado |
| Línea 3: correo real y evidencia | Parcial | `supabase/functions/revisar-inventario/{correo,smtp,entrega,index}.ts`, migraciones 0008/0009, `web/src/paginas/Alertas.jsx`, `docs/CONFIGURAR_CORREO.md`, `docs/EVIDENCIA_ALERTAS.md` | Configurar secrets; ejecutar `scripts/probar_correo.ps1 -AlertaId ID`; comprobar ID SMTP y estado enviado. Falta webhook y tres envíos reales |
| Línea 4: integración Sheets/Teams | No implementada | No se añadió servicio externo opcional | Seleccionar Teams o Sheets y configurar endpoint/API cuando exista tiempo/credenciales |
| Línea 5: roles y demo | Parcial | `supabase/migrations/0008_proveedores_compras_roles.sql`, Edge Function `revisar-inventario/usuarios`, `web/src/paginas/Usuarios.jsx`, `web/scripts/seed-demo.js`, `supabase/tests/roles_local.sql`, `web/tests/bot.test.js` | `npm test` incluye 403 por rol; SQL local comprueba 42501 en RPC. Falta ejecutar en esta sesión y validar seed en Supabase |
| Acción A: alerta al proveedor | Parcial | `proveedores`, `proveedor_productos`, `preparar_correo_orden`, ruta `revisar-inventario/ordenes/enviar` | Registrar proveedor y mapeo; generar borrador; en entorno privado aprobar envío y verificar ID SMTP. Falta evidencia real y webhook |
| Acción B: temporalidades | Parcial | Modelo estacional por día de semana/mes en `pronostico-avanzado.js`; generador con patrones temporales | Ejecutar backtest con datos sintéticos y comparar tabla; el scheduler SQL usa ponderación/fallback y no replica todavía selección estacional |
| Acción C: mejorar pronóstico | Parcial | baseline/ponderado/exponencial/estacional; backtest; gráfico por producto | `npm test` y `python scripts/evaluar_pronostico.py` |
| Acción D: órdenes de compra | Parcial | tablas/RPCs `0008`/`0010`; páginas `Proveedores.jsx`, `Ordenes.jsx`; envío proveedor Edge Function | Crear borrador, mandar manualmente (modo privado), imprimir a PDF y recibir línea; falta medir lead time real y completar prueba integral |
| Acción E: ventas en pronóstico | Parcial | `movements.motivo`, vista `ventas_diarias_365d`, selector de motivo y seed sintético | Registrar una salida como venta y revisar la serie/selección del producto |

## Limitaciones de evidencia

No se ejecutaron pruebas porque este entorno carece de Node/npm e intérprete Python disponible. No se afirma cobertura ni mejora cuantitativa hasta ejecutar los scripts. No hay credenciales SMTP; no se inventan IDs o entregas reales.
