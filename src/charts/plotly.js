import { PATHS } from "../config.js";

const REFERENCE_WIDTH = 1100;
const MIN_SCALE = 0.68;
const TICK_SPACING = 62;

let loader = null;

/** Carga plotly una sola vez y solo cuando alguna vista lo necesita. */
export function loadPlotly() {
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PATHS.plotly;
      script.onload = () => resolve(window.Plotly);
      script.onerror = () => { loader = null; reject(new Error("No se pudo cargar Plotly")); };
      document.head.append(script);
    });
  }
  return loader;
}

/** Convierte el titulo enriquecido de Plotly en lineas de texto plano. */
export function titleLines(layout) {
  const raw = layout.title?.text ?? "";
  return raw
    .split(/<br\s*\/?>/i)
    .map((line) => line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Adapta un panel pensado para 1100 px al hueco disponible: escala la
 * tipografia, ajusta margenes y aclara el eje temporal.
 *
 * Titulo, leyenda y sello institucional se dibujan en HTML alrededor del
 * grafico, de modo que el ancho entero quede para los datos.
 */
export function adaptLayout(layout, width, height) {
  const scale = Math.min(1, Math.max(MIN_SCALE, width / REFERENCE_WIDTH));
  const adapted = scaleFonts(structuredClone(layout), scale);
  const source = layout.margin ?? {};

  delete adapted.title;
  delete adapted.images;
  delete adapted.legend;

  adapted.autosize = true;
  adapted.showlegend = false;
  adapted.height = height;
  adapted.paper_bgcolor = "transparent";
  adapted.margin = {
    l: Math.round((source.l ?? 58) * scale) + 10,
    r: Math.round(18 * scale) + 6,
    t: 12,
    b: Math.round(74 * scale) + 12,
  };

  adapted.xaxis = thinTicks(adapted.xaxis ?? {}, width);
  return adapted;
}

/** Con poco ancho las fechas se encabalgan: se conserva una de cada n. */
function thinTicks(axis, width) {
  if (!Array.isArray(axis.tickvals)) return axis;

  const room = Math.max(4, Math.floor(width / TICK_SPACING));
  const every = Math.ceil(axis.tickvals.length / room);
  if (every <= 1) return axis;

  const sample = (list) => list?.filter((_, i) => i % every === 0);
  return { ...axis, tickvals: sample(axis.tickvals), ticktext: sample(axis.ticktext) };
}

function scaleFonts(node, scale) {
  if (Array.isArray(node)) return node.map((item) => scaleFonts(item, scale));
  if (node === null || typeof node !== "object") return node;

  for (const [key, value] of Object.entries(node)) {
    if ((key === "font" || key === "tickfont") && value && typeof value.size === "number") {
      value.size = Math.max(9, Math.round(value.size * scale));
    } else {
      node[key] = scaleFonts(value, scale);
    }
  }
  return node;
}

export const CONFIG = {
  responsive: true,
  displaylogo: false,
  // sin puntero que se retire, la barra de herramientas taparia el grafico
  displayModeBar: !window.matchMedia("(pointer: coarse)").matches && "hover",
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"],
  toImageButtonOptions: { filename: "sorian-enso", scale: 2 },
};
