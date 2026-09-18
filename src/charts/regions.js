const REGION = /niño\s*(1\s*\+\s*2|3\.4)/i;
const FALLBACK = ["Niño 1+2", "Niño 3.4"];

const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Nombre de region Niño que aparezca en un texto de la figura, si hay uno. */
export const regionIn = (text) => {
  const found = plain(text).match(REGION);
  return found ? `Niño ${found[1].replace(/\s+/g, "")}` : null;
};

/** Trazas sin puntos que solo existen para poblar la leyenda de Plotly. */
const legendOnly = (trace) =>
  Array.isArray(trace.x) && trace.x.length > 0 && trace.x.every((value) => value == null);

const axisOf = (trace) => trace.xaxis ?? "x";

/** Referencias del tipo "x2" o "y2 domain"; "paper" se conserva tal cual. */
const refSuffix = (ref) => {
  const match = String(ref ?? "").match(/^[xy](\d*)/);
  return match ? match[1] : null;
};

const remapRef = (ref) => String(ref).replace(/^([xy])\d+/, "$1");

const isPaper = (item) => refSuffix(item.xref) === null && refSuffix(item.yref) === null;

function belongs(item, suffix) {
  if (isPaper(item)) return false;
  return [item.xref, item.yref]
    .map(refSuffix)
    .filter((value) => value !== null)
    .every((value) => value === suffix);
}

/**
 * Separa una figura de dos paneles apilados en una figura por region, cada
 * una con el panel a pagina completa.
 *
 * Las dos regiones Niño comparten variable y eje temporal, asi que el
 * original las reparte en dos filas. Repartidas en dos figuras cada panel
 * dispone de todo el ancho, que es lo que permite leer las fechas y las
 * bandas sin encimarlas.
 */
export function splitRegions(figure) {
  if (!figure.layout.xaxis2) return null;
  return ["", "2"].map((suffix, position) => ({
    name: regionName(figure.layout, position) ?? FALLBACK[position],
    figure: extract(figure, suffix),
  }));
}

function regionName(layout, position) {
  const legend = layout[position ? "legend2" : "legend"];
  const fromLegend = regionIn(legend?.title?.text);
  if (fromLegend) return fromLegend;

  const titles = (layout.annotations ?? []).map((note) => regionIn(note.text)).filter(Boolean);
  return titles[position] ?? null;
}

function extract(figure, suffix) {
  const { layout } = figure;
  const axis = `x${suffix}`;

  const data = figure.data
    .filter((trace) => axisOf(trace) === axis && !legendOnly(trace))
    .map(({ legend, ...trace }) => ({ ...trace, xaxis: "x", yaxis: "y" }));

  const next = { ...layout };
  for (const key of ["xaxis2", "yaxis2", "legend2", "title", "images"]) delete next[key];

  const { matches, ...xaxis } = layout[`xaxis${suffix}`] ?? {};
  next.xaxis = { ...xaxis, domain: [0, 1], anchor: "y" };
  next.yaxis = { ...(layout[`yaxis${suffix}`] ?? {}), domain: [0, 1], anchor: "x" };

  next.shapes = keep(layout.shapes, suffix);
  next.annotations = keep(layout.annotations, suffix).filter((note) => !regionIn(note.text));

  return { data, layout: next };
}

function keep(items, suffix) {
  return (items ?? [])
    .filter((item) => belongs(item, suffix))
    .map((item) => ({
      ...item,
      ...(item.xref ? { xref: remapRef(item.xref) } : {}),
      ...(item.yref ? { yref: remapRef(item.yref) } : {}),
    }));
}

/**
 * Clave de categorias ENSO. El original la dibuja como rectangulos y textos
 * anclados al papel, bajo el eje; sacarla del grafico libera el margen
 * inferior, que es donde se encimaba con las fechas.
 */
export function categoryKey(layout) {
  const order = (a, b) => (b.y0 ?? b.y) - (a.y0 ?? a.y) || (a.x0 ?? a.x) - (b.x0 ?? b.x);

  const swatches = (layout.shapes ?? []).filter((s) => isPaper(s) && s.type === "rect").sort(order);
  const labels = (layout.annotations ?? [])
    .filter((note) => isPaper(note) && !regionIn(note.text))
    .sort(order);

  if (!swatches.length || swatches.length !== labels.length) return [];
  return swatches.map((shape, i) => ({ color: shape.fillcolor, label: plain(labels[i].text) }));
}

/**
 * Iguala el rango vertical de las regiones. Mostradas a la par, dos ejes
 * distintos hacen que una misma anomalia ocupe alturas distintas y la
 * comparacion directa deje de ser valida.
 *
 * Las marcas de cada eje se respetan: los umbrales de categoria no son los
 * mismos en Niño 1+2 que en Niño 3.4.
 */
export function alignScales(regions) {
  const ranges = regions.map((item) => item.figure.layout.yaxis?.range);
  if (!ranges.every(Array.isArray)) return regions;

  const range = [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))];

  return regions.map((item, i) => {
    const { layout } = item.figure;
    const from = ranges[i];
    return {
      ...item,
      figure: {
        ...item.figure,
        layout: {
          ...layout,
          yaxis: { ...layout.yaxis, range },
          // las bandas de fondo llegaban al borde del eje anterior
          shapes: (layout.shapes ?? []).map((shape) => ({
            ...shape,
            ...(shape.y0 === from[0] ? { y0: range[0] } : {}),
            ...(shape.y1 === from[1] ? { y1: range[1] } : {}),
          })),
        },
      },
    };
  });
}

/** Series con nombre y color de la figura, para dibujar la leyenda en HTML. */
export function legendSeries(traces) {
  const seen = new Map();
  for (const trace of traces) {
    if (!trace.name || seen.has(trace.name)) continue;
    const color = trace.line?.color ?? trace.marker?.color ?? trace.fillcolor;
    if (color) seen.set(trace.name, { name: trace.name, color, area: Boolean(trace.fill) || /rgba/.test(color) });
  }
  return [...seen.values()];
}
