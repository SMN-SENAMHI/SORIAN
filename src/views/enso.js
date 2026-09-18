import { PATHS } from "../config.js";
import { load } from "../data.js";
import { el, clear, spinner, errorBox } from "../ui/dom.js";
import { loadPlotly, adaptLayout, titleLines, CONFIG } from "../charts/plotly.js";
import { splitRegions, alignScales, legendSeries, categoryKey } from "../charts/regions.js";
import { groupSeries, seriesFilter, staticLegend, visibilityFor } from "../charts/series.js";
import { isCompact } from "../ui/media.js";
import { slidingMarker } from "../ui/marker.js";

const VIEWS = [
  { id: "percentiles", label: "Percentiles", hint: "Dispersión del ensamble multimodelo" },
  { id: "boxplot", label: "Boxplot", hint: "Distribución modelo por modelo", selectable: true },
];

const BOTH = "ambas";
const PAIRED_WIDTH = 1180;
const GAP = 20;
const RATIO = 0.62;
const MIN_HEIGHT = 340;
const MAX_HEIGHT = 580;

export default function enso(outlet) {
  let view = VIEWS[0].id;
  // apiladas en un movil cada panel queda diminuto: se abre una sola region
  let region = isCompact() ? "0" : BOTH;
  let regions = null;
  let drawn = [];
  let resizeTimer = null;
  let viewportWidth = window.innerWidth;

  const caption = el("div", { class: "chart__caption" });
  const key = el("div", { class: "key" });
  const categories = el("div", { class: "key key--categories" });
  const panels = el("div", { class: "chart__panels" });
  const stage = el("section", { class: "chart" }, [caption, key, panels, categories]);

  const tabs = el("div", { class: "segmented", role: "tablist", "aria-label": "Tipo de gráfico" });
  const scope = el("div", { class: "segmented", role: "group", "aria-label": "Región Niño" });

  outlet.classList.add("outlet--wide");
  outlet.append(
    // el encabezado dice que se mira y la barra como: van juntos en un renglon
    el("div", { class: "view__top" }, [
      el("header", { class: "view__header" }, [
        el("h1", { text: "Monitoreo y predicción ENSO" }),
        el("p", {
          class: "view__lead",
          text: "Anomalía de la temperatura superficial del mar en las regiones Niño. Predicción multimodelo frente a la evolución observada.",
        }),
      ]),
      el("div", { class: "toolbar" }, [tabs, scope]),
    ]),
    stage,
  );

  /* Mismo conmutador que las regiones, que vive al lado: dos mandos con la
     misma forma se leen como un par. La pista de cada vista pasa al tooltip;
     escrita bajo el rotulo obligaba a una tarjeta de dos lineas que ademas
     partia el texto de forma distinta en cada una. */
  function renderTabs() {
    clear(tabs).append(...VIEWS.map((item) =>
      el("button", {
        class: `segmented__option${item.id === view ? " is-active" : ""}`,
        type: "button", role: "tab", "aria-selected": String(item.id === view),
        title: item.hint,
        text: item.label,
        onClick: () => { view = item.id; show(); },
      }),
    ));

    const moveTo = slidingMarker(tabs, "enso-view");
    requestAnimationFrame(() => moveTo(tabs.querySelector(".is-active")));
  }

  function renderScope() {
    if (!regions || regions.length < 2) return clear(scope);

    const options = [
      ...regions.map((item, i) => ({ id: String(i), label: item.name })),
      { id: BOTH, label: "Ambas" },
    ];

    clear(scope).append(...options.map((option) =>
      el("button", {
        class: `segmented__option${option.id === region ? " is-active" : ""}`,
        type: "button",
        "aria-pressed": String(option.id === region),
        text: option.label,
        onClick: () => { region = option.id; show(); },
      }),
    ));

    const moveTo = slidingMarker(scope, "enso-region");
    requestAnimationFrame(() => moveTo(scope.querySelector(".is-active")));
  }

  /** Ancho y alto de cada panel segun cuantos se muestran a la vez. */
  function measure(count) {
    const available = panels.clientWidth || outlet.clientWidth;
    const columns = count > 1 && available >= PAIRED_WIDTH ? 2 : 1;
    const width = (available - (columns - 1) * GAP) / columns;
    const height = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, width * RATIO)));
    return { columns, width, height };
  }

  function purge() {
    for (const panel of drawn) window.Plotly?.purge?.(panel.plot);
    drawn = [];
  }

  async function show() {
    const requested = view;
    renderTabs();
    purge();
    clear(caption);
    clear(key);
    clear(categories);
    clear(panels).append(spinner("Cargando gráfico…"));

    try {
      const [Plotly, figure] = await Promise.all([loadPlotly(), load(PATHS.enso(requested))]);
      if (view !== requested) return;

      regions = splitRegions(figure) ?? [{ name: "", figure }];
      if (region !== BOTH && !regions[Number(region)]) region = BOTH;
      renderScope();

      const [heading, ...rest] = titleLines(figure.layout);
      clear(caption).append(
        el("h2", { class: "chart__title", text: heading ?? "" }),
        ...rest.map((line) => el("p", { class: "chart__subtitle", text: line })),
      );

      const chosen = region === BOTH ? alignScales(regions) : [regions[Number(region)]];
      const { columns, width, height } = measure(chosen.length);

      clear(panels);
      panels.style.setProperty("--columns", columns);

      for (const item of chosen) {
        const plot = el("div", { class: "panel__plot" });
        panels.append(el("figure", { class: "panel" }, [
          item.name ? el("figcaption", { class: "panel__name", text: item.name }) : null,
          plot,
        ]));
        await Plotly.newPlot(plot, item.figure.data, adaptLayout(item.figure.layout, width, height), CONFIG);
        drawn.push({ plot, groups: groupSeries(item.figure.data) });
      }

      const chart = VIEWS.find((item) => item.id === requested);
      // el filtro de series se dispone en rejilla; la leyenda fija, en linea
      key.className = chart.selectable ? "series" : "key";
      if (chart.selectable) {
        seriesFilter(key, groupSeries(figure.data), (shown) => {
          for (const panel of drawn) {
            const { indices, visible } = visibilityFor(panel.groups, shown);
            Plotly.restyle(panel.plot, { visible }, indices);
          }
        });
      } else {
        staticLegend(key, legendSeries(figure.data));
      }

      const bands = categoryKey(figure.layout);
      if (bands.length) {
        clear(categories).append(
          el("span", { class: "key__title", text: "Categorías ENSO" }),
          ...bands.map((item) =>
            el("span", { class: "key__item" }, [
              el("span", { class: "key__swatch key__swatch--area", style: `background:${item.color}` }),
              el("span", { text: item.label }),
            ]),
          ),
        );
      }
    } catch (error) {
      clear(panels).append(errorBox("No se pudo cargar el gráfico.", () => show()));
    }
  }

  /**
   * Solo el ancho cambia el reparto de paneles: el alto sale de multiplicarlo.
   * Y en movil la barra del navegador se repliega al desplazarse, lo que emite
   * un resize de solo alto; redibujar ahi vacia los paneles, la pagina encoge
   * de golpe y el scroll vuelve al principio, asi que no se puede recorrer.
   */
  function onResize() {
    if (window.innerWidth === viewportWidth) return;
    viewportWidth = window.innerWidth;

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => show(), 250);
  }

  window.addEventListener("resize", onResize);
  show();

  return {
    destroy: () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      purge();
      outlet.classList.remove("outlet--wide");
    },
  };
}
