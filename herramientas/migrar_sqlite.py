"""Pasa los datos de inventario.db (SQLite, versión Flask) a Supabase.

No se conecta a internet ni necesita claves: solo LEE el archivo .db y escribe
un archivo .sql. Ese archivo se pega en el SQL Editor de Supabase y se ejecuta.

Uso (PowerShell, desde la carpeta InventarioReact):

    py herramientas\\migrar_sqlite.py RUTA\\a\\inventario.db
    py herramientas\\migrar_sqlite.py RUTA\\a\\inventario.db salida.sql

Solo usa la librería estándar de Python.
"""
import sqlite3
import sys
from pathlib import Path


def texto(valor):
    """Texto para SQL: entre comillas simples, duplicando las comillas internas."""
    if valor is None:
        return "null"
    return "'" + str(valor).replace("'", "''") + "'"


def entero(valor):
    return "null" if valor is None else str(int(valor))


def dinero(valor):
    return f"{float(valor or 0):.2f}"


def booleano(valor):
    return "true" if valor else "false"


def insertar(tabla, columnas, filas):
    """Una sola instrucción INSERT con todas las filas, o nada si no hay filas."""
    if not filas:
        return []
    valores = ",\n".join("  (" + ", ".join(fila) + ")" for fila in filas)
    return [f"insert into {tabla} ({', '.join(columnas)}) values\n{valores};", ""]


def generar_sql(ruta_db):
    """Lee la base SQLite y devuelve el SQL que copia sus datos a Postgres."""
    if not Path(ruta_db).is_file():
        raise FileNotFoundError(f"No se encontró el archivo: {ruta_db}")

    db = sqlite3.connect(f"file:{Path(ruta_db).as_posix()}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        columnas_productos = {fila["name"] for fila in db.execute("PRAGMA table_info(products)")}
        productos = db.execute("SELECT * FROM products ORDER BY id").fetchall()
        movimientos = db.execute("SELECT * FROM movements ORDER BY id").fetchall()
        alertas = db.execute("SELECT * FROM alerts ORDER BY id").fetchall()
        ajustes = db.execute("SELECT * FROM settings ORDER BY key").fetchall()
    finally:
        db.close()

    sql = [
        "-- Datos migrados desde inventario.db (versión Flask).",
        "-- Pega este archivo completo en el SQL Editor de Supabase y pulsa Run.",
        "-- Corre en una sola transacción: si algo falla, no se guarda nada.",
        f"-- Contiene {len(productos)} producto(s), {len(movimientos)} movimiento(s) y {len(alertas)} alerta(s).",
        "",
        "begin;",
        "",
        "-- Guarda: si ya hay datos, se detiene para no duplicarlos.",
        "do $$",
        "begin",
        "  if exists (select 1 from products) or exists (select 1 from movements) or exists (select 1 from alerts) then",
        "    raise exception 'Las tablas ya tienen datos; no se migró nada.';",
        "  end if;",
        "end $$;",
        "",
    ]

    # Se conservan los ids y la bandera low_active: así el bot no vuelve a
    # avisar de los episodios de stock bajo que ya se avisaron.
    sql += insertar(
        "products",
        ["id", "codigo", "nombre", "categoria", "stock_actual", "stock_minimo", "costo", "low_active"],
        [[entero(p["id"]), texto(p["codigo"]), texto(p["nombre"]), texto(p["categoria"]),
          entero(p["stock_actual"]), entero(p["stock_minimo"]),
          dinero(p["costo"] if "costo" in columnas_productos else 0),
          booleano(p["low_active"])] for p in productos],
    )
    sql += insertar(
        "movements",
        ["id", "product_code", "product_name", "tipo", "cantidad", "stock_anterior", "stock_nuevo", "created_at"],
        [[entero(m["id"]), texto(m["product_code"]), texto(m["product_name"]), texto(m["tipo"]),
          entero(m["cantidad"]), entero(m["stock_anterior"]), entero(m["stock_nuevo"]),
          texto(m["created_at"])] for m in movimientos],
    )
    sql += insertar(
        "alerts",
        ["id", "created_at", "items", "subject", "body", "status", "error", "attempts", "last_attempt_at"],
        [[entero(a["id"]), texto(a["created_at"]), texto(a["items_json"]) + "::jsonb", texto(a["subject"]),
          texto(a["body"]), texto(a["status"]), texto(a["error"]), entero(a["attempts"]),
          texto(a["last_attempt_at"])] for a in alertas],
    )
    if ajustes:
        valores = ",\n".join(f"  ({texto(s['key'])}, {texto(s['value'])})" for s in ajustes)
        sql += [f"insert into settings (key, value) values\n{valores}\non conflict (key) do update set value = excluded.value;", ""]

    sql.append("-- Como se conservaron los ids, se avisa a cada tabla cuál es el siguiente id libre.")
    for tabla in ("products", "movements", "alerts"):
        sql.append(
            f"select setval(pg_get_serial_sequence('{tabla}', 'id'), "
            f"coalesce((select max(id) from {tabla}), 1), exists (select 1 from {tabla}));"
        )
    sql += ["", "commit;", ""]
    return "\n".join(sql)


def main(argumentos):
    if len(argumentos) not in (1, 2):
        print(__doc__)
        return 2
    salida = Path(argumentos[1] if len(argumentos) == 2 else "datos_migrados.sql")
    try:
        sql = generar_sql(argumentos[0])
    except (FileNotFoundError, sqlite3.Error) as error:
        print(f"No se pudo leer la base: {error}")
        return 1
    salida.write_text(sql, encoding="utf-8")
    print(f"Listo: {salida.resolve()}")
    print(sql.splitlines()[3].lstrip("- "))
    print("Siguiente paso: pega ese archivo en el SQL Editor de Supabase y pulsa Run.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
