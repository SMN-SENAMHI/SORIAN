import { el, clear } from "./dom.js";

/**
 * Hoja inferior para pantallas compactas: las opciones se eligen a pulgar,
 * sobre una superficie que no compite con el mapa.
 */
export function createSheet(host) {
  const body = el("div", { class: "sheet__body" });
  const title = el("h2", { class: "sheet__title" });

  const panel = el("section", {
    class: "sheet__panel",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "sheet-title",
  }, [
    el("button", {
      class: "sheet__grip", type: "button",
      "aria-label": "Cerrar opciones", onClick: () => close(),
    }),
    title,
    body,
    el("button", { class: "sheet__done btn btn--primary", type: "button", text: "Listo", onClick: () => close() }),
  ]);

  title.id = "sheet-title";

  const root = el("div", { class: "sheet", hidden: true }, [
    el("div", { class: "sheet__scrim", onClick: () => close() }),
    panel,
  ]);
  host.append(root);

  let lastFocus = null;
  let closing = null;

  function open(heading, content) {
    clearTimeout(closing);
    lastFocus = document.activeElement;
    title.textContent = heading;
    clear(body).append(...[].concat(content));
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    document.addEventListener("keydown", onKey);
    panel.querySelector("button:not(.sheet__grip)")?.focus();
  }

  function close() {
    root.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    // se espera a que la hoja termine de bajar antes de retirarla del arbol
    closing = setTimeout(() => { root.hidden = true; }, 180);
    lastFocus?.focus();
  }

  function onKey(event) {
    if (event.key === "Escape") close();
  }

  return {
    open,
    close,
    isOpen: () => !root.hidden,
    remove: () => { clearTimeout(closing); document.removeEventListener("keydown", onKey); root.remove(); },
  };
}
