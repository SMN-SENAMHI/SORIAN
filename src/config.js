export const MODELS = [
  { id: "ecmwf", label: "ECMWF", institution: "European Centre for Medium-Range Weather Forecasts" },
  { id: "bom", label: "BOM", institution: "Bureau of Meteorology, Australia" },
  { id: "ncep", label: "NCEP", institution: "NOAA / National Centers for Environmental Prediction" },
];

export const VARIABLES = [
  {
    id: "tpara", label: "Precipitación", short: "Precip.", units: "mm/mes",
    // Campo discontinuo en el espacio: interpolarlo sugiere transiciones
    // graduales donde el modelo no las resuelve, por eso no se suaviza
    // de forma predeterminada.
    continuous: false,
  },
  { id: "mx2t24a", label: "Temp. máxima", short: "T. máx", units: "°C", continuous: true },
  { id: "mn2t24a", label: "Temp. mínima", short: "T. mín", units: "°C", continuous: true },
];

// Submuestreo por celda al reconstruir el campo continuo.
export const SMOOTH_FACTOR = 8;

export const SIDES = [
  { id: "a", label: "Izquierda" },
  { id: "b", label: "Derecha" },
];

export const MAP = {
  center: [-15, -60],
  zoom: 4,
  minZoom: 2,
  maxZoom: 8,
  // Base sobria sin etiquetas, con la toponimia en una capa aparte que se
  // dibuja por encima de la grilla para que siga legible.
  tiles: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  subdomains: "abc",
  attribution: "&copy; Esri",
  // margen alrededor del dominio de datos, en grados
  padding: 6,
};

export const ANIMATION_INTERVAL = 1100;

export const PATHS = {
  grid: (model, variable) => `data/grids/${model}_${variable}.json`,
  borders: "data/geo/borders.json",
  enso: (chart) => `data/enso/${chart}.json`,
  plotly: "assets/vendor/plotly.min.js",
  leaflet: "assets/vendor/leaflet.js",
};
