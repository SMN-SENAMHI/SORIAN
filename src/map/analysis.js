import { el, clear } from "../ui/dom.js";

const NO_DATA = 255;

/**
 * Reparto del dominio entre las clases de la escala. Da a la lectura del
 * mapa un respaldo cuantitativo: cuanta area cae en cada rango y de que
 * lado esta el grueso de la anomalia.
 */
export function summarize(frame, scale) {
  const counts = new Array(scale.length).fill(0);
  let total = 0;

  for (const index of frame) {
    if (index === NO_DATA) continue;
    counts[index] += 1;
    total += 1;
  }

  const middle = scale.findIndex((bin) => bin.max > 0);
  const negative = counts.slice(0, middle).reduce((a, b) => a + b, 0);
  const positive = counts.slice(middle).reduce((a, b) => a + b, 0);

  let peak = 0;
  counts.forEach((n, i) => { if (n > counts[peak]) peak = i; });

  return { counts, total, negative, positive, peak };
}

const pct = (n, total) => (total ? (100 * n) / total : 0);
const fmt = (value) => (Number.isInteger(value) ? value : Number(value.toFixed(1)));

export function renderAnalysis(node, grid, frame, month, label) {
  const { counts, total, negative, positive, peak } = summarize(frame, grid.scale);
  const max = Math.max(...counts);
  const units = grid.title.match(/\(([^)]+)\)/)?.[1] ?? "";

  clear(node).append(
    el("header", { class: "analysis__head" }, [
      el("h2", { class: "analysis__title", text: "Distribución del dominio" }),
      el("p", { class: "analysis__sub", text: `${label} · ${month}` }),
    ]),

    el("div", { class: "analysis__split" }, [
      el("div", { class: "analysis__half analysis__half--neg" }, [
        el("span", { class: "analysis__pct", text: `${pct(negative, total).toFixed(0)}%` }),
        el("span", { class: "analysis__tag", text: "bajo lo normal" }),
      ]),
      el("div", { class: "analysis__half analysis__half--pos" }, [
        el("span", { class: "analysis__pct", text: `${pct(positive, total).toFixed(0)}%` }),
        el("span", { class: "analysis__tag", text: "sobre lo normal" }),
      ]),
    ]),

    el("div", { class: "analysis__bars" }, grid.scale.map((bin, i) =>
      el("div", { class: `analysis__row${i === peak ? " is-peak" : ""}` }, [
        el("span", { class: "analysis__swatch", style: `background:${bin.color}` }),
        el("span", { class: "analysis__range", text: `${fmt(bin.min)} a ${fmt(bin.max)}` }),
        el("span", { class: "analysis__track" }, [
          el("span", { class: "analysis__fill", style: `width:${max ? (100 * counts[i]) / max : 0}%` }),
        ]),
        el("span", { class: "analysis__value", text: `${pct(counts[i], total).toFixed(1)}%` }),
      ]),
    )),

    el("p", { class: "analysis__note", text: `Rango dominante: ${fmt(grid.scale[peak].min)} a ${fmt(grid.scale[peak].max)} ${units}. Porcentajes sobre ${total.toLocaleString("es-PE")} celdas del dominio.` }),
  );
}
