import { el } from "./dom.js";
import { navigate } from "../router.js";
import { slidingMarker } from "./marker.js";

// Los visores van delante por ser el trabajo diario, y entre ellos manda el
// orden en que se lee el clima: primero el ENSO, que dice en que estado esta
// el Pacifico, y despues la prediccion estacional, que es lo que de ese estado
// se sigue. Detras la descripcion, que los explica. Consultas cierra: es a
// donde se va cuando lo anterior no resolvio, no por donde se empieza.
export const SECTIONS = [
  { id: "inicio", label: "Inicio" },
  { id: "enso", label: "ENSO" },
  { id: "estacional", label: "Estacional" },
  { id: "descripcion", label: "Descripción" },
  { id: "consultas", label: "Consultas" },
];

export function buildNav() {
  const links = SECTIONS.map((section) =>
    el("a", {
      class: "nav__link", href: `#${section.id}`, "data-route": section.id,
      text: section.label, onClick: () => close(),
    }),
  );

  const menu = el("nav", { class: "nav", id: "nav-main", "aria-label": "Navegación principal" }, links);
  const moveTo = slidingMarker(menu, "nav");

  const button = el("button", {
    class: "nav__burger", type: "button",
    "aria-label": "Abrir menú", "aria-expanded": "false", "aria-controls": "nav-main",
    onClick: () => toggle(),
  }, [el("span", { class: "nav__burger-bars", "aria-hidden": "true" })]);

  function toggle() {
    const open = menu.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }

  function close() {
    menu.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Abrir menú");
  }

  const activeLink = () => links.find((link) => link.classList.contains("is-active"));

  window.addEventListener("route:changed", (event) => {
    for (const link of links) {
      link.classList.toggle("is-active", link.dataset.route === event.detail);
      link.toggleAttribute("aria-current", link.dataset.route === event.detail);
    }
    requestAnimationFrame(() => moveTo(activeLink()));
  });

  // Solo el ancho recoloca la pastilla. En movil la barra del navegador se
  // repliega al desplazarse y emite un resize de solo alto: atenderlo obliga
  // a medir el menu en cada gesto de scroll sin que nada haya cambiado.
  let ancho = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === ancho) return;
    ancho = window.innerWidth;
    moveTo(activeLink());
  });

  return { menu, button };
}

/**
 * La A va sin travesano, como la de PEGASO. No es una fuente distinta: es una
 * lambda mayuscula, que en cualquier palo seco tiene el mismo trazo que una A
 * a la que le falta la barra.
 *
 * Como el signo no es una A, la palabra se anuncia como imagen con su nombre
 * real. Duplicar el texto para lector de pantalla tambien servia, pero al
 * copiar la pagina salia "SORIANSORIAN".
 */
export function wordmark(tag, cls) {
  return el(tag, { class: cls, role: "img", "aria-label": "SORIAN", text: "SORI\u039BN" });
}

export function buildHeader() {
  const { menu, button } = buildNav();

  return el("header", { class: "masthead" }, [
    el("div", { class: "masthead__bar" }, [
      el("a", { class: "brand", href: "#inicio", onClick: (event) => {
        // En pantalla completa la cabecera es rotulo, no navegacion: solo
        // quedan ENSO y Estacional, y picar la marca sacaria de la proyeccion
        // a una portada que ahi no pinta nada.
        if (document.fullscreenElement) return event.preventDefault();
        navigate("inicio");
      } }, [
        el("img", { class: "brand__mark", src: "assets/icon-192.png", alt: "", width: "192", height: "192" }),
        el("span", { class: "brand__logos" }, [
          el("img", { class: "brand__logo", src: "assets/logo-minam.png", alt: "Ministerio del Ambiente", width: "728", height: "150" }),
          el("img", { class: "brand__logo brand__logo--senamhi", src: "assets/logo-senamhi.png", alt: "SENAMHI", width: "350", height: "160" }),
        ]),
        el("span", { class: "brand__divider", "aria-hidden": "true" }),
        el("span", { class: "brand__name" }, [
          wordmark("strong", "brand__wordmark"),
          el("small", { class: "brand__full" }, [
            el("span", { class: "brand__full-long", text: "Sistema Operacional de Resolución Integrada para la Predicción del Clima" }),
            el("span", { class: "brand__full-short", text: "Predicción del clima" }),
          ]),
        ]),
      ]),
      menu,
      button,
    ]),
    el("div", { class: "masthead__scale", "aria-hidden": "true" }),
  ]);
}

/**
 * Pie de una sola linea: la marca, el aviso legal, el enlace a PEGASO y el
 * copyright. Antes eran dos filas separadas por un filete, con el nombre de
 * la subdireccion debajo de la marca; ciento cincuenta pixeles de pie para
 * cuatro datos que caben en un renglon. La navegacion ya esta en la cabecera
 * y repetirla aqui no aportaba.
 */
export function buildFooter() {
  return el("footer", { class: "footer" }, [
    el("div", { class: "footer__scale", "aria-hidden": "true" }),
    el("div", { class: "footer__inner" }, [
      wordmark("span", "footer__wordmark"),
      el("p", { class: "footer__note", text: "Resultados de modelos numéricos, de carácter referencial." }),
      el("a", {
        class: "footer__sibling",
        href: "https://smn-senamhi.github.io/PEGASO/",
        target: "_blank", rel: "noopener noreferrer",
      }, [
        el("span", { class: "footer__sibling-lead", text: "También del SENAMHI" }),
        el("span", { class: "footer__sibling-name", text: "PEGASO" }),
        el("span", { class: "footer__sibling-go", "aria-hidden": "true" }),
      ]),
      el("span", { class: "footer__meta", text: `© ${new Date().getFullYear()} SENAMHI · v1.0` }),
    ]),
  ]);
}
