import { decodeFrame } from "../data.js";
import { smoothField } from "./interpolate.js";
import { SMOOTH_FACTOR } from "../config.js";

const NO_DATA = 255;

/**
 * Dibuja una grilla regular sobre el mapa usando un unico canvas.
 * Sustituye las ~26.000 llamadas L.polygon() del visor original.
 */
export function createGridLayer(L) {
  return L.Layer.extend({
    initialize(grid, palette, scale) {
      this._grid = grid;
      this._palette = palette;
      this._scale = scale;
      this._frame = null;
      this._opacity = 0.75;
      this._clip = null;
      this._smooth = false;
      this._field = null;
    },

    onAdd(map) {
      this._map = map;

      // `leaflet-zoom-animated` no es decorativa: fija transform-origin en la
      // esquina superior izquierda y aporta la transicion del zoom. Sin ella
      // el lienzo se escala desde su centro mientras el resto del mapa lo
      // hace desde la esquina, y el campo se descoloca durante la animacion.
      this._animated = Boolean(map.options.zoomAnimation && L.Browser.any3d);
      this._canvas = L.DomUtil.create(
        "canvas",
        `grid-layer${this._animated ? " leaflet-zoom-animated" : ""}`,
      );

      this._ctx = this._canvas.getContext("2d");
      map.getPane("overlayPane").appendChild(this._canvas);
      map.on("moveend zoomend resize", this._render, this);
      if (this._animated) map.on("zoomanim", this._onZoomAnim, this);
      this._reset();
    },

    onRemove(map) {
      map.off("moveend zoomend resize", this._render, this);
      map.off("zoomanim", this._onZoomAnim, this);
      this._canvas.remove();
    },

    setFrame(base64) {
      this._frame = decodeFrame(base64);
      this._field = null;
      this._render();
    },

    /** Alterna entre la celda tal cual y el campo reconstruido. */
    setSmooth(enabled) {
      if (this._smooth === enabled) return;
      this._smooth = enabled;
      this._field = null;
      this._render();
    },

    setOpacity(value) {
      this._opacity = value;
      this._render();
    },

    /** Limita el dibujo a una banda horizontal (fracciones 0-1 del ancho). */
    setClip(from, to) {
      this._clip = from === null ? null : { from, to };
      this._render();
    },

    valueAt(latlng) {
      if (!this._frame) return null;
      const { lat0, lon0, dlat, dlon, ny, nx } = this._grid;
      const row = Math.floor((latlng.lat - lat0) / dlat);
      const col = Math.floor((latlng.lng - lon0) / dlon);
      if (row < 0 || row >= ny || col < 0 || col >= nx) return null;
      const index = this._frame[row * nx + col];
      return index === NO_DATA ? null : index;
    },

    _onZoomAnim(event) {
      const scale = this._map.getZoomScale(event.zoom, this._map.getZoom());
      const offset = this._map._latLngToNewLayerPoint(
        this._map.getBounds().getNorthWest(), event.zoom, event.center,
      );
      L.DomUtil.setTransform(this._canvas, offset, scale);
    },

    /**
     * Tamano del buffer en pixeles enteros. canvas.width descarta los
     * decimales, asi que con un devicePixelRatio fraccionario -zoom del
     * navegador, pantallas escaladas- hay que redondear antes de comparar:
     * de lo contrario la medida nunca coincide y el redibujo se reentra.
     */
    _buffer() {
      const size = this._map.getSize();
      const ratio = window.devicePixelRatio || 1;
      return { size, width: Math.round(size.x * ratio), height: Math.round(size.y * ratio) };
    },

    _reset() {
      const { size, width, height } = this._buffer();
      this._canvas.width = width;
      this._canvas.height = height;
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._render();
    },

    _render() {
      if (!this._map || !this._frame) return;

      const map = this._map;
      const { size, width, height } = this._buffer();
      if (!width || !height) return;
      if (this._canvas.width !== width || this._canvas.height !== height) return this._reset();

      L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([0, 0]));

      const ctx = this._ctx;
      ctx.setTransform(width / size.x, 0, 0, height / size.y, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      ctx.save();
      if (this._clip) {
        const from = this._clip.from * size.x;
        ctx.beginPath();
        ctx.rect(from, 0, this._clip.to * size.x - from, size.y);
        ctx.clip();
      }
      ctx.globalAlpha = this._opacity;

      const { lat0, lon0, dlat, dlon, ny, nx } = this._grid;

      if (this._smooth) {
        this._drawField(ctx, map);
        ctx.restore();
        return;
      }

      const bounds = map.getBounds();
      const firstRow = Math.max(0, Math.floor((bounds.getSouth() - lat0) / dlat));
      const lastRow = Math.min(ny - 1, Math.ceil((bounds.getNorth() - lat0) / dlat));
      const firstCol = Math.max(0, Math.floor((bounds.getWest() - lon0) / dlon));
      const lastCol = Math.min(nx - 1, Math.ceil((bounds.getEast() - lon0) / dlon));

      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let col = firstCol; col <= lastCol; col += 1) {
          const index = this._frame[row * nx + col];
          if (index === NO_DATA) continue;

          const topLeft = map.latLngToContainerPoint([lat0 + (row + 1) * dlat, lon0 + col * dlon]);
          const bottomRight = map.latLngToContainerPoint([lat0 + row * dlat, lon0 + (col + 1) * dlon]);

          ctx.fillStyle = this._palette[index];
          ctx.fillRect(
            topLeft.x, topLeft.y,
            Math.ceil(bottomRight.x - topLeft.x) + 0.5,
            Math.ceil(bottomRight.y - topLeft.y) + 0.5,
          );
        }
      }
      ctx.restore();
    },

    /**
     * El campo interpolado se cachea como bitmap y el escalado corre por
     * cuenta del compositor, de modo que el desplazamiento no recalcula nada.
     */
    _drawField(ctx, map) {
      const { lat0, lon0, dlat, dlon, ny, nx } = this._grid;

      if (!this._field) {
        const image = smoothField(this._frame, this._grid, this._scale, SMOOTH_FACTOR);
        const buffer = document.createElement("canvas");
        buffer.width = image.width;
        buffer.height = image.height;
        buffer.getContext("2d").putImageData(image, 0, 0);
        this._field = buffer;
      }

      const topLeft = map.latLngToContainerPoint([lat0 + ny * dlat, lon0]);
      const bottomRight = map.latLngToContainerPoint([lat0, lon0 + nx * dlon]);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        this._field,
        topLeft.x, topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y,
      );
    },
  });
}
