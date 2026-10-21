// Camera: world (tile) coordinates <-> screen (canvas pixel) coordinates.
// Pan by drag, zoom by wheel. Clamped to the zone plus a margin.
//
// Phase 2: zones have an origin (x, y) because the plot grows outward, and
// the camera can ease to a new view (the pull-out when new land opens).

import { CONFIG } from "../core/config.js";

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Camera {
  constructor(canvas, zone) {
    this.canvas = canvas;
    this.zone = zone;
    this.x = 0; // screen px of world (0, 0)
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.15;
    this.maxZoom = 2.5;
    this.anim = null;
    this._fit();
  }

  get cw() {
    return this.canvas.clientWidth || 800;
  }

  get ch() {
    return this.canvas.clientHeight || 600;
  }

  /**
   * Zoom and offset that show the whole zone, with a little room. The top
   * and bottom keep space for the HUD (order panel, toolbar).
   */
  fitFor(zone) {
    const tile = CONFIG.TILE;
    const top = 56;
    const bottom = 84;
    const h = Math.max(100, this.ch - top - bottom);
    const zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(this.cw / (zone.w * tile), h / (zone.h * tile)) * 0.94));
    const zx = (zone.x || 0) * tile * zoom;
    const zy = (zone.y || 0) * tile * zoom;
    return {
      zoom,
      x: (this.cw - zone.w * tile * zoom) / 2 - zx,
      y: top + (h - zone.h * tile * zoom) / 2 - zy,
    };
  }

  _fit() {
    Object.assign(this, this.fitFor(this.zone));
    this.clamp();
  }

  clamp() {
    if (this.anim) return;
    const tile = CONFIG.TILE * this.zoom;
    const z = this.zone;
    const left = (z.x || 0) * tile;
    const top = (z.y || 0) * tile;
    const margin = 80;
    // keep at least `margin` px of the zone on screen
    this.x = Math.min(Math.max(this.x, margin - left - z.w * tile), this.cw - margin - left);
    this.y = Math.min(Math.max(this.y, margin - top - z.h * tile), this.ch - margin - top);
  }

  screenToTile(sx, sy) {
    const wx = (sx - this.x) / this.zoom;
    const wy = (sy - this.y) / this.zoom;
    const tile = CONFIG.TILE;
    return { x: Math.floor(wx / tile), y: Math.floor(wy / tile), wx, wy };
  }

  /** Visible tile range (for drawing only what is on screen). */
  visibleTiles() {
    const a = this.screenToTile(0, 0);
    const b = this.screenToTile(this.cw, this.ch);
    return { x0: a.x - 1, y0: a.y - 1, x1: b.x + 1, y1: b.y + 1 };
  }

  pan(dx, dy) {
    this.anim = null;
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  zoomAt(sx, sy, factor) {
    this.anim = null;
    const before = this.screenToTile(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToTile(sx, sy);
    this.x += (after.wx - before.wx) * this.zoom;
    this.y += (after.wy - before.wy) * this.zoom;
    this.clamp();
  }

  center() {
    this.anim = null;
    this._fit();
  }

  /** Ease to show the whole of `zone` over `ms` milliseconds. */
  easeToZone(zone, ms = 2000) {
    this.zone = zone;
    const to = this.fitFor(zone);
    this.anim = { from: { x: this.x, y: this.y, zoom: this.zoom }, to, t: 0, ms };
  }

  /** Advance the camera animation. Call once per frame with seconds passed. */
  update(dt) {
    const a = this.anim;
    if (!a) return;
    a.t = Math.min(1, a.t + (dt * 1000) / a.ms);
    const k = ease(a.t);
    // interpolate zoom, and the world point at the screen center, so the
    // view pulls back smoothly instead of sliding sideways
    const zoom = a.from.zoom + (a.to.zoom - a.from.zoom) * k;
    const c0 = { x: (this.cw / 2 - a.from.x) / a.from.zoom, y: (this.ch / 2 - a.from.y) / a.from.zoom };
    const c1 = { x: (this.cw / 2 - a.to.x) / a.to.zoom, y: (this.ch / 2 - a.to.y) / a.to.zoom };
    const cx = c0.x + (c1.x - c0.x) * k;
    const cy = c0.y + (c1.y - c0.y) * k;
    this.zoom = zoom;
    this.x = this.cw / 2 - cx * zoom;
    this.y = this.ch / 2 - cy * zoom;
    if (a.t >= 1) this.anim = null;
  }
}
