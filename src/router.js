import { errorBox, spinner } from "./ui/dom.js";

const routes = new Map();
let outlet = null;
let current = null;
// cada resolucion toma numero: si mientras espera se pide otra seccion, la
// suya deja de ser la ultima y se abandona sin haber tocado el contenedor
let pending = 0;

export function register(name, view) {
  routes.set(name, view);
}

export function start(node, fallback) {
  outlet = node;
  const go = () => resolve(routeName() || fallback);
  window.addEventListener("hashchange", go);
  go();
}

/** El hash admite parametros: #estacional?modelo=bom&variable=tpara */
export function routeName() {
  return location.hash.slice(1).split("?")[0];
}

export function routeParams() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}

export function navigate(name) {
  location.hash = name;
}

export function active() {
  return current;
}

async function resolve(name) {
  const view = routes.get(name);
  if (!view) return navigate("inicio");

  if (current?.name === name) return;

  const ticket = ++pending;

  /* Hay vistas que no pueden dibujar hasta que llegue su motor: el visor
     necesita Leaflet, que ya no viene en el documento. Se espera con la
     seccion anterior todavia en pantalla -vaciar el contenedor para quedarse
     en blanco mientras baja un script se lee como que la pagina se rompio- y
     solo despues se cambia, de modo que la vista sigue siendo sincrona y no
     puede montarse a medias sobre otra. */
  if (view.needs) {
    // al entrar directo por enlace no hay seccion anterior que mantener en
    // pantalla, asi que la espera se anuncia en vez de dejarlo todo en blanco
    if (!current) outlet.replaceChildren(spinner("Preparando el visor…"));
    try {
      await view.needs();
    } catch {
      if (ticket === pending) crashed(name);
      return;
    }
    if (ticket !== pending) return;
  }

  if (current?.destroy) current.destroy();
  outlet.replaceChildren();
  current = null;

  const instance = await view(outlet);
  current = { name, ...instance };
  outlet.scrollTop = 0;
  enter(outlet);
  window.dispatchEvent(new CustomEvent("route:changed", { detail: name }));
}

/** No llego lo que la seccion necesitaba: se ofrece volver a intentarlo. */
function crashed(name) {
  if (current?.destroy) current.destroy();
  current = null;
  outlet.replaceChildren(
    errorBox("No se pudo cargar esta sección. Revisa la conexión.", () => resolve(name)),
  );
}

/** Reinicia la animacion de entrada aunque la clase ya estuviera puesta. */
function enter(node) {
  node.classList.remove("is-entering");
  void node.offsetWidth;
  node.classList.add("is-entering");
}
