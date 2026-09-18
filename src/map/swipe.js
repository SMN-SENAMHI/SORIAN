import { el } from "../ui/dom.js";

const MIN = 0.04;
const MAX = 0.96;
const STEP = 0.04;

// Gestos que Leaflet escucha en el contenedor del mapa. La cortina vive
// dentro de ese contenedor, asi que cada uno se detiene en la guia: de lo
// contrario el mapa se desplaza bajo el dedo en vez de moverse la cortina.
const SWALLOW = ["mousedown", "touchstart", "touchmove", "dblclick", "wheel", "contextmenu"];

/**
 * Cortina de comparacion: una guia vertical arrastrable que reparte el mapa
 * entre dos capas. Responde a puntero, tacto y teclado.
 */
export function createSwipe(map, onMove) {
  const container = map.getContainer();
  let ratio = 0.5;
  let dragging = false;

  const handle = el("div", {
    class: "swipe__handle",
    role: "separator",
    tabindex: "0",
    "aria-label": "Ajustar comparación entre modelos",
    "aria-orientation": "vertical",
    "aria-valuemin": "0",
    "aria-valuemax": "100",
    onKeydown: (event) => {
      const delta = { ArrowLeft: -STEP, ArrowRight: STEP, Home: -1, End: 1 }[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      set(Math.abs(delta) === 1 ? (delta < 0 ? MIN : MAX) : ratio + delta);
    },
  }, [
    el("span", { class: "swipe__line", "aria-hidden": "true" }),
    el("span", { class: "swipe__grip", "aria-hidden": "true" }),
  ]);

  const root = el("div", { class: "swipe" }, [handle]);
  container.append(root);

  function set(next) {
    ratio = Math.min(MAX, Math.max(MIN, next));
    const percent = ratio * 100;
    handle.style.left = `${percent}%`;
    handle.setAttribute("aria-valuenow", Math.round(percent));
    onMove(ratio);
  }

  function moveTo(clientX) {
    const box = container.getBoundingClientRect();
    set((clientX - box.left) / box.width);
  }

  for (const type of SWALLOW) {
    handle.addEventListener(type, (event) => event.stopPropagation(), { passive: false });
  }

  handle.addEventListener("pointerdown", (event) => {
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("is-dragging");
    // el mapa deja de responder al gesto mientras dura el arrastre
    map.dragging.disable();
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    moveTo(event.clientX);
  });

  const release = (event) => {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture?.(event.pointerId);
    handle.classList.remove("is-dragging");
    map.dragging.enable();
  };
  handle.addEventListener("pointerup", release);
  handle.addEventListener("pointercancel", release);

  return {
    ratio: () => ratio,
    reset: () => set(0.5),
    remove: () => {
      if (dragging) map.dragging.enable();
      root.remove();
    },
  };
}
