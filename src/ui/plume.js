import { PATHS } from "../config.js";
import { load, decodeNumbers } from "../data.js";
import { regionIn } from "../charts/regions.js";

/**
 * Serie de tiempo del ENSO en la portada: la anomalia observada entra
 * dibujandose mes a mes y, al llegar a la condicion inicial, el pronostico se
 * abre en abanico hacia toda la dispersion del ensamble.
 *
 * No es una ilustracion: es el mismo percentiles.json que sirve a la seccion
 * ENSO, con sus mismos percentiles. Lo que cambia es el papel que cumple
 * -aqui hace de reclamo, no de grafico de consulta-, y por eso se dibuja a
 * mano sobre un lienzo en vez de traer Plotly a la portada: la libreria pesa
 * 4,7 MB, mas que todo el resto de la pagina junto, y aqui no hace falta ni un
 * tooltip. El grafico completo, con sus dos regiones y sus 22 modelos, esta a
 * un clic.
 */

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Region que se ensena. El ENSO se publica en dos: Niño 3.4 gobierna la senal
 * global, pero Niño 1+2 es la franja de mar frente a la costa peruana -la que
 * decide las lluvias del norte-, asi que es la que abre la pagina. La figura
 * la reparte en dos ejes y esta es la del primero.
 */
const AXIS = "x";

/**
 * La paleta del grafico original esta hecha para papel blanco: el azul del
 * observado (#003f7d) y el granate del promedio (#7a0026) sobre el navy de la
 * banda serian dos manchas negras. Se conserva el reparto -azul para lo
 * medido, granate para lo predicho- subido de luz hasta que lee sobre fondo
 * oscuro, que es el mismo criterio con el que la lamina aclara los limites
 * politicos del mapa.
 */
const INK = {
  observed: "#7cb9f2",
  mean: "#f2919f",
  /** De la mas ancha a la mas estrecha: Pmin-Pmax, P10-P90, P25-P75. */
  bands: ["rgb(233 137 155 / 12%)", "rgb(233 137 155 / 20%)", "rgb(233 137 155 / 30%)"],
  ray: "rgb(238 150 166 / 42%)",
  grid: "rgb(226 238 250 / 8%)",
  axis: "rgb(226 238 250 / 22%)",
  pivot: "rgb(226 238 250 / 26%)",
  label: "rgb(226 238 250 / 52%)",
};

/**
 * Muestras de la leyenda, que se dibuja en HTML alrededor del lienzo. La de la
 * dispersion apila las tres bandas para decir que son bandas dentro de bandas,
 * y lo hace con mas alfa que el grafico: en el lienzo cada velo cubre cientos
 * de pixeles y basta con insinuarlo, pero en un cuadrito de 14 px con los
 * valores del grafico no se distinguiria del fondo.
 */
export const PLUME_KEY = [
  { label: "Observado", color: INK.observed },
  {
    label: "Dispersión del ensamble",
    area: true,
    color: `linear-gradient(180deg,
      rgb(233 137 155 / 22%) 0 20%, rgb(233 137 155 / 42%) 20% 36%,
      rgb(233 137 155 / 66%) 36% 64%, rgb(233 137 155 / 42%) 64% 80%,
      rgb(233 137 155 / 22%) 80% 100%)`,
  },
  { label: "Promedio multimodelo", color: INK.mean },
];

/**
 * Guion del reveal, en ms. Los tramos se solapan a proposito: el abanico
 * arranca antes de que la linea observada termine de asentarse y las bandas
 * antes de que las rayas lleguen, de modo que el conjunto se lee como un
 * movimiento y no como cinco pasos en fila.
 */
const T = {
  frame: [0, 640],
  observed: [260, 2200],
  pivot: [1880, 2420],
  rays: [2120, 2780],
  bands: [2560, 4500],
  mean: [2980, 4820],
  labels: [3300, 4300],
};

/** Aire alrededor del area de dibujo. A la izquierda cabe el rotulo del eje. */
const PAD = { left: 26, right: 12, top: 14, bottom: 24 };

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const ENGLISH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** El lienzo no resuelve var(--font): la pila va literal, la misma de base.css. */
const FACE = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

const EPS = 1e-9;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const phase = (now, [from, to]) => clamp01((now - from) / (to - from));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeSoft = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Trazas sin puntos: solo existen para poblar la leyenda de Plotly. */
const legendOnly = (trace) =>
  Array.isArray(trace.x) && trace.x.length > 0 && trace.x.every((value) => value == null);

const points = (trace) => ({ x: decodeNumbers(trace.x), y: decodeNumbers(trace.y) });

/** Valor de una serie en cualquier x, interpolando entre sus dos vecinos. */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];

  let i = 1;
  while (i < last && xs[i] < x) i += 1;
  const span = xs[i] - xs[i - 1];
  const mix = span ? (x - xs[i - 1]) / span : 0;
  return ys[i - 1] + (ys[i] - ys[i - 1]) * mix;
}

/** "&lt;b&gt;Aug 2024&lt;/b&gt;" a "Ago 2024". */
function monthLabel(html) {
  const plain = String(html ?? "").replace(/<[^>]+>/g, "").trim();
  return plain.replace(/^([A-Za-z]{3})[a-z]*/, (word, head) => {
    const found = ENGLISH.indexOf(head.toLowerCase());
    return found < 0 ? word : MONTHS[found];
  });
}

/** El mes desde el que corre la prediccion, que el titulo da como "202608". */
function initialCondition(title) {
  const found = String(title ?? "").match(/INICIAL\s*:?\s*(\d{4})(\d{2})/i);
  const month = found && MONTHS[Number(found[2]) - 1];
  return month ? `${month} ${found[1]}` : null;
}

/**
 * Serie observada, bandas de percentiles, abanico y promedio, sacados de la
 * figura por su forma y no por su color: las bandas son los unicos poligonos
 * cerrados, el abanico las unicas lineas discontinuas, y de las dos series con
 * marcador una termina donde la otra empieza. Asi un cambio de paleta en el
 * pipeline no deja la portada en blanco.
 */
function parse(figure) {
  const { layout } = figure;
  const mine = figure.data.filter((t) => (t.xaxis ?? "x") === AXIS && !legendOnly(t));

  const bands = mine
    .filter((trace) => trace.fill === "toself")
    .map((trace) => {
      // El poligono va y vuelve: la ida es un borde y la vuelta el otro. Cual
      // de los dos queda arriba no esta prometido en ninguna parte, asi que se
      // decide punto a punto.
      const { x, y } = points(trace);
      const half = Math.floor(x.length / 2);
      const back = y.slice(half).reverse();
      const front = y.slice(0, half);
      return {
        x: x.slice(0, half),
        upper: front.map((value, i) => Math.max(value, back[i] ?? value)),
        lower: front.map((value, i) => Math.min(value, back[i] ?? value)),
      };
    })
    .filter((band) => band.x.length > 1)
    .sort((a, b) => spread(b) - spread(a));

  if (!bands.length) return null;

  // Donde acaba lo medido y empieza lo predicho.
  const pivot = Math.min(...bands.map((band) => band.x[0]));
  const marked = mine.filter((t) => String(t.mode).includes("markers")).map(points);
  const observed = marked.find((serie) => Math.max(...serie.x) <= pivot + EPS);
  const mean = marked.find((serie) => Math.min(...serie.x) >= pivot - EPS);
  if (!observed || !mean) return null;

  const widest = bands[0];
  const xs = [...observed.x, ...widest.x];
  const ys = [...observed.y, ...widest.upper, ...widest.lower];
  const low = Math.min(...ys);
  const high = Math.max(...ys);
  // El original reserva de -3.5 a 5.0 para que las dos regiones compartan eje;
  // aqui solo hay una y el hueco es pequeno, asi que el rango sale del dato.
  const air = (high - low) * 0.1;

  return {
    observed,
    mean,
    bands,
    rays: mine.filter((trace) => trace.line?.dash === "dash").map(points),
    pivot,
    domain: { x0: Math.min(...xs), x1: Math.max(...xs), y0: low - air, y1: high + air },
    ticks: pickTicks(decodeNumbers(layout.xaxis?.tickvals), layout.xaxis?.ticktext, pivot),
    region: regionIn(layout.legend?.title?.text) ?? "Niño 1+2",
    initial: initialCondition(layout.title?.text),
  };
}

const spread = (band) =>
  band.upper.reduce((total, value, i) => total + (value - band.lower[i]), 0) / band.upper.length;

/**
 * Tres fechas y no dieciocho: el primer mes medido, el que abre la prediccion
 * y el ultimo pronosticado. En una banda de portada el eje completo se
 * encabalga; estas tres cuentan de donde viene la serie y hasta donde llega.
 */
function pickTicks(values, texts, pivot) {
  if (!values?.length || !texts?.length) return [];

  const labelled = values.map((x, i) => ({ x, label: monthLabel(texts[i]) }));
  const at = labelled.reduce((best, item) =>
    Math.abs(item.x - pivot) < Math.abs(best.x - pivot) ? item : best);

  return [labelled[0], at, labelled[labelled.length - 1]]
    .filter((item, i, list) => list.indexOf(item) === i);
}

export function ensemblePlume({ canvas, onState }) {
  const ctx = canvas.getContext("2d");

  let chart = null;
  let box = { width: 0, height: 0, dpr: 1 };
  let started = 0;
  let raf = null;
  let alive = true;
  /** Ultimo instante dibujado: lo que se repinta al cambiar de tamano. */
  let held = 0;
  let visible = false;

  function measure() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    box = { width: rect.width, height: rect.height, dpr };
    return true;
  }

  /** Proyeccion de los datos sobre el area de dibujo. */
  function projection() {
    const { x0, x1, y0, y1 } = chart.domain;
    const left = PAD.left;
    const right = box.width - PAD.right;
    const top = PAD.top;
    const bottom = box.height - PAD.bottom;
    return {
      top,
      bottom,
      left,
      right,
      x: (value) => left + ((value - x0) / (x1 - x0)) * (right - left),
      y: (value) => bottom - ((value - y0) / (y1 - y0)) * (bottom - top),
    };
  }

  /** Recorte de una polilinea hasta un indice fraccionario. */
  function upto(xs, ys, head) {
    const out = [];
    const last = Math.min(xs.length - 1, Math.floor(head));
    for (let i = 0; i <= last; i += 1) out.push([xs[i], ys[i]]);

    const rest = head - last;
    if (rest > 0 && last + 1 < xs.length) {
      out.push([
        xs[last] + (xs[last + 1] - xs[last]) * rest,
        ys[last] + (ys[last + 1] - ys[last]) * rest,
      ]);
    }
    return out;
  }

  function stroke(pairs, proj, { color, width, dash, glow = 0, alpha = 1 }) {
    if (pairs.length < 2) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (dash) ctx.setLineDash(dash);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }

    ctx.beginPath();
    pairs.forEach(([x, y], i) => {
      const px = proj.x(x);
      const py = proj.y(y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Marcadores que asoman detras del frente de dibujo. Cada uno crece en las
   * siete decimas de punto que siguen a su paso: sin eso la linea llega antes
   * que sus propios puntos y el trazo se lee pelado.
   */
  function dots(serie, proj, head, color, radius) {
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < serie.x.length; i += 1) {
      const pop = clamp01((head - i) / 0.7);
      if (pop <= 0) break;
      ctx.beginPath();
      ctx.arc(proj.x(serie.x[i]), proj.y(serie.y[i]), radius * easeOut(pop), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Banda abierta a medias. Dos progresos a la vez: uno barre hacia la derecha
   * desde la condicion inicial y el otro separa los bordes del promedio. Con
   * solo el barrido la banda entraria ya abierta, como una cortina; con solo la
   * separacion apareceria entera y se inflaria. Juntos es un abanico.
   */
  function openBand(band, cut, open, meanAt) {
    const xs = band.x.filter((x) => x <= cut);
    if (xs.length < band.x.length && cut > band.x[0]) xs.push(cut);
    if (xs.length < 2) return null;

    const edge = (list) => xs.map((x) => {
      const middle = meanAt(x);
      return middle + (interp(band.x, list, x) - middle) * open;
    });
    return { xs, top: edge(band.upper), bottom: edge(band.lower) };
  }

  function fill(shape, proj, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    shape.xs.forEach((x, i) => {
      const px = proj.x(x);
      const py = proj.y(shape.top[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    for (let i = shape.xs.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(proj.x(shape.xs[i]), proj.y(shape.bottom[i]));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Rejilla horizontal en pasos redondos, con el cero marcado aparte. */
  function grid(proj, alpha) {
    const { y0, y1 } = chart.domain;
    const step = niceStep(y1 - y0);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `500 10px ${FACE}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let value = Math.ceil(y0 / step) * step; value <= y1; value += step) {
      const py = Math.round(proj.y(value)) + 0.5;
      const zero = Math.abs(value) < step / 100;

      ctx.beginPath();
      ctx.setLineDash(zero ? [] : [2, 4]);
      ctx.strokeStyle = zero ? INK.axis : INK.grid;
      ctx.lineWidth = 1;
      ctx.moveTo(proj.left, py);
      ctx.lineTo(proj.right, py);
      ctx.stroke();

      ctx.fillStyle = INK.label;
      ctx.fillText(value.toFixed(0), proj.left - 7, py);
    }
    ctx.restore();
  }

  function axisLabels(proj, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.label;
    ctx.font = `600 10px ${FACE}`;
    ctx.textBaseline = "top";

    chart.ticks.forEach((tick, i) => {
      // los extremos se anclan por su canto para no salirse del lienzo
      ctx.textAlign = i === 0 ? "left" : i === chart.ticks.length - 1 ? "right" : "center";
      ctx.fillText(tick.label, proj.x(tick.x), proj.bottom + 8);
    });
    ctx.restore();
  }

  function draw(now) {
    held = now;
    ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);

    const proj = projection();
    const frame = phase(now, T.frame);
    grid(proj, easeOut(frame));

    // el eje del tiempo, que es el unico canto que este grafico necesita
    stroke([[chart.domain.x0, chart.domain.y0], [chart.domain.x1, chart.domain.y0]], proj, {
      color: INK.axis, width: 1, alpha: easeOut(frame),
    });

    const pivoted = phase(now, T.pivot);
    if (pivoted > 0) {
      ctx.save();
      ctx.globalAlpha = easeOut(pivoted);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = INK.pivot;
      ctx.lineWidth = 1;
      const px = Math.round(proj.x(chart.pivot)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, proj.top);
      ctx.lineTo(px, proj.bottom);
      ctx.stroke();
      ctx.restore();
    }

    const meanAt = (x) => interp(chart.mean.x, chart.mean.y, x);
    const spreading = phase(now, T.bands);
    if (spreading > 0) {
      const last = chart.bands[0].x[chart.bands[0].x.length - 1];
      chart.bands.forEach((band, i) => {
        // las anchas salen primero: el abanico se abre de fuera hacia dentro
        const own = clamp01((spreading - i * 0.12) / (1 - (chart.bands.length - 1) * 0.12));
        if (own <= 0) return;
        // El barrido va por delante de la apertura y llega al final antes de
        // tiempo: el frente es un canto recto de arriba abajo, y dejarlo
        // llegar justo al acabar lo convierte en lo ultimo que se ve. Asi el
        // ultimo tramo es solo la banda separandose del promedio.
        const cut = chart.pivot + (last - chart.pivot) * easeOut(clamp01(own * 1.4));
        const shape = openBand(band, cut, easeSoft(own), meanAt);
        if (shape) fill(shape, proj, INK.bands[i] ?? INK.bands[INK.bands.length - 1]);
      });
    }

    // El abanico de rayas: el puente entre el ultimo mes medido y los bordes
    // del ensamble. Es lo que ensena que la prediccion no arranca de un punto
    // sino que se abre desde el.
    const fanning = phase(now, T.rays);
    if (fanning > 0) {
      chart.rays.forEach((ray, i) => {
        const own = clamp01((fanning - (i / chart.rays.length) * 0.5) / 0.5);
        if (own <= 0) return;
        stroke(upto(ray.x, ray.y, easeOut(own) * (ray.x.length - 1)), proj, {
          color: INK.ray, width: 1.2, dash: [3, 3], alpha: own,
        });
      });
    }

    const averaged = phase(now, T.mean);
    if (averaged > 0) {
      const head = easeOut(averaged) * (chart.mean.x.length - 1);
      stroke(upto(chart.mean.x, chart.mean.y, head), proj, {
        color: INK.mean, width: 2.4, glow: 10,
      });
      dots(chart.mean, proj, head, INK.mean, 3);
    }

    const measured = phase(now, T.observed);
    if (measured > 0) {
      const head = easeOut(measured) * (chart.observed.x.length - 1);
      const trail = upto(chart.observed.x, chart.observed.y, head);
      stroke(trail, proj, { color: INK.observed, width: 2.4, glow: 10 });
      dots(chart.observed, proj, head, INK.observed, 2.6);

      // punta encendida mientras avanza: es lo que hace que se lea como que
      // la serie se esta escribiendo y no como una linea que aparece
      if (measured < 1 && trail.length) {
        const [x, y] = trail[trail.length - 1];
        ctx.save();
        ctx.fillStyle = "#eaf4ff";
        ctx.shadowColor = INK.observed;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(proj.x(x), proj.y(y), 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    axisLabels(proj, easeOut(phase(now, T.labels)));
  }

  function tick(stamp) {
    if (!alive || !chart) return;
    if (!started) started = stamp;

    const now = stamp - started;
    draw(now);
    if (now < T.mean[1]) raf = requestAnimationFrame(tick);
  }

  /** Arranca el reveal desde el principio; quieto, deja el estado final. */
  function play() {
    cancelAnimationFrame(raf);
    if (!chart || !measure()) return;

    if (REDUCED.matches) return draw(T.mean[1]);
    started = 0;
    raf = requestAnimationFrame(tick);
  }

  load(PATHS.enso("percentiles")).then((figure) => {
    if (!alive) return;
    chart = parse(figure);
    if (!chart) return;

    onState?.({ region: chart.region, initial: chart.initial });
    canvas.classList.add("is-ready");
    if (visible) play();
  }).catch(() => { /* la lamina es prescindible: sin ella el panel sigue entero */ });

  /**
   * El reveal se juega entero cada vez que la lamina vuelve a entrar en
   * pantalla, no en bucle: es una serie de tiempo, no un letrero, y repetirla
   * cada pocos segundos mientras alguien lee al lado convierte el argumento en
   * parpadeo. Quien baja y vuelve a subir la ve otra vez, que es cuando se
   * agradece.
   */
  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
    else cancelAnimationFrame(raf);
  }, { threshold: 0.25 });
  watcher.observe(canvas);

  // Al cambiar de ancho solo hay que volver a proyectar: el dato es el mismo.
  // Se repinta el instante en que se quedo, de modo que un arrastre del borde
  // de la ventana no reinicia una animacion que ya se vio.
  let pending = null;
  const sizer = new ResizeObserver(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      if (alive && chart && measure()) draw(held || T.mean[1]);
    });
  });
  sizer.observe(canvas);

  return {
    destroy: () => {
      alive = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      watcher.disconnect();
      sizer.disconnect();
    },
  };
}

/**
 * Paso de rejilla para que quepan unas cuatro lineas. Sin medios pasos: el eje
 * son grados de anomalia y a este tamano las marcas van sin decimales, asi que
 * un paso de 2,5 rotularia dos lineas distintas como "3" y "5".
 */
function niceStep(span) {
  const magnitude = 10 ** Math.floor(Math.log10(span / 4));
  // el candidato que deja un numero de lineas mas cerca de cuatro: quedarse
  // con el primero que pasa del paso ideal redondea siempre hacia arriba y el
  // eje acaba con dos marcas
  return [1, 2, 5, 10]
    .map((step) => step * magnitude)
    .reduce((best, step) => (Math.abs(span / step - 4) < Math.abs(span / best - 4) ? step : best));
}
