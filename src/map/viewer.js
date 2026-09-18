import { MAP, MODELS, VARIABLES, PATHS, ANIMATION_INTERVAL } from "../config.js";
import { load } from "../data.js";
import { el, clear, spinner, errorBox } from "../ui/dom.js";
import { EXPAND_ICON, COLLAPSE_ICON } from "../ui/icons.js";
import { createGridLayer } from "./grid-layer.js";
import { buildLegend, describeAnomaly, describeBin, formatLatLng } from "./legend.js";
import { createSwipe } from "./swipe.js";
import { renderAnalysis } from "./analysis.js";

export function createViewer(container, controls) {
  const mapNode = el("div", { class: "viewer__map" });
  const legendNode = el("div", { class: "viewer__panel viewer__panel--legend" });
  const timeline = el("div", { class: "viewer__panel viewer__panel--time" });
  // El punto consultado se lee en una franja bajo el mapa: dentro se
  // encimaba con la linea de tiempo y con los propios mandos.
  const readout = el("p", {
    class: "readout", role: "status", "aria-live": "polite",
    // el visor de origen publica el campo por clases de color, no por valor:
    // la lectura dice que significa la clase y deja su intervalo como respaldo
    title: "La predicción se publica clasificada por rangos respecto al promedio histórico: la celda cae en este intervalo de la escala, no en un valor exacto.",
  }, [
    el("span", { class: "readout__hint", text: "Apunta el mapa para consultar un punto" }),
  ]);
  const dot = el("span", { class: "probe-dot", "aria-hidden": "true", hidden: true });

  const analysis = el("aside", {
    class: "analysis", hidden: true, "aria-label": "Distribución del dominio",
  });

  const stage = el("div", { class: "viewer__stage" }, [
    mapNode,
    el("div", { class: "viewer__overlay viewer__overlay--top" }, [controls]),
    el("div", { class: "viewer__overlay viewer__overlay--bottom" }, [legendNode, timeline]),
    dot,
  ]);

  container.append(stage, analysis, readout);

  const L = window.L;
  const GridLayer = createGridLayer(L);

  const map = L.map(mapNode, {
    center: MAP.center,
    zoom: MAP.zoom,
    minZoom: MAP.minZoom,
    maxZoom: MAP.maxZoom,
    zoomControl: false,
    preferCanvas: true,
    zoomSnap: 0,
    zoomDelta: 0.5,
    attributionControl: false,
  });

  L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);
  L.tileLayer(MAP.tiles, {
    attribution: MAP.attribution,
    subdomains: MAP.subdomains,
    maxZoom: MAP.maxZoom,
  }).addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map);
  const dropFullscreen = addFullscreen();

  // Las etiquetas van por encima de la grilla para que sigan legibles.
  const labels = L.tileLayer(MAP.labels, {
    subdomains: MAP.subdomains,
    maxZoom: MAP.maxZoom,
    pane: "shadowPane",
  }).addTo(map);

  const sides = {
    a: { grid: null, layer: null, request: 0 },
    b: { grid: null, layer: null, request: 0 },
  };

  let borders = null;
  let index = 0;
  let timer = null;
  let framed = false;
  let swipe = null;
  let smooth = false;
  let domain = null;
  let sized = null;

  load(PATHS.borders)
    .then((geo) => {
      borders = L.geoJSON(geo, {
        style: { color: "#37474f", weight: 0.8, opacity: 0.85, fill: false },
        interactive: false,
      }).addTo(map);
    })
    .catch(() => { /* el mapa sigue siendo utilizable sin fronteras */ });

  /**
   * Pantalla completa sobre la aplicacion entera, no solo el mapa: ademas de
   * los mandos y la linea de tiempo, la cabecera tiene que seguir ahi. Sin
   * ella no se sabe que sitio se esta mirando ni se puede cambiar de seccion,
   * y para volver habria que salir de pantalla completa primero.
   */
  function addFullscreen() {
    if (!document.fullscreenEnabled) return null;

    const button = el("button", {
      class: "map-btn", type: "button",
      title: "Pantalla completa", "aria-label": "Pantalla completa",
      html: EXPAND_ICON,
      onClick: () => {
        const target = container.closest("#app") ?? container.parentElement ?? container;
        if (document.fullscreenElement) document.exitFullscreen();
        else target.requestFullscreen?.();
      },
    });

    const control = L.control({ position: "topright" });
    control.onAdd = () => {
      L.DomEvent.disableClickPropagation(button);
      return button;
    };
    control.addTo(map);

    const onChange = () => {
      const on = Boolean(document.fullscreenElement);
      button.innerHTML = on ? COLLAPSE_ICON : EXPAND_ICON;
      button.title = on ? "Salir de pantalla completa" : "Pantalla completa";
      button.setAttribute("aria-label", button.title);
      requestAnimationFrame(() => map.invalidateSize());
    };

    // el oyente vive en document, no en el mapa: si no se suelta al cerrar la
    // vista, cada visita a Estacional deja uno mas apuntando a un mapa muerto
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }

  function applyClip() {
    if (!swipe) {
      sides.a.layer?.setClip(null);
      return;
    }
    const cut = swipe.ratio();
    sides.a.layer?.setClip(0, cut);
    sides.b.layer?.setClip(cut, 1);
  }

  function renderTimeline() {
    const months = sides.a.grid?.months ?? [];
    clear(timeline).append(
      el("button", {
        class: "timeline__play", type: "button",
        "aria-label": timer ? "Pausar animación" : "Reproducir animación",
        onClick: toggle,
      }, timer ? "❚❚" : "▶"),
      el("div", { class: "timeline__steps", role: "tablist" },
        months.map((month, i) =>
          el("button", {
            class: `timeline__step${i === index ? " is-active" : ""}`,
            type: "button", role: "tab", "aria-selected": String(i === index),
            text: month, onClick: () => show(i),
          }),
        ),
      ),
    );
  }

  function show(next) {
    index = next;
    for (const side of Object.values(sides)) {
      if (side.grid && side.layer) side.layer.setFrame(side.grid.frames[index]);
    }
    renderTimeline();
    updateAnalysis();
  }

  /** El reparto solo se recalcula si el panel esta a la vista. */
  function updateAnalysis() {
    const { grid, layer, label } = sides.a;
    if (analysis.hidden || !grid || !layer?._frame) return;
    renderAnalysis(analysis, grid, layer._frame, grid.months[index], label ?? "");
  }

  function toggle() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    } else {
      const total = sides.a.grid?.months.length ?? 1;
      timer = setInterval(() => show((index + 1) % total), ANIMATION_INTERVAL);
    }
    renderTimeline();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  function renderLegend() {
    const { a, b } = sides;
    if (!a.grid) return;

    clear(legendNode);
    if (b.grid && b.grid.title !== a.grid.title) {
      legendNode.append(buildLegend(a.grid.scale, a.grid.title));
      legendNode.append(buildLegend(b.grid.scale, b.grid.title));
    } else {
      legendNode.append(buildLegend(a.grid.scale, a.grid.title));
    }
  }

  /**
   * El dominio es mas alto que ancho, asi que encajarlo entero deja franjas
   * vacias en pantallas apaisadas. Se toma un punto medio entre el zoom que
   * lo encaja y el que lo cubre: llena la vista sin recortar de mas.
   */
  function frame({ lat0, lon0, dlat, dlon, ny, nx }) {
    const bounds = L.latLngBounds([lat0, lon0], [lat0 + ny * dlat, lon0 + nx * dlon]);
    const fit = map.getBoundsZoom(bounds, false);
    const cover = map.getBoundsZoom(bounds, true);

    // Se acota la navegacion al dominio con un margen: fuera de el no hay
    // datos, y alejarse mas solo mostraria vacio.
    map.setMinZoom(fit);
    map.setMaxBounds(bounds.pad(MAP.padding / 100));
    // Cuanto mas apaisado es el marco, mas se acerca el encuadre al que
    // cubre; encajarlo entero dejaria franjas vacias a los lados.
    const size = map.getSize();
    const wide = Math.min(1, Math.max(0, size.x / size.y - 1));
    map.setView(bounds.getCenter(), Math.min(fit + (cover - fit) * (0.45 + 0.25 * wide), MAP.maxZoom));
  }

  /** Sonda que sigue al puntero: modelo, mes, valor y posicion del punto. */
  function report(event) {
    const { a, b } = sides;
    if (!a.grid) return hide();

    const point = map.latLngToContainerPoint(event.latlng);
    const side = swipe && point.x > map.getSize().x * swipe.ratio() && b.grid ? b : a;
    const bin = side.layer?.valueAt(event.latlng);
    if (bin == null) return hide();

    const units = side.grid.title.match(/\(([^)]+)\)/)?.[1] ?? "";
    clear(readout).append(
      el("span", { class: "readout__head", text: `${side.label} · ${side.grid.months[index]}` }),
      el("strong", { class: "readout__value", text: describeAnomaly(side.grid.scale, bin, side.variable) }),
      el("span", { class: "readout__kind", text: describeBin(side.grid.scale, bin, units) }),
      el("span", { class: "readout__place", text: formatLatLng(event.latlng) }),
    );

    dot.hidden = false;
    dot.style.transform = `translate(${point.x}px, ${point.y}px)`;
  }

  // la ultima lectura se queda en la franja; solo desaparece la marca
  function hide() { dot.hidden = true; }

  map.on("mousemove", report);
  map.on("click", report);
  map.on("mouseout", hide);
  map.on("movestart zoomstart", hide);

  const labelOf = (model, variable) =>
    `${MODELS.find((m) => m.id === model).label} · ${VARIABLES.find((v) => v.id === variable).short}`;

  async function open(key, model, variable) {
    const side = sides[key];
    stop();
    const ticket = ++side.request;
    if (key === "a") clear(legendNode).append(spinner("Cargando…"));

    let data;
    try {
      data = await load(PATHS.grid(model, variable));
    } catch (error) {
      if (ticket !== side.request) return;
      clear(legendNode).append(errorBox("No se pudo cargar.", () => open(key, model, variable)));
      return;
    }

    if (ticket !== side.request) return;
    side.grid = data;
    side.label = labelOf(model, variable);
    side.variable = variable;

    if (side.layer) map.removeLayer(side.layer);
    side.layer = new GridLayer(data.grid, data.scale.map((bin) => bin.color), data.scale);
    side.layer.setSmooth(smooth);
    side.layer.addTo(map);
    borders?.bringToFront();
    labels.bringToFront();

    if (!framed) {
      frame(data.grid);
      framed = true;
    }
    domain = data.grid;

    if (index >= data.months.length) index = 0;
    side.layer.setFrame(data.frames[index]);
    applyClip();
    renderTimeline();
    renderLegend();
    updateAnalysis();
  }

  function closeSide() {
    sides.b.request += 1;
    if (sides.b.layer) map.removeLayer(sides.b.layer);
    sides.b = { grid: null, layer: null, request: sides.b.request };
    swipe?.remove();
    swipe = null;
    applyClip();
    renderLegend();
  }

  function compare(enabled) {
    if (!enabled) return closeSide();
    if (swipe) return;
    swipe = createSwipe(map, applyClip);
    applyClip();
  }

  function setSmooth(enabled) {
    smooth = enabled;
    for (const side of Object.values(sides)) side.layer?.setSmooth(enabled);
  }

  return {
    open,
    compare,
    setSmooth,
    summarize: (visible) => {
      analysis.hidden = !visible;
      container.classList.toggle("viewer--summary", visible);
      updateAnalysis();
      requestAnimationFrame(() => map.invalidateSize());
    },
    stop,
    invalidate: () => {
      map.invalidateSize();
      // el primer encuadre puede caer antes de que el contenedor tenga su
      // tamano final; al estabilizarse se recalcula una sola vez
      const size = map.getSize();
      if (domain && sized !== `${size.x}x${size.y}`) {
        sized = `${size.x}x${size.y}`;
        frame(domain);
      }
      applyClip();
    },
    destroy: () => {
      stop();
      dropFullscreen?.();
      map.remove();
    },
  };
}
