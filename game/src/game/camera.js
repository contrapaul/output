// Camera: world (tile) coordinates <-> screen (canvas pixel) coordinates.
// Pan by drag or arrow keys, zoom by wheel. Clamped to zone + margin.

import { CONFIG } from "../core/config.js";

export class Camera {
  constructor(canvas, zone) {
    this.canvas = canvas;
    this.zone = zone;
    this.x = 0; // world px of the canvas top-left
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.4;
    this.maxZoom = 2.5;
    this._fit();
  }

  _fit() {
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const tile = CONFIG.TILE;
    const zw = cw / (this.zone.w * tile);
    const zh = ch / (this.zone.h * tile);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(zw, zh) * 0.9));
    const wpx = this.zone.w * tile * this.zoom;
    const hpx = this.zone.h * tile * this.zoom;
    this.x = (cw - wpx) / 2;
    this.y = (ch - hpx) / 2;
    this.clamp();
  }

  clamp() {
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const tile = CONFIG.TILE;
    const wpx = this.zone.w * tile * this.zoom;
    const hpx = this.zone.h * tile * this.zoom;
    const margin = 80;
    this.x = Math.min(Math.max(this.x, -wpx + margin), cw - margin);
    this.y = Math.min(Math.max(this.y, -hpx + margin), ch - margin);
  }

  screenToTile(sx, sy) {
    const wx = (sx - this.x) / this.zoom;
    const wy = (sy - this.y) / this.zoom;
    const tile = CONFIG.TILE;
    return { x: Math.floor(wx / tile), y: Math.floor(wy / tile), wx, wy };
  }

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToTile(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToTile(sx, sy);
    this.x += (after.wx - before.wx) * this.zoom;
    this.y += (after.wy - before.wy) * this.zoom;
    this.clamp();
  }

  center() {
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const tile = CONFIG.TILE;
    this.x = (cw - this.zone.w * tile * this.zoom) / 2;
    this.y = (ch - this.zone.h * tile * this.zoom) / 2;
    this.clamp();
  }
}
