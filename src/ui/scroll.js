const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Banda que entra por capas y, si se le da una capa de fondo, la desplaza
 * mas despacio que el texto, de modo que parece quedarse atras al bajar.
 *
 * El desplazamiento solo se calcula mientras la banda se ve: fuera de ella no
 * hay nada que mover, y escuchar el scroll todo el rato para recalcular una
 * posicion que nadie mira es justo lo que hace que estos efectos vayan a
 * tirones. Cada gesto ademas se agrupa en un fotograma, que es donde el
 * navegador puede aplicarlo sin forzar un reflujo de mas.
 *
 * El estado inicial oculto lo arma esta funcion, no la hoja de estilos: si el
 * modulo no llega a ejecutarse, la banda se ve entera y quieta en vez de
 * quedarse en blanco para siempre.
 */
export function layeredBand(section, layer = null, strength = 0.16) {
  let visible = false;
  let queued = false;

  if (!REDUCED.matches) section.classList.add("is-armed");

  function update() {
    queued = false;
    if (!visible || REDUCED.matches || !layer) return;

    const box = section.getBoundingClientRect();
    // -1 cuando la banda asoma por abajo, 0 en el centro, 1 al salir por arriba
    const progress = 1 - 2 * ((box.top + box.height / 2) / window.innerHeight);
    const shift = progress * strength * box.height;
    layer.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
  }

  function onScroll() {
    if (queued || !visible) return;
    queued = true;
    requestAnimationFrame(update);
  }

  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      visible = entry.isIntersecting;
      // una vez dentro se queda revelada: volver a ocultarla al salir haria
      // que la seccion parpadease cada vez que se pasa por delante
      if (entry.intersectionRatio > 0.15) section.classList.add("is-in");
    }
    update();
  }, { threshold: [0, 0.15, 0.5] });

  watcher.observe(section);
  // sin capa que desplazar no hay nada que recalcular al hacer scroll
  if (layer) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }

  return () => {
    watcher.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}
