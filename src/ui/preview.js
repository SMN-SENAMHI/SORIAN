import { MODELS, PATHS, VARIABLES } from "../config.js";
import { load, decodeFrame } from "../data.js";
import { smoothField } from "../map/interpolate.js";
import { buildLegend } from "../map/legend.js";

/**
 * Submuestreo por celda. El campo va de fondo y difuminado, asi que no hace
 * falta el detalle del visor: lo que se busca es la forma de las manchas.
 * Solo vive en memoria la serie que se esta viendo.
 */
const FACTOR = 6;
const HOLD = 3400;
/** Lo que tarda un panel en desfragmentarse hacia el mes siguiente. */
const SWAP = 1200;
/** Lado del cuadrito, en pixeles de pantalla. */
const TILE = 54;
/** Desfase entre paneles, si algun dia vuelven a ser mas de uno. */
const STAGGER = 220;

/**
 * Modelos que se van turnando: cada vuelta de la serie pasa al centro
 * siguiente, de modo que la lamina acaba ensenando los tres sin que nadie
 * toque nada. Se reparten tantos como paneles haya, consecutivos, asi que con
 * un panel es un modelo por vuelta y con dos, dos centros del mismo mes.
 */
const modelsFrom = (turn, count) =>
  Array.from({ length: count }, (_, i) => MODELS[(turn + i) % MODELS.length].id);

const DEG = Math.PI / 180;
const toMercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Ventana minima, en grados: el Peru con margen. No es la ventana final: esa
 * se ensancha hasta la forma del hueco, de modo que el mapa lo llene entero
 * sin deformarse y sin dejar franjas muertas a los lados. Asi la misma lamina
 * sirve apaisada en el escritorio y vertical en el telefono.
 */
const CORE = { west: -82.5, east: -65.5, south: -19, north: 2 };

/** Ventana que llena un hueco de esta proporcion, dentro del dominio. */
function windowFor(ratio, grid) {
  const limit = {
    west: grid.lon0,
    east: grid.lon0 + grid.nx * grid.dlon,
    north: toMercator(grid.lat0 + grid.ny * grid.dlat),
    south: toMercator(grid.lat0),
  };

  let { west, east } = CORE;
  let north = toMercator(CORE.north);
  let south = toMercator(CORE.south);

  // se estira el lado corto; el otro ya cumple
  if ((east - west) * DEG / (north - south) < ratio) {
    const want = ((north - south) * ratio) / DEG;
    const half = (want - (east - west)) / 2;
    west -= half;
    east += half;
  } else {
    const want = ((east - west) * DEG) / ratio;
    const half = (want - (north - south)) / 2;
    north += half;
    south -= half;
  }

  // al topar con el borde del dominio se desplaza en vez de encogerse, para
  // no cambiar la proporcion que se acaba de calcular
  const slide = (lo, hi, min, max) => {
    if (lo < min) { hi += min - lo; lo = min; }
    if (hi > max) { lo -= hi - max; hi = max; }
    return [Math.max(lo, min), Math.min(hi, max)];
  };
  [west, east] = slide(west, east, limit.west, limit.east);
  [south, north] = slide(south, north, limit.south, limit.north);

  // Si al toparse con el borde del dominio la ventana perdio la proporcion
  // -pasa en bandas muy apaisadas, donde no hay tanto mundo a los lados-, se
  // recorta el eje que sobra en vez de deformar el campo: el mapa hace de
  // fondo y se comporta como un "cover".
  const wide = ((east - west) * DEG) / (north - south);
  if (wide > ratio) {
    const cut = ((east - west) - ((north - south) * ratio) / DEG) / 2;
    west += cut;
    east -= cut;
  } else if (wide < ratio) {
    const cut = ((north - south) - ((east - west) * DEG) / ratio) / 2;
    north -= cut;
    south += cut;
  }

  return { west, east, north, south };
}

/** Recorte del bitmap y proyeccion de la ventana sobre el lienzo. */
function framing(grid, win) {
  const top = toMercator(grid.lat0 + grid.ny * grid.dlat);
  const span = top - toMercator(grid.lat0);
  const lonSpan = grid.nx * grid.dlon;

  return {
    crop: {
      x: (win.west - grid.lon0) / lonSpan,
      y: (top - win.north) / span,
      w: (win.east - win.west) / lonSpan,
      h: (win.north - win.south) / span,
    },
    x: (lon, width) => ((lon - win.west) / (win.east - win.west)) * width,
    y: (lat, height) => ((win.north - toMercator(lat)) / (win.north - win.south)) * height,
  };
}

/**
 * Limites politicos: sin ellos el campo es una mancha sin pais. Van en su
 * propio lienzo, por encima del velo y sin desenfocar, de modo que el dato
 * queda de fondo y el pais, nitido.
 */
function drawBorders(canvas, geo, proj) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.lineJoin = "round";

  ctx.beginPath();
  for (const line of geo.geometry.coordinates) {
    line.forEach(([lon, lat], i) => {
      const px = proj.x(lon, width);
      const py = proj.y(lat, height);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
  }

  // Trazo con funda, como en cartografia: sobre el velo oscuro manda la linea
  // clara, y el reborde oscuro la despega de las manchas palidas.
  ctx.strokeStyle = "rgb(8 18 40 / 45%)";
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = "rgb(226 238 250 / 62%)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

/**
 * Orden en que se encienden los cuadritos. Cada panel lleva el suyo para que
 * no se muevan a la vez ni igual: el primero los reparte al azar -eso es la
 * desfragmentacion- y el segundo barre en diagonal con un temblor, de modo
 * que el frente no se lea como una regla bajando.
 */
function tileOrder(cols, rows, kind) {
  const list = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) list.push({ x, y });
  }

  if (kind % 2 === 0) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // El temblor se sortea una vez por cuadrito y se ordena por el resultado. Si
  // se sorteara dentro del comparador, dos llamadas con el mismo par darian
  // respuestas distintas y el orden dejaria de estar definido.
  return list
    .map((cell) => ({ cell, at: cell.x + cell.y + Math.random() * 1.7 }))
    .sort((a, b) => a.at - b.at)
    .map((item) => item.cell);
}

/**
 * Un panel: su lienzo de campo, su lienzo de limites y su propia
 * desfragmentacion. No decide que ensena -eso lo lleva el modulo de abajo-,
 * solo sabe traerlo, encuadrarlo y voltearlo.
 */
function createPanel({ canvas, outline }, index) {
  const ctx = canvas.getContext("2d");
  const cache = new Map();

  let grid = null;
  let win = null;
  let proj = null;
  let geo = null;
  let current = null;
  let order = null;
  let tile = 0;
  let raf = null;
  let alive = true;

  /** Un panel sin sitio en pantalla ni mide, ni carga, ni pinta. */
  const onScreen = () => canvas.getBoundingClientRect().width > 0;

  function measure() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !grid) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const node of [canvas, outline]) {
      if (!node) continue;
      node.width = Math.max(1, Math.round(box.width * dpr));
      node.height = Math.max(1, Math.round(box.height * dpr));
    }

    win = windowFor(box.width / box.height, grid);
    proj = framing(grid, win);
    tile = Math.max(24, Math.round(TILE * dpr));
    order = tileOrder(Math.ceil(canvas.width / tile), Math.ceil(canvas.height / tile), index);
    if (geo && outline) drawBorders(outline, geo, proj);
  }

  /** Trozo del campo que cae en un rectangulo del lienzo. */
  function blit(bitmap, dx, dy, dw, dh) {
    const { crop } = proj;
    ctx.drawImage(
      bitmap,
      (crop.x + (dx / canvas.width) * crop.w) * bitmap.width,
      (crop.y + (dy / canvas.height) * crop.h) * bitmap.height,
      (dw / canvas.width) * crop.w * bitmap.width,
      (dh / canvas.height) * crop.h * bitmap.height,
      dx, dy, dw, dh,
    );
  }

  function draw(from, to, progress) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    // Reescalado bilineal, no el de maxima calidad del visor. Aqui el campo se
    // amplia -donde el filtro caro no anade nada- y ademas sale difuminado 3 px
    // bajo un velo, asi que la diferencia no se puede ver; medida, costaba el
    // 42% del trabajo del hilo principal mientras corre la desfragmentacion.
    ctx.imageSmoothingQuality = "low";
    if (!from || progress >= 1) return blit(to, 0, 0, w, h);

    blit(from, 0, 0, w, h);

    // cada cuadrito tarda SPAN del total en encenderse, y los turnos se
    // reparten en lo que queda: asi siempre hay un frente a medio voltear
    const SPAN = 0.45;
    const turn = (1 - SPAN) / order.length;
    for (let k = 0; k < order.length; k += 1) {
      const mix = (progress - k * turn) / SPAN;
      // el orden es creciente: en cuanto uno no ha empezado, ninguno detras
      if (mix <= 0) break;

      const dx = order[k].x * tile;
      const dy = order[k].y * tile;
      const dw = Math.min(tile, w - dx);
      const dh = Math.min(tile, h - dy);
      if (dw <= 0 || dh <= 0) continue;

      ctx.globalAlpha = Math.min(1, mix);
      blit(to, dx, dy, dw, dh);
      if (mix < 1) {
        // destello al voltear: es lo que hace que el cambio se lea
        ctx.globalAlpha = (1 - mix) * 0.16;
        ctx.fillStyle = "#dbeaff";
        ctx.fillRect(dx, dy, dw, dh);
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    /** Trae la serie y deja el mes listo, sin tocar lo que se ve. */
    ready(model, variable, month) {
      if (!onScreen()) return Promise.resolve(null);
      return load(PATHS.grid(model, VARIABLES[variable].id)).then((set) => {
        if (!alive) return null;
        if (!grid) { grid = set.grid; measure(); }

        const key = `${model}:${variable}:${month}`;
        if (!cache.has(key)) {
          // solo vive en memoria la serie puesta: al cambiar de modelo o de
          // variable se suelta la anterior
          for (const old of [...cache.keys()]) {
            if (!old.startsWith(`${model}:${variable}:`)) cache.delete(old);
          }
          // Aqui el campo va suavizado siempre, tambien la precipitacion. En
          // el visor se dibuja por celdas porque lo publicado son clases y hay
          // que poder leerlas; esta lamina es un fondo desenfocado bajo un
          // velo, donde el escalonado solo se lee como pixelado.
          const image = smoothField(decodeFrame(set.frames[month]), set.grid, set.scale, FACTOR);
          const buffer = document.createElement("canvas");
          buffer.width = image.width;
          buffer.height = image.height;
          buffer.getContext("2d").putImageData(image, 0, 0);
          cache.set(key, buffer);
        }
        return { set, bitmap: cache.get(key) };
      }).catch(() => null);
    },

    /** Voltea el panel hacia el mes ya preparado. */
    run(bitmap, delay) {
      cancelAnimationFrame(raf);
      if (!proj) measure();
      if (!proj) return;

      const from = current;
      current = bitmap;
      canvas.classList.add("is-ready");
      if (!from || REDUCED.matches) return draw(null, bitmap, 1);

      const start = performance.now() + delay;
      const step = (now) => {
        if (!alive) return;
        const progress = Math.min(1, Math.max(0, (now - start) / SWAP));
        draw(from, bitmap, progress);
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },

    borders(shape) {
      geo = shape;
      if (proj && outline) drawBorders(outline, geo, proj);
    },

    resize() {
      cancelAnimationFrame(raf);
      measure();
      if (current && proj) draw(null, current, 1);
    },

    stop() {
      alive = false;
      cancelAnimationFrame(raf);
      cache.clear();
    },
  };
}

/**
 * Campo de pronostico de la portada, desfragmentandose de un mes al siguiente.
 *
 * No es una ilustracion: es el mismo archivo que sirve al visor, con su misma
 * escala. La serie corre mes a mes y, al dar la vuelta, cambia de variable y
 * de modelo, de modo que la portada acaba ensenando todo lo que hay dentro sin
 * que nadie toque nada. Admite varios paneles a la vez, cada uno con un centro
 * distinto del mismo mes.
 */
export function forecastPanel({ panels: nodes, legend, onState }) {
  const panels = nodes.map(createPanel);

  let variable = 0;
  let month = 0;
  let turn = 0;
  let months = [];
  let scale = null;
  let timer = null;
  let warmup = null;
  let visible = false;
  let alive = true;

  const modelsOf = (which) => modelsFrom(which, panels.length);

  /** Mes siguiente; al terminar la serie, variable y modelo siguientes. */
  function nextOf() {
    const wrap = month + 1 >= (months.length || 6);
    return [
      wrap ? (variable + 1) % VARIABLES.length : variable,
      wrap ? 0 : month + 1,
      wrap ? (turn + 1) % MODELS.length : turn,
    ];
  }

  /** Prepara el paso en los dos paneles y, cuando ambos lo tienen, lo enciende. */
  function step(toVariable, toMonth, toTurn) {
    const models = modelsOf(toTurn);
    return Promise.all(panels.map((panel, i) => panel.ready(models[i], toVariable, toMonth)))
      .then((got) => {
        if (!alive) return;
        const first = got.find(Boolean);
        // ningun panel a la vista, o la carga fallo: la portada sigue entera
        if (!first) return;

        variable = toVariable;
        month = toMonth;
        turn = toTurn;
        months = first.set.months;
        if (scale !== first.set.scale) {
          scale = first.set.scale;
          legend?.replaceChildren(buildLegend(scale));
        }

        onState?.({ variable: VARIABLES[variable].id, month: months[month], models });
        panels.forEach((panel, i) => got[i] && panel.run(got[i].bitmap, i * STAGGER));
        schedule();
      });
  }

  function schedule() {
    clearTimeout(timer);
    clearTimeout(warmup);
    if (!visible || REDUCED.matches) return;

    const [v, m, p] = nextOf();
    // el paso que viene se cocina durante la pausa: interpolarlo justo al
    // voltear costaria el primer fotograma y se veria el tiron
    const models = modelsOf(p);
    warmup = setTimeout(() => panels.forEach((panel, i) => panel.ready(models[i], v, m)), 60);
    timer = setTimeout(() => step(v, m, p), SWAP + STAGGER + HOLD);
  }

  step(0, 0, 0).then(() => {
    if (!alive) return;
    // los limites llegan despues y se pintan encima sin rehacer ningun campo
    return load(PATHS.borders).then((shape) => {
      if (alive) panels.forEach((panel) => panel.borders(shape));
    });
  }).catch(() => { /* la lamina es prescindible: sin ella el bloque sigue entero */ });

  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
    else clearTimeout(timer);
  }, { threshold: 0.1 });
  watcher.observe(nodes[0].canvas);

  // El recorte se recalcula con la forma del hueco: al cambiar de ancho no hay
  // que rehacer ningun campo, solo volver a encuadrarlo. Y si un panel aparece
  // al ensanchar la ventana, el paso siguiente ya se lo trae.
  //
  // Cada medida redimensiona dos lienzos, rehace el orden de los cuadritos y
  // repinta las fronteras. Arrastrando el borde de la ventana eso llega
  // decenas de veces por segundo, asi que se agrupa en un fotograma: al final
  // del arrastre lo que importa es la ultima medida, no todas.
  let pending = null;
  const onResize = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      if (alive) panels.forEach((panel) => panel.resize());
    });
  };
  window.addEventListener("resize", onResize);

  return {
    destroy: () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(warmup);
      cancelAnimationFrame(pending);
      watcher.disconnect();
      window.removeEventListener("resize", onResize);
      panels.forEach((panel) => panel.stop());
    },
  };
}
