"""Pruebas de migrar_sqlite.py. Ejecutar: python -m unittest herramientas/test_migrar.py"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrar_sqlite import generar_sql  # noqa: E402

ESQUEMA_FLASK = """
CREATE TABLE products (id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
  categoria TEXT NOT NULL, stock_actual INTEGER NOT NULL, stock_minimo INTEGER NOT NULL,
  costo REAL NOT NULL DEFAULT 0, low_active INTEGER NOT NULL DEFAULT 0);
CREATE TABLE movements (id INTEGER PRIMARY KEY, product_code TEXT NOT NULL, product_name TEXT NOT NULL,
  tipo TEXT NOT NULL, cantidad INTEGER NOT NULL, stock_anterior INTEGER NOT NULL, stock_nuevo INTEGER NOT NULL,
  created_at TEXT NOT NULL);
CREATE TABLE alerts (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, items_json TEXT NOT NULL, subject TEXT NOT NULL,
  body TEXT NOT NULL, status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class MigrarTests(unittest.TestCase):
    def setUp(self):
        self.carpeta = tempfile.TemporaryDirectory()
        self.ruta = str(Path(self.carpeta.name) / "inventario.db")
        self.db = sqlite3.connect(self.ruta)
        self.db.executescript(ESQUEMA_FLASK)

    def tearDown(self):
        self.db.close()
        self.carpeta.cleanup()

    def llenar(self):
        self.db.execute("INSERT INTO products VALUES (7, 'B1', 'Borrador O''Brien', 'Papelería', 1, 4, 12.5, 1)")
        self.db.execute("INSERT INTO products VALUES (9, 'B2', 'Lápiz', 'Papelería', 40, 15, 6.499999, 0)")
        self.db.execute("INSERT INTO movements VALUES (3, 'B1', 'Borrador O''Brien', 'salida', 2, 3, 1, '2026-10-05T13:00:00-06:00')")
        items = json.dumps([{"id": 7, "codigo": "B1", "nombre": "Borrador O'Brien", "faltante": 3}], ensure_ascii=False)
        self.db.execute("INSERT INTO alerts VALUES (5, '2026-10-05T13:20:15-06:00', ?, 'Asunto', ?, 'error', 'falló: 553', 2, '2026-10-05T13:21:00-06:00')",
                        (items, "Línea 1\nLínea 2 con 'comillas'"))
        self.db.execute("INSERT INTO alerts VALUES (6, '2026-10-05T14:00:00-06:00', '[]', 'Otro', 'Cuerpo', 'simulado', NULL, 1, NULL)")
        self.db.execute("INSERT INTO settings VALUES ('last_check', '2026-10-05T13:39:59-06:00')")
        self.db.commit()

    def test_todo_va_en_una_transaccion_con_guarda(self):
        self.llenar()
        sql = generar_sql(self.ruta)
        instrucciones = [linea for linea in sql.splitlines() if linea and not linea.startswith("--")]
        self.assertEqual(instrucciones[0], "begin;")
        self.assertEqual(instrucciones[-1], "commit;")
        self.assertIn("Las tablas ya tienen datos; no se migró nada.", sql)
        self.assertLess(sql.index("Las tablas ya tienen datos"), sql.index("insert into products"))

    def test_conserva_ids_banderas_y_costos_con_dos_decimales(self):
        self.llenar()
        sql = generar_sql(self.ruta)
        self.assertIn("(7, 'B1', 'Borrador O''Brien', 'Papelería', 1, 4, 12.50, true)", sql)
        self.assertIn("(9, 'B2', 'Lápiz', 'Papelería', 40, 15, 6.50, false)", sql)

    def test_movimientos_y_alertas_con_fechas_json_y_nulos(self):
        self.llenar()
        sql = generar_sql(self.ruta)
        self.assertIn("(3, 'B1', 'Borrador O''Brien', 'salida', 2, 3, 1, '2026-10-05T13:00:00-06:00')", sql)
        self.assertIn("\"nombre\": \"Borrador O''Brien\"", sql)   # comillas duplicadas dentro del JSON
        self.assertIn("::jsonb", sql)
        self.assertIn("'Línea 1\nLínea 2 con ''comillas'''", sql)
        self.assertIn("'error', 'falló: 553', 2, '2026-10-05T13:21:00-06:00')", sql)
        self.assertIn("'simulado', null, 1, null)", sql)
        self.assertIn("('last_check', '2026-10-05T13:39:59-06:00')", sql)

    def test_ajusta_las_secuencias_de_las_tres_tablas(self):
        self.llenar()
        sql = generar_sql(self.ruta)
        for tabla in ("products", "movements", "alerts"):
            self.assertIn(f"pg_get_serial_sequence('{tabla}', 'id')", sql)

    def test_base_vacia_no_genera_inserts(self):
        sql = generar_sql(self.ruta)
        self.assertNotIn("insert into products", sql)
        self.assertNotIn("insert into alerts", sql)
        self.assertIn("commit;", sql)

    def test_base_antigua_sin_columna_costo(self):
        self.db.executescript("DROP TABLE products; CREATE TABLE products (id INTEGER PRIMARY KEY, codigo TEXT, nombre TEXT, "
                              "categoria TEXT, stock_actual INTEGER, stock_minimo INTEGER, low_active INTEGER DEFAULT 0);"
                              "INSERT INTO products VALUES (1, 'V1', 'Viejo', 'Otra', 3, 1, 0);")
        self.assertIn("(1, 'V1', 'Viejo', 'Otra', 3, 1, 0.00, false)", generar_sql(self.ruta))

    def test_archivo_inexistente_da_un_error_claro(self):
        with self.assertRaisesRegex(FileNotFoundError, "No se encontró"):
            generar_sql(str(Path(self.carpeta.name) / "no_existe.db"))


if __name__ == "__main__":
    unittest.main()
