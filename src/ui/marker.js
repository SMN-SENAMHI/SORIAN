import { el } from "./dom.js";

const STRETCH_MAX = 1.35;
// viaje, en pixeles, que ya da el estirado maximo
const REACH = 320;
const DURATION = 420;
const EASE = "cubic-bezier(.34, .84, .3, 1)";
// cuanto se pasa de largo antes de recogerse, en fraccion del viaje
const OVERSHOOT = 0.05;

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

// Los grupos se redibujan al cambiar la seleccion. Guardar el sitio de cada
// pastilla permite que la del grupo nuevo arranque donde quedo la anterior y
// el movimiento se lea como uno solo.
const lastPlace = new Map();

/**
 * Fotogramas de la gota.
 *
 * Antes la pastilla viajaba estirada de principio a fin y volvia a su forma
 * un rato despues de llegar, con un temporizador aparte: se leia como un
 * rectangulo que cambia de tamano, no como algo con masa. Aqui la deformacion
 * sigue al movimiento -se alarga al despegar, va mas estirada a media
 * trayectoria, se pasa de largo al llegar y se recoge-, que es el estirado y
 * aplastado de siempre. El volumen se conserva: lo que se alarga en un eje se
 * aplana en el otro.
 */
function dropletFrames(from, to) {
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const travel = Math.hypot(dx, dy);

  const stretch = Math.min(STRETCH_MAX, 1 + travel / REACH);
  const squash = 1 / (1 + (stretch - 1) * 0.62);
  // estos grupos son horizontales, pero el menu apilado no
  const flat = Math.abs(dx) >= Math.abs(dy);

  const at = (t, sx, sy, width, height) => ({
    width: `${width}px`,
    height: `${height}px`,
    transform:
      `translate(${from.left + dx * t}px, ${from.top + dy * t}px) scale(${sx}, ${sy})`,
  });

  const midWidth = (from.width + to.width) / 2;
  const midHeight = (from.height + to.height) / 2;
  const long = flat ? stretch : squash;
  const short = flat ? squash : stretch;

  return [
    { ...at(0, 1, 1, from.width, from.height), offset: 0 },
    { ...at(0.18, 1 + (long - 1) * 0.55, 1 - (1 - short) * 0.55, from.width, from.height), offset: 0.16 },
    { ...at(0.5, long, short, midWidth, midHeight), offset: 0.45 },
    { ...at(1 + OVERSHOOT, flat ? 0.94 : 1.05, flat ? 1.05 : 0.94, to.width, to.height), offset: 0.78 },
    { ...at(1, 1, 1, to.width, to.height), offset: 1 },
  ];
}

/**
 * Pastilla que viaja hasta la opcion activa deformandose por el camino.
 *
 * Devuelve la funcion que la lleva hasta el elemento activo.
 */
export function slidingMarker(track, key) {
  const marker = el("span", { class: "marker", "aria-hidden": "true" });
  track.prepend(marker);
  let current = null;

  const boxOf = (node) => ({
    left: node.offsetLeft, top: node.offsetTop,
    width: node.offsetWidth, height: node.offsetHeight,
  });

  /** Estado en reposo, sin deformacion: la del viaje va en los fotogramas. */
  const place = (box) => {
    marker.style.width = `${box.width}px`;
    marker.style.height = `${box.height}px`;
    marker.style.transform = `translate(${box.left}px, ${box.top}px)`;
  };

  /**
   * El sitio de la pastilla se guarda en pixeles, asi que deja de valer en
   * cuanto la pista cambia de ancho. Y cambia sola: al terminar de cargar el
   * grafico la pagina crece, aparece la barra de desplazamiento y la ventana
   * pierde unos pixeles, de modo que la pastilla se quedaba desplazada
   * respecto de la opcion activa sin que nadie hubiera tocado nada.
   *
   * El observador se desconecta el solo cuando su pastilla sale del arbol,
   * que es lo que ocurre cada vez que el grupo se vuelve a dibujar.
   */
  if (typeof ResizeObserver === "function") {
    let width = track.clientWidth;
    const observer = new ResizeObserver(() => {
      if (!marker.isConnected) return observer.disconnect();
      if (track.clientWidth === width || !current?.offsetWidth) return;

      width = track.clientWidth;
      const box = boxOf(current);
      lastPlace.set(key, box);
      // sin cancelar lo que este en vuelo: al cambiar de seccion la pagina
      // cambia de alto, aparece o se va la barra de desplazamiento y la pista
      // se estrecha unos pixeles justo cuando la pastilla acaba de salir.
      // Cancelar ahi mataba el viaje entero y la pastilla saltaba de golpe.
      // Al soltar la animacion, el elemento vuelve a este reposo ya corregido.
      place(box);
    });
    observer.observe(track);
  }

  return function moveTo(active) {
    if (!active?.offsetWidth) {
      current = null;
      marker.classList.remove("is-visible");
      return;
    }

    current = active;
    const to = boxOf(active);
    const from = lastPlace.get(key);
    lastPlace.set(key, to);
    marker.classList.add("is-visible");

    // el reposo se fija primero: si la animacion no corre o se cancela a
    // medio camino, la pastilla queda igualmente donde debe
    for (const running of marker.getAnimations()) running.cancel();
    place(to);

    if (!from || REDUCED.matches || typeof marker.animate !== "function") return;
    marker.animate(dropletFrames(from, to), { duration: DURATION, easing: EASE });
  };
}
