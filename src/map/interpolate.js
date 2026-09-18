/**
 * Reconstruccion continua del campo a partir de la grilla de 1°.
 *
 * Se interpola el VALOR -el centro del intervalo de cada celda- y solo
 * despues se aplica el color: interpolar directamente en RGB mezclaria tonos
 * de la paleta divergente y produciria colores que no corresponden a ningun
 * valor.
 *
 * El suavizado es una representacion visual, no resolucion adicional: no
 * anade informacion que el modelo no haya producido.
 */

const NO_DATA = 255;

/** Muestras de la rampa de color. 1024 dejan el paso por debajo del ojo. */
const RAMP_STEPS = 1024;

function binCenters(scale) {
  return scale.map((bin) => (bin.min + bin.max) / 2);
}

function paletteRGB(scale) {
  return scale.map((bin) => [
    parseInt(bin.color.slice(1, 3), 16),
    parseInt(bin.color.slice(3, 5), 16),
    parseInt(bin.color.slice(5, 7), 16),
  ]);
}

/**
 * Rampa continua entre los colores de la escala.
 *
 * Encajar cada valor en su clase, como hace la leyenda, devolvia el campo a
 * catorce colores planos: por suave que fuera la forma de las manchas, el
 * color saltaba de golpe en cada frontera y el resultado parecia aterrazado.
 * Aqui el color se interpola entre las dos clases contiguas, asi que un valor
 * a medio camino recibe el tono a medio camino. Nunca aparece un color ajeno
 * a la paleta: la mezcla es siempre entre vecinos de una escala ordenada, que
 * es justo lo que ya dibuja la barra de la leyenda.
 */
function buildRamp(centers, rgb) {
  const lo = centers[0];
  const hi = centers[centers.length - 1];
  const ramp = new Uint8ClampedArray(RAMP_STEPS * 3);

  let k = 0;
  for (let i = 0; i < RAMP_STEPS; i += 1) {
    const value = lo + ((hi - lo) * i) / (RAMP_STEPS - 1);
    while (k < centers.length - 2 && value > centers[k + 1]) k += 1;

    const t = (value - centers[k]) / (centers[k + 1] - centers[k]);
    const a = rgb[k];
    const b = rgb[k + 1];
    ramp[i * 3] = a[0] + (b[0] - a[0]) * t;
    ramp[i * 3 + 1] = a[1] + (b[1] - a[1]) * t;
    ramp[i * 3 + 2] = a[2] + (b[2] - a[2]) * t;
  }

  return { ramp, lo, span: hi - lo };
}

const DEG = Math.PI / 180;

/** Web Mercator: latitud en grados -> ordenada proyectada. */
const toMercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));

/** Ordenada proyectada -> latitud en grados. */
const fromMercator = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;

/**
 * Catmull-Rom en una dimension. Frente a la bilineal, la pendiente no cambia
 * de golpe al cruzar un nodo, que es lo que dibujaba rombos y estrellas sobre
 * los centros de celda. Puede sobrepasar el rango de sus cuatro muestras; el
 * exceso se recorta al mapear a la rampa, que solo llega hasta los extremos.
 */
function cubic(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (p2 - p0) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (3 * p1 - p0 - 3 * p2 + p3) * t3
  );
}

/**
 * Devuelve un ImageData de (nx*factor) x (ny*factor) con el campo
 * interpolado. La fila 0 es la del norte.
 *
 * Las filas se reparten uniformemente en el espacio de Mercator, no en
 * grados: el bitmap se dibuja con un escalado lineal en pantalla, y un
 * muestreo uniforme en latitud desplazaria el campo al alejarse del ecuador.
 */
export function smoothField(frame, grid, scale, factor) {
  const { nx, ny, lat0, dlat } = grid;
  const centers = binCenters(scale);
  const { ramp, lo, span } = buildRamp(centers, paletteRGB(scale));

  const width = nx * factor;
  const height = ny * factor;
  const image = new ImageData(width, height);
  const out = image.data;

  const clampRow = (row) => (row < 0 ? 0 : row > ny - 1 ? ny - 1 : row);
  const clampCol = (col) => (col < 0 ? 0 : col > nx - 1 ? nx - 1 : col);

  const valueAt = (row, col) => {
    const index = frame[clampRow(row) * nx + clampCol(col)];
    return index === NO_DATA ? null : centers[index];
  };

  const mercTop = toMercator(lat0 + ny * dlat);
  const mercBottom = toMercator(lat0);
  const mercSpan = mercTop - mercBottom;

  // las cuatro filas del vecindario, reutilizadas en toda la fila de salida
  const patch = [0, 0, 0, 0];

  for (let y = 0; y < height; y += 1) {
    // el canvas crece hacia abajo y la grilla hacia el norte
    const lat = fromMercator(mercTop - ((y + 0.5) / height) * mercSpan);
    const gy = (lat - lat0) / dlat - 0.5;
    const row0 = Math.max(0, Math.min(ny - 1, Math.floor(gy)));
    const row1 = Math.min(ny - 1, row0 + 1);
    const fy = Math.max(0, Math.min(1, gy - row0));

    for (let x = 0; x < width; x += 1) {
      const gx = (x + 0.5) / factor - 0.5;
      const col0 = Math.max(0, Math.min(nx - 1, Math.floor(gx)));
      const col1 = Math.min(nx - 1, col0 + 1);
      const fx = Math.max(0, Math.min(1, gx - col0));

      const offset = (y * width + x) * 4;

      // el borde del dominio lo marcan las cuatro celdas que rodean al punto:
      // fuera de ellas no se pinta, para que la costa no se ensanche
      const v00 = valueAt(row0, col0);
      const v10 = valueAt(row0, col1);
      const v01 = valueAt(row1, col0);
      const v11 = valueAt(row1, col1);
      if (v00 === null || v10 === null || v01 === null || v11 === null) {
        out[offset + 3] = 0;
        continue;
      }

      let value;
      let complete = true;
      for (let j = 0; j < 4 && complete; j += 1) {
        let p0 = valueAt(row0 - 1 + j, col0 - 1);
        let p1 = valueAt(row0 - 1 + j, col0);
        let p2 = valueAt(row0 - 1 + j, col0 + 1);
        let p3 = valueAt(row0 - 1 + j, col0 + 2);
        if (p0 === null || p1 === null || p2 === null || p3 === null) complete = false;
        else patch[j] = cubic(p0, p1, p2, p3, fx);
      }

      if (complete) {
        value = cubic(patch[0], patch[1], patch[2], patch[3], fy);
      } else {
        // junto a la costa falta vecindario para la cubica: se cae a bilineal
        value =
          v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
          v01 * (1 - fx) * fy + v11 * fx * fy;
      }

      let step = Math.round(((value - lo) / span) * (RAMP_STEPS - 1));
      if (step < 0) step = 0;
      else if (step > RAMP_STEPS - 1) step = RAMP_STEPS - 1;

      out[offset] = ramp[step * 3];
      out[offset + 1] = ramp[step * 3 + 1];
      out[offset + 2] = ramp[step * 3 + 2];
      out[offset + 3] = 255;
    }
  }

  return image;
}
