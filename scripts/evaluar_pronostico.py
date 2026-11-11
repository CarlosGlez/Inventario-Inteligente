"""Backtest walk-forward reproducible; solo usa la biblioteca estándar."""
import csv
import math
import subprocess
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSV = ROOT / "ventas_sinteticas.csv"
DOC = Path(__file__).resolve().parents[1] / "docs" / "EVALUACION_PRONOSTICO.md"
HORIZONTE = 14
ORIGENES = (180, 220, 260, 300, 330)


def cargar():
    if not CSV.exists(): subprocess.run([sys.executable, str(ROOT / "generar_datos_sinteticos.py")], check=True)
    datos = defaultdict(dict)
    with CSV.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f): datos[r["product_code"]][date.fromisoformat(r["fecha"])] = max(0, int(r["cantidad"]))
    return datos


def serie(valores, inicio, fin):
    return [valores.get(inicio + timedelta(days=i), 0) for i in range((fin - inicio).days + 1)]


def baseline(s):
    ventana = s[-30:]
    positivos = [i for i, x in enumerate(ventana) if x > 0]
    return sum(ventana) / max(1, len(ventana) - 1 - positivos[0]) if positivos else 0.0


def ponderado(s):
    x = s[-28:]
    return sum(v * (i + 1) for i, v in enumerate(x)) / max(1, len(x) * (len(x) + 1) / 2)


def exponencial(s):
    if not s: return 0.0
    nivel = float(s[0])
    for x in s[1:]: nivel = .25 * x + .75 * nivel
    return nivel


def estacional(s, fecha, horizonte):
    nivel = sum(s[-84:]) / max(1, len(s[-84:]))
    if len(s) < 56 or nivel == 0: return [nivel] * horizonte
    base = s[-365:]
    media = sum(base) / max(1, len(base))
    semana = []
    for wd in range(7):
        xs = [v for i, v in enumerate(base) if (fecha - timedelta(days=len(base) - i)).weekday() == wd]
        semana.append(min(2, max(.5, (sum(xs) / len(xs) / media))) if xs and media else 1)
    meses = {}
    for month in range(1, 13):
        xs = [v for i, v in enumerate(base) if (fecha - timedelta(days=len(base) - i)).month == month]
        if len(xs) >= 3 and media: meses[month] = min(1.8, max(.6, sum(xs) / len(xs) / media))
    return [max(0, nivel * semana[(fecha + timedelta(days=i)).weekday()] * meses.get((fecha + timedelta(days=i)).month, 1)) for i in range(horizonte)]


MODELOS = {"baseline30": lambda s, f: [baseline(s)] * HORIZONTE,
           "ponderado": lambda s, f: [ponderado(s)] * HORIZONTE,
           "exponencial": lambda s, f: [exponencial(s)] * HORIZONTE,
           "estacional": lambda s, f: estacional(s, f, HORIZONTE)}


def metricas(real, pred):
    errores = [p - r for r, p in zip(real, pred)]
    mae = sum(abs(e) for e in errores) / len(errores)
    rmse = math.sqrt(sum(e * e for e in errores) / len(errores))
    smape = 200 * sum(abs(p-r) / (abs(p)+abs(r)) if p or r else 0 for r, p in zip(real, pred)) / len(real)
    wape = 100 * sum(abs(e) for e in errores) / max(1, sum(real))
    sesgo = sum(errores) / len(errores)
    return [mae, rmse, smape, wape, sesgo]


def svg(datos):
    nombres = list(MODELOS)
    maximo = max((r[0] for r in datos.values()), default=1) or 1
    colores = ["#64748b", "#2563eb", "#d97706", "#15803d"]
    barras = []
    for i, nombre in enumerate(nombres):
        x, ancho = 80, 480 * datos[nombre][0] / maximo
        y = 35 + i * 48
        barras.append(f'<text x="8" y="{y+17}" font-size="13">{nombre}</text><rect x="80" y="{y}" width="{ancho:.1f}" height="26" fill="{colores[i]}"/><text x="{90+ancho:.1f}" y="{y+18}" font-size="12">MAE {datos[nombre][0]:.2f}</text>')
    return '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="250" viewBox="0 0 720 250"><rect width="100%" height="100%" fill="white"/><text x="8" y="20" font-size="14">MAE agregado por modelo (menor es mejor)</text>' + ''.join(barras) + '</svg>'


def main():
    datos = cargar()
    inicios = [date(2025, 1, 1)]
    totales = {nombre: [0.0] * 5 for nombre in MODELOS}
    cuenta = 0
    no_anticipados = {nombre: 0 for nombre in MODELOS if nombre != "baseline30"}
    for ventas in datos.values():
        for origen in ORIGENES:
            fecha = date(2025, 1, 1) + timedelta(days=origen)
            hist = serie(ventas, inicios[0], fecha - timedelta(days=1))
            real = serie(ventas, fecha, fecha + timedelta(days=HORIZONTE - 1))
            preds = {n: fn(hist, fecha) for n, fn in MODELOS.items()}
            for nombre, pred in preds.items():
                for i, x in enumerate(metricas(real, pred)): totales[nombre][i] += x
            base_pred = preds["baseline30"]
            stock = max(1, round(sum(base_pred[:7]) * 1.2))
            if sum(real[:7]) > stock and sum(base_pred[:7]) <= stock:
                for nombre in no_anticipados:
                    if sum(preds[nombre][:7]) > stock: no_anticipados[nombre] += 1
            cuenta += 1
    resultado = {n: [x / cuenta for x in values] for n, values in totales.items()}
    filas = []
    for n, m in resultado.items():
        mejora = 100 * (resultado["baseline30"][0] - m[0]) / max(1e-9, resultado["baseline30"][0])
        filas.append(f"| {n} | {m[0]:.3f} | {m[1]:.3f} | {m[2]:.2f}% | {m[3]:.2f}% | {m[4]:+.3f} | {mejora:+.2f}% | {no_anticipados.get(n, '—')} |")
    DOC.parent.mkdir(exist_ok=True)
    (DOC.parent / "pronostico_mae.svg").write_text(svg(resultado), encoding="utf-8")
    DOC.write_text("""# Evaluación reproducible del pronóstico

## Datos y método

Datos completamente sintéticos: 18 productos, 365 días, semilla 4172026. Incluyen patrones estables, tendencia, día de semana, temporada de fin de año, demanda intermitente y picos. No representan ventas reales. Se usa validación temporal walk-forward con cinco orígenes por producto y horizonte de 14 días; ningún origen entrena con fechas futuras. Ejecutar `python scripts/evaluar_pronostico.py` para regenerar tabla y gráfica.

## Resultados agregados

| Modelo | MAE (u./día) | RMSE | sMAPE | WAPE | Sesgo | Mejora MAE vs baseline | Desabastos adicionales anticipados* |
|---|---:|---:|---:|---:|---:|---:|---:|
""" + "\n".join(filas) + """

![Comparación de MAE](pronostico_mae.svg)

*Se cuentan episodios sintéticos donde el baseline no pronostica agotamiento en 7 días para el stock de referencia definido por el script, pero sí lo detecta el modelo evaluado. Es una simulación acotada y no una tasa real de desabasto.

La selección automática por producto debe evaluarse por separado en la aplicación; el ganador global de esta tabla no se presupone como el mejor para todos los productos. Los datos sintéticos pueden favorecer a los modelos que conocen los patrones generadores; los resultados no prueban una mejora en ventas reales.
""", encoding="utf-8")
    print(f"Evaluados {len(datos)} productos, {cuenta} ventanas. Resultado: {DOC}")


if __name__ == "__main__": main()
