import { el } from "../ui/dom.js";

const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScr-U11-kX_mHNbk2Oyq-ceEjRxfkmrBvU7YEiJ2BpRgHZQrg/viewform?embedded=true";

export default function consultas(outlet) {
  outlet.append(
    el("header", { class: "view__header" }, [
      el("h1", { text: "Consultas y sugerencias" }),
      el("p", { class: "view__lead", text: "Este espacio recibe sugerencias técnicas, observaciones y solicitudes sobre el funcionamiento de SORIAN." }),
    ]),
    el("section", { class: "form-frame" }, [
      el("iframe", {
        src: FORM, title: "Formulario de consultas y sugerencias",
        loading: "lazy", class: "form-frame__iframe",
      }),
    ]),
  );
  return {};
}
