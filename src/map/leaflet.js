import { PATHS } from "../config.js";

let loader = null;

/**
 * Leaflet solo lo usa el visor estacional, pero antes se cargaba de golpe en
 * la cabecera del documento: ciento cuarenta y cuatro kilobytes que habia que
 * bajar, analizar y ejecutar antes de pintar nada, tambien para quien solo
 * venia a leer la descripcion. Aqui llega cuando hace falta, igual que Plotly.
 *
 * La hoja de estilos si va en el documento: son catorce kilobytes de los que
 * depende la colocacion del mapa, y traerla despues abriria el visor descuadrado.
 */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);

  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PATHS.leaflet;
      script.onload = () => resolve(window.L);
      script.onerror = () => { loader = null; reject(new Error("No se pudo cargar Leaflet")); };
      document.head.append(script);
    });
  }
  return loader;
}

/**
 * El visor es la seccion principal del sitio, asi que su motor se trae en
 * cuanto el navegador queda ocioso: no estorba a la primera pintura y para
 * cuando alguien pica "Estacional" casi siempre esta ya en memoria.
 */
export function warmLeaflet() {
  const traer = () => loadLeaflet().catch(() => { /* ya se reintenta al entrar */ });
  if (typeof requestIdleCallback === "function") requestIdleCallback(traer, { timeout: 4000 });
  else setTimeout(traer, 1200);
}
