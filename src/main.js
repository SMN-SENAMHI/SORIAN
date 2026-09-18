import { register, start } from "./router.js";
import { buildHeader, buildFooter } from "./ui/nav.js";
import { warmLeaflet } from "./map/leaflet.js";
import inicio from "./views/inicio.js";
import enso from "./views/enso.js";
import estacional from "./views/estacional.js";
import descripcion from "./views/descripcion.js";
import consultas from "./views/consultas.js";

// mismo orden que el menu, para que se puedan leer a la par
register("inicio", inicio);
register("enso", enso);
register("estacional", estacional);
register("descripcion", descripcion);
register("consultas", consultas);

const app = document.getElementById("app");
const outlet = document.createElement("main");
outlet.className = "outlet";
outlet.id = "contenido";

app.append(buildHeader(), outlet, buildFooter());
start(outlet, "inicio");
warmLeaflet();
