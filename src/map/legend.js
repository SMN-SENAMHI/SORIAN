import { el } from "../ui/dom.js";

const format = (value) => (Number.isInteger(value) ? value : Number(value.toFixed(1)));

export function buildLegend(scale, title) {
  const swatches = scale.map((bin) =>
    el("span", {
      class: "legend__swatch",
      style: `background:${bin.color}`,
      title: `${format(bin.min)} a ${format(bin.max)}`,
    }),
  );

  const ticks = scale
    .filter((_, index) => index > 0 && index < scale.length - 1 && index % 3 === 0)
    .map((bin) => el("span", { class: "legend__tick", text: String(format(bin.min)) }));

  return el("figure", { class: "legend" }, [
    // sin titulo cuando quien la coloca ya ha rotulado el campo por su cuenta
    title ? el("figcaption", { class: "legend__title", text: title }) : null,
    el("div", { class: "legend__bar" }, swatches),
    el("div", { class: "legend__ticks" }, [
      el("span", { class: "legend__tick", text: String(format(scale[0].max)) }),
      ...ticks,
      el("span", { class: "legend__tick", text: String(format(scale.at(-1).min)) }),
    ]),
  ]);
}

/**
 * La escala es de anomalias y esta partida en dos mitades simetricas: el lado
 * del indice dice hacia donde se desvia la celda y su distancia al centro,
 * cuanto. Ese par (direccion, intensidad) es lo que se puede poner en palabras
 * sin atribuir al dato una precision que no tiene.
 */
/** 0 en el centro de la escala, 4 en su clase extrema. */
function intensity(scale, index) {
  const mid = scale.length / 2;
  const rank = index < mid ? mid - index : index - mid + 1;
  const frac = (rank - 1) / (mid - 1);

  if (frac === 0) return 0;
  if (frac === 1) return 4;
  if (frac <= 0.3) return 1;
  return frac <= 0.6 ? 2 : 3;
}

const WORDING = {
  precipitacion: {
    neutral: "Lluvia en torno a lo normal",
    more: ["Algo más lluvia de lo normal", "Bastante más lluvia de lo normal",
      "Mucha más lluvia de lo normal", "Lluvia excepcionalmente alta"],
    less: ["Algo menos lluvia de lo normal", "Bastante menos lluvia de lo normal",
      "Mucha menos lluvia de lo normal", "Lluvia excepcionalmente baja"],
  },
  temperatura: {
    neutral: "Temperatura en torno a lo normal",
    more: ["Algo más cálido de lo normal", "Bastante más cálido de lo normal",
      "Mucho más cálido de lo normal", "Calor excepcional"],
    less: ["Algo más frío de lo normal", "Bastante más frío de lo normal",
      "Mucho más frío de lo normal", "Frío excepcional"],
  },
};

const KIND = { tpara: "precipitacion", mx2t24a: "temperatura", mn2t24a: "temperatura" };

/** Lo que la celda significa, en palabras: direccion e intensidad del desvio. */
export function describeAnomaly(scale, index, variable) {
  if (index === null) return "sin dato";

  const words = WORDING[KIND[variable] ?? "precipitacion"];
  const level = intensity(scale, index);
  if (level === 0) return words.neutral;

  return index < scale.length / 2 ? words.less[level - 1] : words.more[level - 1];
}

/**
 * La fuente publica el campo por clases, asi que un punto da su intervalo. Las
 * dos clases de los extremos no tienen tope real: su limite exterior es solo
 * donde la escala deja de dividir, y darlo como cifra lo haria pasar por dato.
 */
export function describeBin(scale, index, units = "") {
  if (index === null) return "";
  const suffix = units ? ` ${units}` : "";

  if (index === 0) return `${format(scale[0].max)}${suffix} o menos`;
  if (index === scale.length - 1) return `${format(scale.at(-1).min)}${suffix} o más`;

  const bin = scale[index];
  return `${format(bin.min)} a ${format(bin.max)}${suffix}`;
}

/** -8.6, -71.3 -> 8.6° S, 71.3° O */
export function formatLatLng({ lat, lng }) {
  const ns = `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(lng).toFixed(1)}° ${lng >= 0 ? "E" : "O"}`;
  return `${ns}, ${ew}`;
}
