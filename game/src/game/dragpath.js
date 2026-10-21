// Drag path builder (Phase 1): turns a mouse drag into a chain of tiles.
//
// The path grows as the pointer moves. When the pointer reaches a new tile,
// the path is extended from its last tile to the pointer with an L-shaped
// connector: first along the axis the path is already heading (so a straight
// drag stays straight and a turn makes one clean corner), then along the
// other axis. Many corners are possible in one drag.
//
// Back-tracking: moving onto a tile already in the path cuts the path back
// to that tile, so a player can "undo" part of a drag by moving back.
//
// Pure data, no world access: tests cover it directly.

import { DIRS } from "../core/grid.js";

/** Direction index (0..3) from tile a to the adjacent tile b. */
export function dirBetween(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (let d = 0; d < 4; d++) if (DIRS[d].dx === dx && DIRS[d].dy === dy) return d;
  return null;
}

export class DragPath {
  /**
   * @param {number} x  start tile
   * @param {number} y
   * @param {number} startDir  direction used for a one-tile path (the ghost rotation)
   */
  constructor(x, y, startDir = 0) {
    this.tiles = [{ x, y }];
    this.startDir = startDir;
  }

  get last() {
    return this.tiles[this.tiles.length - 1];
  }

  get length() {
    return this.tiles.length;
  }

  indexOf(x, y) {
    return this.tiles.findIndex((t) => t.x === x && t.y === y);
  }

  /** Move the pointer to tile (x, y). Returns true if the path changed. */
  moveTo(x, y) {
    const at = this.indexOf(x, y);
    if (at !== -1) {
      if (at === this.tiles.length - 1) return false;
      this.tiles.length = at + 1; // back-track
      return true;
    }
    const from = this.last;
    // heading of the current path; with one tile, prefer the longer axis
    let horizontalFirst;
    if (this.tiles.length >= 2) {
      const prev = this.tiles[this.tiles.length - 2];
      horizontalFirst = prev.y === from.y;
    } else {
      horizontalFirst = Math.abs(x - from.x) >= Math.abs(y - from.y);
    }
    const steps = [];
    let cx = from.x;
    let cy = from.y;
    const walkX = () => { while (cx !== x) { cx += Math.sign(x - cx); steps.push({ x: cx, y: cy }); } };
    const walkY = () => { while (cy !== y) { cy += Math.sign(y - cy); steps.push({ x: cx, y: cy }); } };
    if (horizontalFirst) { walkX(); walkY(); } else { walkY(); walkX(); }
    for (const s of steps) {
      const hit = this.indexOf(s.x, s.y);
      if (hit !== -1) this.tiles.length = hit + 1; // crossing itself: cut back
      else this.tiles.push(s);
    }
    return true;
  }

  /**
   * Tiles with the direction each belt should face: toward the next tile,
   * and the last tile keeps the direction of the final step. A one-tile path
   * uses startDir.
   */
  withDirs() {
    const t = this.tiles;
    if (t.length === 1) return [{ x: t[0].x, y: t[0].y, r: this.startDir }];
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const r = i < t.length - 1 ? dirBetween(t[i], t[i + 1]) : dirBetween(t[i - 1], t[i]);
      out.push({ x: t[i].x, y: t[i].y, r });
    }
    return out;
  }
}
