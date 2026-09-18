/**
 * Pictogramas propios para las variables, sobre el hexagono que identifica
 * a SORIAN. Trazo uniforme para que se lean bien a tamano pequeno.
 */

const HEX = "M12 2.2 20.5 7v10L12 21.8 3.5 17V7z";

function svg(paths, extra = "") {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">
    <path d="${HEX}" opacity=".28"/>${paths}${extra}</svg>`;
}

export const ICONS = {
  // nube con lluvia
  tpara: svg(`
    <path d="M8.6 12.4a2.6 2.6 0 0 1 .3-5.2 3.5 3.5 0 0 1 6.6.8 2.2 2.2 0 0 1-.4 4.4z"/>
    <path d="M9.6 15.1v1.8M12 15.6v2.3M14.4 15.1v1.8"/>`),

  // termometro alto, con marca superior
  mx2t24a: svg(`
    <path d="M12.9 13.6V7.4a1.4 1.4 0 0 0-2.8 0v6.2a2.6 2.6 0 1 0 2.8 0z"/>
    <path d="M11.5 15.6v-4.4"/>
    <path d="M15.2 7.6h2.1M15.2 10.2h1.4"/>`),

  // termometro bajo, con copo
  mn2t24a: svg(`
    <path d="M12.9 13.6V7.4a1.4 1.4 0 0 0-2.8 0v6.2a2.6 2.6 0 1 0 2.8 0z"/>
    <path d="M11.5 15.6v-1.9"/>
    <path d="M16.4 6.6v3.2M15 7.4l2.8 1.6M17.8 7.4 15 9"/>`),
};

export const SIDE_ICONS = {
  // mitad izquierda y derecha rellenas: indican que lado se esta ajustando
  a: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2"
              fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M4.5 6.5h7v11h-7z" fill="currentColor"/>
      </svg>`,
  b: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2"
              fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12.5 6.5h7v11h-7z" fill="currentColor"/>
      </svg>`,
};

export const COMPARE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2"
          fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M4.5 6.5h7v11h-7z" fill="currentColor"/>
    <path d="M12 3.6v16.8" stroke="currentColor" stroke-width="1.5"/>
  </svg>`;

/** Celdas discretas frente a campo continuo */
export const SMOOTH_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2"
          fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M4 15.5c2.6 0 2.6-4 5.2-4s2.6 4 5.2 4 2.6-4 5.2-4"
          fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round"/>
    <path d="M8.2 5.5v13M12.4 5.5v13M16.6 5.5v13"
          stroke="currentColor" stroke-width=".75" opacity=".35"/>
  </svg>`;

/** Reparto del dominio entre clases de la escala */
export const SUMMARY_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2"
          fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M6.5 9h9M6.5 12h6M6.5 15h11"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

export const EXPAND_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

export const COLLAPSE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

/** Flecha de los enlaces que llevan a una seccion. */
export const ARROW_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 12h13M12.5 6.5 19 12l-6.5 5.5"/></svg>`;
