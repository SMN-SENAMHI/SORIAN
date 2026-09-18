import { load } from "../data.js";
import { el, clear, spinner, errorBox } from "../ui/dom.js";

const SOURCE = "data/content/descripcion.json";

export default function descripcion(outlet) {
  const article = el("article", { class: "prose" }, [spinner()]);
  outlet.append(article);

  render();

  async function render() {
    let content;
    try {
      content = await load(SOURCE);
    } catch (error) {
      clear(article).append(errorBox("No se pudo cargar el contenido.", render));
      return;
    }

    clear(article).append(
      el("header", { class: "view__header" }, [
        el("h1", { text: "SORIAN v1.0" }),
        el("p", { class: "view__lead", text: "Sistema Operacional de Resolución Integrada para la Predicción del Clima" }),
      ]),
      ...content.intro.map((text) => el("p", { text })),

      el("h2", { text: content.models.title }),
      el("p", { text: content.models.lead }),
      table(content.models),

      el("h2", { text: content.regional.title }),
      el("p", { text: content.regional.lead }),
      el("ul", {}, content.regional.items.map((text) => el("li", { text }))),
      el("p", { text: content.regional.note }),

      el("h2", { text: "Referencias científicas" }),
      el("ol", { class: "refs" }, content.references.map(reference)),

      el("h2", { text: content.viewers.title }),
      ...content.viewers.groups.flatMap((group) => [
        el("h3", { text: group.name }),
        el("ul", {}, group.items.map((text) => el("li", { text }))),
      ]),
    );
  }
}

function table({ columns, rows }) {
  return el("div", { class: "table-wrap" }, [
    el("table", { class: "table" }, [
      el("thead", {}, [el("tr", {}, columns.map((label) => el("th", { scope: "col", text: label })))]),
      el("tbody", {}, rows.map((row) =>
        el("tr", {}, row.map((cell, i) =>
          el(i === 0 ? "th" : "td", i === 0 ? { scope: "row", text: cell } : { text: cell }),
        )),
      )),
    ]),
  ]);
}

function reference({ authors, title, doi }) {
  return el("li", { class: "ref" }, [
    el("span", { class: "ref__authors", text: authors }),
    el("cite", { class: "ref__title", text: title }),
    el("a", { class: "ref__doi", href: doi, target: "_blank", rel: "noopener noreferrer", text: doi }),
  ]);
}
