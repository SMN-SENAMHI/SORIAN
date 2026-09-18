"""Extrae los contornos de paises de un visor Folium a un GeoJSON compartido.

Los originales repiten las mismas fronteras en los 9 visores con 15 decimales
de precision. A escala continental basta con 3 decimales (~110 m).

Uso:
    python tools/extract_borders.py <visor.html> <salida.json>
"""

import json
import re
import sys
from pathlib import Path

POLYLINE_RE = re.compile(r"L\.polyline\(\s*\[\[", re.S)
PRECISION = 3
MIN_VERTICES = 2
TOLERANCE = 0.02  # grados (~2 km); el visor no pasa de zoom 8


def read_array(text, start):
    """Devuelve el array JSON que empieza en start, balanceando corchetes."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError("array sin cerrar")


def douglas_peucker(points, tolerance):
    """Simplificacion iterativa; conserva la forma visible del contorno."""
    if len(points) < 3:
        return points

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        first, last = stack.pop()
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        span = dx * dx + dy * dy

        far, best = -1, tolerance
        for i in range(first + 1, last):
            px, py = points[i]
            if span == 0:
                distance = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
                distance = ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
            if distance > best:
                far, best = i, distance

        if far > 0:
            keep[far] = True
            stack.append((first, far))
            stack.append((far, last))

    return [p for p, k in zip(points, keep) if k]


def simplify(line):
    """Simplifica la geometria y redondea a PRECISION."""
    points = douglas_peucker([(lon, lat) for lat, lon in line], TOLERANCE)
    out = []
    for lon, lat in points:
        point = [round(lon, PRECISION), round(lat, PRECISION)]
        if not out or point != out[-1]:
            out.append(point)
    return out


def main():
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    text = source.read_text(encoding="utf-8", errors="replace")

    lines, vertices_before = [], 0
    for match in POLYLINE_RE.finditer(text):
        raw = read_array(text, match.end() - 2)
        vertices_before += len(raw)
        line = simplify(raw)
        if len(line) >= MIN_VERTICES:
            lines.append(line)

    geojson = {
        "type": "Feature",
        "properties": {"name": "Limites politicos - Sudamerica"},
        "geometry": {"type": "MultiLineString", "coordinates": lines},
    }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(geojson, separators=(",", ":")), encoding="utf-8")

    vertices = sum(len(line) for line in lines)
    print(f"{len(lines)} lineas, {vertices_before} -> {vertices} vertices")
    print(f"{target} ({target.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
