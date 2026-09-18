import { el, clear } from "../ui/dom.js";
import { isCompact } from "../ui/media.js";

/** Agrupa las trazas por nombre de serie: un modelo aporta varias trazas. */
export function groupSeries(traces) {
  const groups = new Map();
  traces.forEach((trace, index) => {
    const name = trace.name;
    if (!name) return;
    if (!groups.has(name)) {
      groups.set(name, {
        name,
        color: trace.marker?.color ?? trace.line?.color ?? trace.fillcolor,
        indices: [],
      });
    }
    groups.get(name).indices.push(index);
  });
  return [...groups.values()].filter((group) => group.color);
}

/** Traduce el conjunto de series visibles a un restyle de Plotly. */
export function visibilityFor(groups, shown) {
  const updates = groups.flatMap((group) =>
    group.indices.map((index) => ({ index, visible: shown.has(group.name) })),
  );
  return {
    indices: updates.map((update) => update.index),
    visible: updates.map((update) => update.visible),
  };
}

/** Leyenda de solo lectura: una muestra de color por serie. */
export function staticLegend(node, items) {
  clear(node).append(...items.map((item) =>
    el("span", { class: "key__item" }, [
      el("span", { class: `key__swatch${item.area ? " key__swatch--area" : ""}`, style: `background:${item.color}` }),
      el("span", { text: item.name }),
    ]),
  ));
}

/**
 * Selector de series. Con todo visible, el primer clic aisla la serie elegida;
 * a partir de ahi cada clic suma o quita, de modo que la seleccion se arma
 * eligiendo lo que interesa en vez de descartando lo que no.
 *
 * Son una veintena de modelos, asi que la lista va plegada en pantalla
 * estrecha: desplegada empujaria el grafico fuera de la vista.
 */
export function seriesFilter(node, groups, onChange) {
  const names = groups.map((group) => group.name);
  let shown = new Set(names);

  const tally = el("strong");
  const all = el("button", {
    class: "series__action", type: "button", text: "Todos",
    onClick: () => set(new Set(names)),
  });
  const none = el("button", {
    class: "series__action", type: "button", text: "Limpiar",
    onClick: () => set(new Set()),
  });

  const items = groups.map((group) => ({
    name: group.name,
    button: el("button", {
      class: "series__item", type: "button", onClick: () => pick(group.name),
    }, [
      el("span", { class: "series__swatch", style: `background:${group.color}` }),
      el("span", { class: "series__name", text: group.name }),
    ]),
  }));

  const box = el("details", { class: "series__box" }, [
    el("summary", { class: "series__head" }, [
      el("span", { class: "series__count" }, [tally, ` de ${names.length} modelos`]),
      el("span", { class: "series__more", "aria-hidden": "true" }),
    ]),
    el("div", { class: "series__body" }, [
      el("div", { class: "series__actions" }, [all, none]),
      el("div", { class: "series__list" }, items.map((item) => item.button)),
    ]),
  ]);
  box.open = !isCompact();

  clear(node).append(box);

  function set(next) {
    shown = next;
    sync();
    onChange(shown);
  }

  function pick(name) {
    if (shown.size === names.length) return set(new Set([name]));

    const next = new Set(shown);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    set(next);
  }

  /** Solo refresca el estado: rehacer el DOM plegaria la lista en cada clic. */
  function sync() {
    tally.textContent = String(shown.size);
    all.disabled = shown.size === names.length;
    none.disabled = shown.size === 0;

    for (const { name, button } of items) {
      const active = shown.has(name);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  sync();
}
