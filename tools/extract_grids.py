"""Convierte los visores Folium de SORIAN a grillas compactas.

Cada visor original pesa ~24 MB porque Folium emite una llamada L.polygon()
por celda con su objeto de estilo completo. La grilla subyacente es regular,
asi que basta con guardar un indice de color por celda.

Uso:
    python tools/extract_grids.py <dir_visores> <dir_salida>
"""

import base64
import json
import re
import sys
from pathlib import Path

MODELS = ["ecmwf", "bom", "ncep"]
VARIABLES = ["tpara", "mx2t24a", "mn2t24a"]

MONTH_ES = {
    "Jan": "Ene", "Apr": "Abr", "Aug": "Ago",
    "Dec": "Dic", "Feb": "Feb", "Mar": "Mar", "May": "May",
    "Jun": "Jun", "Jul": "Jul", "Sep": "Set", "Oct": "Oct", "Nov": "Nov",
}

CELL_RE = re.compile(
    r'L\.polygon\(\s*\[\[([-\d.]+), ([-\d.]+)\],'
    r' \[[-\d.]+, [-\d.]+\], \[([-\d.]+), ([-\d.]+)\], \[[-\d.]+, [-\d.]+\]\],\s*'
    r'\{"bubblingMouseEvents": true, "color": null.*?"fillColor": "(#[0-9a-fA-F]{6,8})".*?\}\s*'
    r'\)\.addTo\((feature_group_[0-9a-f]+)\)'
)
OVERLAY_RE = re.compile(r'"([A-Za-z0-9_]+)"\s*:\s*(feature_group_[0-9a-f]+)')
DOMAIN_RE = re.compile(r"\.domain\(\[([^\]]*)\]\)")
RANGE_RE = re.compile(r"\.range\(\[([^\]]*)\]\)")
TITLE_RE = re.compile(r'\.text\("([^"]*)"\)')


def read_scale(html):
    """Devuelve (breaks, colores) de la escala d3.threshold del visor."""
    domain = [float(x) for x in DOMAIN_RE.search(html).group(1).split(",")]
    colors = [c.strip().strip("'\"")[:7].lower() for c in RANGE_RE.search(html).group(1).split(",")]

    bins, current = [], None
    for value, color in zip(domain, colors):
        if color != current:
            bins.append({"color": color, "min": value})
            current = color
        bins[-1]["max"] = value
    bins[0]["min"] = domain[0]
    bins[-1]["max"] = domain[-1]
    return bins


def read_title(html):
    raw = TITLE_RE.search(html)
    return raw.group(1).encode().decode("unicode_escape") if raw else ""


def label_month(name):
    """ECMWF_tpara_Aug2026 -> Ago 2026"""
    stamp = name.rsplit("_", 1)[-1]
    return f"{MONTH_ES.get(stamp[:3], stamp[:3])} {stamp[3:]}"


def extract(path):
    html = path.read_text(encoding="utf-8", errors="replace")
    cells = CELL_RE.findall(html)
    if not cells:
        raise ValueError(f"{path.name}: no se encontraron celdas de datos")

    order = [g for _, g in OVERLAY_RE.findall(html)]
    names = {g: n for n, g in OVERLAY_RE.findall(html)}

    lats = sorted({float(c[2]) for c in cells})
    lons = sorted({float(c[1]) for c in cells})
    lat_index = {v: i for i, v in enumerate(lats)}
    lon_index = {v: i for i, v in enumerate(lons)}

    scale = read_scale(html)
    palette = [b["color"] for b in scale]
    color_index = {c: i for i, c in enumerate(palette)}

    ny, nx = len(lats), len(lons)
    frames = {g: bytearray([255]) * (ny * nx) for g in order}

    for lat_top, lon_left, lat_bottom, _, color, group in cells:
        row = lat_index[float(lat_bottom)]
        col = lon_index[float(lon_left)]
        frames[group][row * nx + col] = color_index[color[:7].lower()]

    return {
        "title": read_title(html),
        "grid": {
            "lat0": lats[0], "lon0": lons[0],
            "dlat": round(lats[1] - lats[0], 6),
            "dlon": round(lons[1] - lons[0], 6),
            "ny": ny, "nx": nx,
        },
        "months": [label_month(names[g]) for g in order],
        "scale": scale,
        "frames": [base64.b64encode(bytes(frames[g])).decode() for g in order],
    }


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    target = Path(sys.argv[2] if len(sys.argv) > 2 else "data/grids")
    target.mkdir(parents=True, exist_ok=True)

    manifest = []
    for model in MODELS:
        for variable in VARIABLES:
            path = source / f"visor_{model}_{variable}.html"
            if not path.exists():
                print(f"  omitido {path.name} (no existe)")
                continue

            grid = extract(path)
            out = target / f"{model}_{variable}.json"
            out.write_text(json.dumps(grid, separators=(",", ":")), encoding="utf-8")

            before = path.stat().st_size
            after = out.stat().st_size
            print(f"  {out.name:24s} {before/1e6:6.1f} MB -> {after/1024:6.1f} KB  ({before/after:.0f}x)")
            manifest.append({
                "model": model, "variable": variable,
                "title": grid["title"], "months": grid["months"],
                "file": f"{model}_{variable}.json",
            })

    (target / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(manifest)} grillas escritas en {target}")


if __name__ == "__main__":
    main()
