"""Genera ventas sintéticas reproducibles (18 productos, un año, semilla fija)."""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 4172026
PRODUCTOS = 18
DIAS = 365
SALIDA = Path(__file__).resolve().parent / "ventas_sinteticas.csv"


def generar():
    rng = random.Random(SEED)
    inicio = date(2025, 1, 1)
    with SALIDA.open("w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["fecha", "product_code", "cantidad", "sintetico"])
        for pid in range(1, PRODUCTOS + 1):
            patron = (pid - 1) % 6
            base = 2 + pid % 8
            for indice in range(DIAS):
                dia = inicio + timedelta(days=indice)
                semanal = 1.0 + (0.45 if dia.weekday() == 5 else 0.25 if dia.weekday() == 6 else 0)
                temporada = 1.0 + (0.8 if dia.month in (11, 12) else 0.25 if dia.month in (6, 7) else 0)
                if patron == 0: factor = 1
                elif patron == 1: factor = 0.55 + indice / DIAS
                elif patron == 2: factor = semanal
                elif patron == 3: factor = temporada
                elif patron == 4: factor = 1.0 if rng.random() < 0.16 else 0.0
                else: factor = 2.2 if indice % 47 in (0, 1, 2) else 1.0
                cantidad = max(0, round(rng.gauss(base * factor, max(0.6, base * 0.28))))
                escritor.writerow([dia.isoformat(), f"P{pid:02}", cantidad, "true"])
    return SALIDA


if __name__ == "__main__":
    print(generar())
