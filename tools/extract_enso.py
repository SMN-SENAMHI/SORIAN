"""Extrae los datos de los graficos ENSO de Plotly a JSON.

Los originales embeben plotly.js (4.6 MB) dentro de cada HTML. Aqui se guardan
solo las trazas y el layout; la libreria se carga una sola vez desde el sitio.

Uso:
    python tools/extract_enso.py <dir_origen> <dir_salida>
"""

import json
import re
import sys
from pathlib import Path

SOURCES = {"boxplot": "BOXPLOT.html", "percentiles": "PERCENTILES.html"}
NEWPLOT_RE = re.compile(r"Plotly\.newPlot\(")
DROP_KEYS = {"uid", "legendgrouptitle", "hoverlabel", "selectedpoints"}
CLOSING = {"[": "]", "{": "}"}


def read_json(text, start):
    """Lee el valor JSON que empieza en start respetando cadenas y escapes."""
    opening = text[start]
    closing = CLOSING[opening]
    depth = 0
    in_string = False
    escaped = False

    for i in range(start, len(text)):
        char = text[i]
        if escaped:
            escaped = False
        elif char == "\\" and in_string:
            escaped = True
        elif char == '"':
            in_string = not in_string
        elif not in_string:
            if char == opening:
                depth += 1
            elif char == closing:
                depth -= 1
                if depth == 0:
                    return json.loads(text[start:i + 1]), i + 1
    raise ValueError("valor JSON sin cerrar")


def prune(node):
    """Descarta claves de Plotly que no aportan al re-render."""
    if isinstance(node, dict):
        return {k: prune(v) for k, v in node.items() if k not in DROP_KEYS and v is not None}
    if isinstance(node, list):
        return [prune(v) for v in node]
    if isinstance(node, float):
        return round(node, 4)
    return node


def extract(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    call = [m.start() for m in NEWPLOT_RE.finditer(text)][-1]

    data, end = read_json(text, text.index("[", call))
    layout, _ = read_json(text, text.index("{", end))

    return {"data": prune(data), "layout": prune(layout)}


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    target = Path(sys.argv[2] if len(sys.argv) > 2 else "data/enso")
    target.mkdir(parents=True, exist_ok=True)

    for name, filename in SOURCES.items():
        path = source / filename
        if not path.exists():
            print(f"  omitido {filename} (no existe)")
            continue

        figure = extract(path)
        out = target / f"{name}.json"
        out.write_text(json.dumps(figure, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

        before = path.stat().st_size
        after = out.stat().st_size
        print(f"  {out.name:20s} {before/1e6:5.2f} MB -> {after/1024:6.1f} KB  "
              f"({len(figure['data'])} trazas)")


if __name__ == "__main__":
    main()
