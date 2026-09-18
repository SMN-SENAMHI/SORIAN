const cache = new Map();

export function load(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${response.status} al cargar ${url}`);
      return response.json();
    }).catch((error) => {
      cache.delete(url);
      throw error;
    }));
  }
  return cache.get(url);
}

export function decodeFrame(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Serie numerica de una figura de Plotly. Los JSON del ENSO traen los ejes en
 * base64 -el formato tipado que Plotly entiende-, y las vistas que dibujan con
 * la libreria no se enteran porque lo resuelve ella. La lamina de la portada
 * dibuja esa misma serie a mano, asi que aqui se deshace.
 */
const DTYPES = {
  f8: Float64Array, f4: Float32Array,
  i1: Int8Array, i2: Int16Array, i4: Int32Array,
  u1: Uint8Array, u2: Uint16Array, u4: Uint32Array,
};

export function decodeNumbers(value) {
  if (Array.isArray(value)) return value.map(Number);

  const View = DTYPES[value?.dtype];
  if (!View || typeof value.bdata !== "string") return [];
  return Array.from(new View(decodeFrame(value.bdata).buffer));
}
