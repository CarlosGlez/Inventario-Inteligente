# Plan de ampliación Equipo 4

Rama: `feature/ampliacion-equipo4`  
Estado: implementación parcial en la rama; verificación runtime bloqueada por ausencia de Node/npm, Python y servicio PostgreSQL/Docker activo.

## Checklist

- [x] Auditar estructura, stack, tablas, pronóstico, autenticación, alertas y scheduler.
- [x] Comprobar estado de Git y crear rama de trabajo.
- [x] Intentar las pruebas heredadas y registrar bloqueos del entorno.
- [x] Registrar auditoría inicial y decisiones de compatibilidad.
- [x] Fase 1: documentar arquitectura/ER y enlazar documentación desde README.
- [x] Fase 2: implementar ventas clasificadas, modelos, datos sintéticos, backtest y vista; falta ejecutar pruebas/evaluación.
- [x] Fase 3: registrar evidencia SMTP, deduplicar órdenes y configurar backoff; falta envío real y webhook de entrega.
- [x] Fase 4: implementar proveedores, borradores, aprobación por correo, recepción y salida imprimible PDF; falta medir lead time real.
- [x] Fase 5: implementar roles/RLS/RPC, alta/administración y seed demo; falta probar en Supabase real.
- [ ] Fase 6: integración Sheets/Teams opcional, no seleccionada en esta entrega.
- [x] Fase 7: documentación de entrega y pruebas añadidas; ejecución, cobertura y resultados medidos pendientes.

## Orden de implementación

1. Completar documentación de arquitectura existente y declarar qué servicios remotos requieren configuración externa.
2. Diseñar migraciones aditivas primero, protegiendo registros existentes; mantener las pruebas SQL como guía de comportamiento.
3. Construir el módulo de pronóstico y su generador/evaluador reproducibles antes de conectar el modelo seleccionado a alertas y UI.
4. Añadir proveedores, órdenes y evidencia como extensiones del flujo actual de alertas.
5. Añadir permisos por rol en Postgres/RPC (la UI será complemento, no frontera de seguridad).
6. Preparar datos demo y recorrido de evaluación; escoger Sheets o Teams según la solución que requiera menos cambios y secretos.
7. Ejecutar las pruebas/build/lint disponibles, generar resultados mediante scripts y actualizar documentación de entrega.

## Restricciones de entrega

- No cambiar framework ni base de datos.
- No incluir secretos en código, ejemplos ejecutables ni commits.
- Mantener el modo demo identificable y protegido de correos a terceros.
- Distinguir métricas sintéticas, respuestas SMTP y entregas confirmadas.
- No declarar pruebas/cobertura como exitosas hasta ejecutarlas.
