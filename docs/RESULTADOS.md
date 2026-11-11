# Resultados de ampliación

## Métricas disponibles

| Métrica | Resultado actual | Evidencia |
|---|---|---|
| Mejora de MAE del pronóstico | Pendiente de ejecución | `python scripts/evaluar_pronostico.py` genera `docs/EVALUACION_PRONOSTICO.md` y `docs/pronostico_mae.svg` |
| Correos aceptados por SMTP | No medido | Requiere secrets SMTP y prueba privada |
| Entrega confirmada | No disponible | No hay webhook de proveedor; SMTP no confirma bandeja |
| Tiempo detección→envío | No medido | Se calcula de `alerts.created_at` y `sent_at` tras activar correo |
| Cobertura | No calculada | No hay proveedor de cobertura configurado en `package.json` |
| Pruebas web | 162/162 aprobadas (10 archivos) | `cd web && npm test -- --run` con Node 26.13.1 / Vitest 5.0.3 |
| Build web | Aprobado | `cd web && npm run build` con Vite 8.3.2 |
| Volumen de demo definido por seed | 18 productos, hasta 365 días sintéticos por producto, 1 proveedor, 1 alerta y 1 orden | `web/scripts/seed-demo.js`; aún no ejecutado contra Supabase |

La evaluación walk-forward de pronóstico no se ejecutó porque Python no está disponible; no se publican cifras estimadas como resultados medidos. El dataset sintético usa semilla 4172026 y se identifica como sintético. Las pruebas SQL tampoco se ejecutaron porque Docker daemon/Supabase local no están activos. El build generó `web/dist/`, que es un artefacto local ignorado por Git.
