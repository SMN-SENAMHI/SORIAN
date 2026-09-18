"""Recorta el planeta de la lamina oficial y deriva de el la marca del sitio.

La lamina llega como una imagen entera -planeta, nombre, logotipo y fondo-,
pero el sitio no usa la lamina: escribe el nombre con tipografia viva y pone
detras solo el planeta. Aqui se recorta la esfera con su halo, se le da un
alfa circular para que el fondo de la portada se vea alrededor, y de ese
mismo recorte salen los iconos y la tarjeta social.

El circulo no se mide a ojo: se ajusta por minimos cuadrados sobre el anillo
luminoso del limbo, de modo que cambiar de lamina no obliga a retocar numeros.

Uso:
    python tools/build_brand.py [lamina.png]
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
DEFAULT_SOURCE = ROOT / "SORIAN_OFFICIAL.png"

#: Lado del recorte del globo, en radios de esfera. Da aire para el halo sin
#: llegar a la franja donde vive el nombre de la lamina.
FRAME = 1.148
#: Donde empieza y donde acaba el desvanecido del alfa, en radios de esfera.
FADE = (1.06, 1.14)

NAVY = (6, 16, 39)

CARD = (1200, 630)
FONTS = [
    "/usr/share/fonts/truetype/lato/Lato-{}.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans{}.ttf",
]


def find_globe(rgb):
    """Centro y radio de la esfera, ajustados sobre el anillo del limbo."""
    arr = np.asarray(rgb).astype(int)
    ring = (arr[:, :, 2] > 200) & (arr[:, :, 1] > 170)

    # el limbo es, con diferencia, la mancha clara mas grande: las estrellas y
    # la malla del fondo caen en componentes de unos pocos pixeles
    labels, count = ndimage.label(ring)
    sizes = ndimage.sum(ring, labels, range(1, count + 1))
    ys, xs = np.nonzero(labels == int(np.argmax(sizes)) + 1)

    # Kasa: la circunferencia x^2+y^2 = a*x + b*y + c es lineal en (a, b, c)
    design = np.c_[xs, ys, np.ones(len(xs))]
    a, b, c = np.linalg.lstsq(design, xs ** 2 + ys ** 2, rcond=None)[0]
    cx, cy = a / 2, b / 2
    return cx, cy, float(np.sqrt(c + cx ** 2 + cy ** 2))


def cut_globe(rgb, circle, size, frame=FRAME, fade=FADE):
    """Recorte cuadrado del planeta con el fondo desvanecido hacia el canto."""
    cx, cy, r = circle
    half = r * frame
    box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
    crop = rgb.crop(box).resize((size, size), Image.LANCZOS)

    # El alfa no corta en seco: el halo se apaga entre los dos radios de FADE,
    # asi que el planeta se apoya sobre el navy de la portada en vez de quedar
    # recortado sobre un disco de espacio negro.
    axis = (np.arange(size) + .5) / size * 2 - 1
    radius = np.hypot(*np.meshgrid(axis, axis)) * frame
    inner, outer = fade
    alpha = np.clip((outer - radius) / (outer - inner), 0, 1)

    out = crop.convert("RGBA")
    out.putalpha(Image.fromarray((alpha * 255).round().astype(np.uint8)))
    return out


def save_webp(image, name, quality):
    path = ASSETS / name
    image.save(path, "WEBP", quality=quality, method=6)
    return path


def save_png(image, name, colors=192):
    """PNG con paleta: el degradado del limbo no distingue 192 tonos de 16 mil,
    y en color real el icono de 512 pesaba medio mega."""
    path = ASSETS / name
    image.quantize(colors=colors, method=Image.FASTOCTREE,
                   dither=Image.FLOYDSTEINBERG).save(path, "PNG", optimize=True)
    return path


def font(weight, size):
    """Primera familia disponible de la lista, en el grosor pedido."""
    for pattern in FONTS:
        for suffix in ({"bold": ["Bold", "-Bold"], "regular": ["Regular", ""]})[weight]:
            candidate = Path(pattern.format(suffix))
            if candidate.exists():
                return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def tracked(draw, xy, text, spacing, **kw):
    """Texto con interletrado: PIL no lo trae, y el logotipo lo necesita."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, **kw)
        x += draw.textlength(char, font=kw["font"]) + spacing
    return x - spacing


def starfield(rgb, size):
    """Fondo de la tarjeta: un retal de cielo de la lamina, espejado y unido."""
    # zona sin nombre, sin logotipo y sin la malla violeta del pie
    patch = rgb.crop((140, 470, 600, 830))
    tile = Image.new("RGB", (patch.width * 2, patch.height * 2))
    tile.paste(patch, (0, 0))
    tile.paste(patch.transpose(Image.FLIP_LEFT_RIGHT), (patch.width, 0))
    tile.paste(patch.transpose(Image.FLIP_TOP_BOTTOM), (0, patch.height))
    tile.paste(patch.transpose(Image.ROTATE_180), (patch.width, patch.height))

    sky = Image.new("RGB", size, NAVY)
    for y in range(0, size[1], tile.height):
        for x in range(0, size[0], tile.width):
            sky.paste(tile, (x, y))
    return Image.blend(sky, Image.new("RGB", size, NAVY), .34)


def veil(size):
    """El mismo velo diagonal de la portada, para que la letra se lea."""
    width, height = size
    row = np.interp(
        np.linspace(0, 1, width),
        [0, .30, .54, .80, 1], [1, .93, .60, .16, 0],
    )
    mask = np.tile((row * 255).round().astype(np.uint8), (height, 1))
    layer = Image.new("RGBA", size, NAVY + (255,))
    layer.putalpha(Image.fromarray(mask))
    return layer


def social_card(rgb, circle):
    """Tarjeta de 1200x630 para og:image: planeta, marca y firma del SENAMHI."""
    card = starfield(rgb, CARD).convert("RGBA")

    globe = cut_globe(rgb, circle, 760)
    card.alpha_composite(globe, (CARD[0] - 640, (CARD[1] - globe.height) // 2))
    card.alpha_composite(veil(CARD))

    draw = ImageDraw.Draw(card)
    # la A del logotipo es una lambda mayuscula, como en la cabecera del sitio
    tracked(draw, (86, 150), "SORIΛN", 17, font=font("bold", 104), fill="#ffffff")

    lead = font("regular", 31)
    for i, line in enumerate((
        "Sistema Operacional de Resolución Integrada",
        "para la Predicción del Clima",
    )):
        draw.text((90, 318 + i * 44), line, font=lead, fill="#a9c0da")

    # el logotipo firma la tarjeta: quien la comparte es el SENAMHI, y el
    # nombre del area ya lo dice la pagina a la que lleva
    logo = Image.open(ASSETS / "logo-senamhi.png").convert("RGBA")
    logo = logo.resize((262, 120), Image.LANCZOS)
    card.alpha_composite(logo, (82, 452))
    return card.convert("RGB")


def icon(globe, size, background=None):
    """Icono cuadrado: la esfera casi a sangre, con su halo cortado al disco."""
    art = globe.resize((size, size), Image.LANCZOS)
    if background is None:
        return art

    plate = Image.new("RGB", (size, size), background)
    plate.paste(art, (0, 0), art)
    return plate


def favicon_svg(png):
    """El SVG no dibuja el globo: lleva dentro el mismo PNG de 192 que el
    manifiesto, ya reducido a paleta, y le pone el nombre de la marca."""
    import base64

    data = base64.b64encode(png.read_bytes()).decode()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
        ' viewBox="0 0 192 192" role="img" aria-label="SORIAN">\n'
        f'  <image width="192" height="192" xlink:href="data:image/png;base64,{data}"/>\n'
        "</svg>\n"
    )


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    rgb = Image.open(source).convert("RGB")
    circle = find_globe(rgb)
    print("esfera: centro (%.1f, %.1f), radio %.1f px" % circle)

    globe = cut_globe(rgb, circle, 880)
    save_webp(globe, "globo.webp", 82)
    save_webp(globe.resize((440, 440), Image.LANCZOS), "globo-sm.webp", 80)

    # El icono aprieta el encuadre: a 32 px el aire del halo se come la esfera.
    tight = cut_globe(rgb, circle, 512, frame=1.035, fade=(.97, 1.03))
    save_png(tight, "icon-512.png")
    png192 = save_png(tight.resize((192, 192), Image.LANCZOS), "icon-192.png", colors=160)
    save_png(icon(tight, 180, NAVY), "apple-touch-icon.png")
    (ASSETS / "favicon.svg").write_text(favicon_svg(png192), encoding="utf-8")

    tight.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    save_webp(social_card(rgb, circle), "hero-sudamerica.webp", 86)
    print("marca reconstruida en assets/")


if __name__ == "__main__":
    main()
