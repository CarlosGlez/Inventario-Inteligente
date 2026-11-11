# Guion de demo de 5 minutos

La demostración debe usar un proyecto Supabase dedicado con migraciones aplicadas, seed demo y `DEMO_MODE=true`. Las cuentas son ficticias; el seed genera contraseñas nuevas y las imprime una sola vez.

1. **0:00–0:45 — Roles:** inicia con `admin-demo`, muestra el panel, las pestañas de Proveedores/Órdenes/Usuarios y asigna un rol. Inicia sesión en otra ventana como `consulta-demo` y muestra solo lectura.
2. **0:45–1:40 — Inventario y ventas:** abre un producto, registra una salida como Venta y luego muestra el historial con motivo; explica que salidas viejas quedan sin clasificar.
3. **1:40–2:40 — Pronóstico:** muestra modelo elegido, demanda diaria, confianza, intervalo, fecha estimada y sparkline. Aclara que el seed es sintético. Ejecuta el backtest fuera del navegador y muestra la tabla generada.
4. **2:40–3:35 — Alertas:** abre la alerta demo, muestra `simulado`, destinatario seguro, contador y exportación CSV. Describe cómo una prueba privada con SMTP obtiene ID de mensaje.
5. **3:35–4:35 — Compras:** crea borradores desde la alerta, revisa proveedor/líneas y registra una recepción parcial; confirma que cambia el stock.
6. **4:35–5:00 — Cierre:** muestra arquitectura, mapeo de requisitos y resultados. Distingue explícitamente aceptación SMTP de entrega confirmada.

No presentes la tasa de mejora, cobertura o correos reales hasta que `docs/RESULTADOS.md` contenga salidas generadas tras las ejecuciones correspondientes.
