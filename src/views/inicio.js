import { el } from "../ui/dom.js";
import { wordmark } from "../ui/nav.js";
import { MODELS } from "../config.js";
import { layeredBand } from "../ui/scroll.js";
import { forecastPanel } from "../ui/preview.js";
import { ensemblePlume, PLUME_KEY } from "../ui/plume.js";
import { ARROW_ICON } from "../ui/icons.js";

/** Enlace a una seccion: rotulo y flecha en su propio disco. */
function gateway(label, href) {
  return el("a", { class: "gateway", href }, [
    el("span", { class: "gateway__label", text: label }),
    el("span", { class: "gateway__arrow", "aria-hidden": "true", html: ARROW_ICON }),
  ]);
}

export default function inicio(outlet) {
  outlet.append(
    el("section", { class: "hero" }, [
      el("div", { class: "hero__content" }, [
        el("p", { class: "hero__eyebrow", text: "SENAMHI · Subdirección de Cambio Climático y Modelamiento Atmosférico" }),
        el("h1", { class: "hero__title" }, [
          wordmark("span", "wordmark"),
        ]),
        // el nombre desplegado ya esta en la cabecera, y los dos botones
        // llevaban a las mismas dos secciones que las tarjetas de aqui debajo
        el("p", { class: "hero__text", text: "Información climática mensual y estacional para el Perú y Sudamérica, integrada desde los principales modelos globales de predicción." }),
      ]),
      el("div", { class: "hero__art", "aria-hidden": "true" }),
    ]),
  );

  /**
   * Las dos puertas de la plataforma, una al lado de la otra y cada una
   * ensenando su propio dato en marcha: no son rotulos con una flecha, son las
   * dos cosas que hay dentro. El menu ya dice a donde se puede ir; una tarjeta
   * que repita "Prediccion estacional" solo lo dice otra vez.
   *
   * A la izquierda, el campo del pronostico estacional desfragmentandose de un
   * mes al siguiente. A la derecha, la serie del ENSO escribiendose y abriendose
   * en abanico hacia la dispersion del ensamble. Son las dos maneras de mirar
   * el clima que ofrece la plataforma -un mapa y una serie de tiempo-, asi que
   * la portada las pone a la par en vez de jerarquizarlas.
   *
   * Ninguno de los dos paneles lleva mandos: la lamina ensena y va sola -el
   * campo cambia de variable y de modelo al dar la vuelta a la serie-, y para
   * manejarla esta el visor, a un clic. Tres capsulas para elegir variable
   * pedian una decision antes de haber contado de que trata la seccion.
   */
  const field = el("canvas", { class: "showcase__layer showcase__layer--field" });
  const outline = el("canvas", { class: "showcase__layer showcase__layer--lines" });

  const month = el("strong", { class: "showcase__month" });
  const model = el("span", { class: "showcase__model" });
  const legend = el("div", { class: "showcase__legend" });
  const openMap = gateway("Abrir en el visor", "#estacional");

  const plot = el("canvas", { class: "showcase__plot" });
  const region = el("span", { class: "showcase__model" });
  const initial = el("strong", { class: "showcase__month" });
  const openEnso = gateway("Abrir el monitoreo", "#enso");

  const panel = (kind, children) =>
    el("article", { class: `showcase__panel showcase__panel--${kind}` }, children);

  const head = (title, text) => el("header", { class: "showcase__head" }, [
    el("h2", { class: "showcase__title", text: title }),
    el("p", { class: "showcase__text", text }),
  ]);

  const band = el("section", { class: "showcase" }, [
    panel("map", [
      // El campo va en dos capas: desenfocado y bajo un velo porque aqui hace
      // de fondo -para leerlo esta el visor, a un clic-, y los limites
      // politicos nitidos encima, que es lo que evita que quede en mancha
      // abstracta.
      el("div", { class: "showcase__field", "aria-hidden": "true" }, [field, outline]),
      head("Predicción estacional", "Anomalías mensuales de precipitación y temperatura, resueltas por tres modelos globales."),
      el("div", { class: "showcase__foot" }, [
        el("p", { class: "showcase__stamp" }, [model, month]),
        legend,
        openMap,
      ]),
    ]),
    panel("enso", [
      head("Monitoreo ENSO", "Anomalía de la temperatura superficial del mar frente a la costa peruana, y su predicción multimodelo."),
      el("div", { class: "showcase__chart" }, [plot]),
      el("div", { class: "showcase__foot" }, [
        el("p", { class: "showcase__stamp" }, [region, initial]),
        el("div", { class: "showcase__legend showcase__legend--key" },
          PLUME_KEY.map((item) => el("span", { class: "key__item" }, [
            el("span", {
              class: `key__swatch${item.area ? " key__swatch--area" : ""}`,
              style: `background:${item.color}`,
            }),
            el("span", { text: item.label }),
          ]))),
        openEnso,
      ]),
    ]),
  ]);

  outlet.append(band);

  const nameOf = (id) => MODELS.find((item) => item.id === id)?.label ?? id;

  const forecast = forecastPanel({
    panels: [{ canvas: field, outline }],
    legend,
    onState: ({ variable, month: name, models }) => {
      month.textContent = name ?? "";
      model.textContent = `${nameOf(models[0])} · `;
      // El enlace lleva al visor con lo que se esta viendo, pero de una sola
      // prediccion: la lamina cuenta de que trata el visor, no pide entrar
      // comparando. Quien quiera partir el mapa tiene el boton dentro, y
      // llegar ya dividido esconde la vista normal antes de haberla visto.
      openMap.setAttribute("href", `#estacional?modelo=${models[0]}&variable=${variable}`);
    },
  });

  const plume = ensemblePlume({
    canvas: plot,
    onState: ({ region: name, initial: from }) => {
      region.textContent = `${name} · `;
      initial.textContent = from ? `Condición inicial ${from}` : "";
    },
  });

  // sin desplazamiento de fondo: la lamina va dentro de una tarjeta y moverla
  // por dentro la descuadraria de su propio marco
  const stopBand = layeredBand(band);

  return { destroy: () => { stopBand(); forecast.destroy(); plume.destroy(); } };
}
