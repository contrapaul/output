// Belt line flow simulation (M3).
//
// Items on a line are an ordered array of { d, item } pairs, where d is the
// distance in tiles from the line's head measured along the path (lines may
// turn corners; each tile's direction tells where the next tile is).
//
// Per tick (30 Hz):
//   1. Hoppers try to emit at their belt tile (any distance along the line)
//      if the local spacing allows it.
//   2. Advance items from the TAIL forward, each clamped by min spacing
//      (0.63 tile) to the item ahead. Shared velocity: the total velocity
//      available this tick is beltRate * dt; each item consumes what it
//      needs, the rest carries forward to the next item.
//   3. If the tail item passes the line's end (distance >= line.length - 1)
//      and the next acceptor can take THAT item, eject it.
//
// Backpressure emerges naturally: a blocked tail item clamps the one behind
// it, all the way to the hopper. Nothing is ever silently dropped: an item
// only leaves a line when the acceptor can take that specific item.
//
// Conservation law: items in world = emitted - accepted - recycled.

import { CONFIG } from "../../core/config.js";
import { DIRS } from "../../core/grid.js";

const MIN_SPACING = CONFIG.MIN_SPACING; // 0.63 tiles

/**
 * A Line carries items. One per belt path (per layer).
 *
 * @param {Line} line      the structural line (from line.js)
 * @param {object} world   unused (kept for API stability)
 */
export class FlowLine {
  constructor(line, world) {
    this.line = line;
    this.world = world;
    this.items = []; // { d, item } sorted by d ascending
    this.velCarry = 0;
  }

  get head() {
    return this.line.head;
  }

  get tail() {
    return this.line.tail;
  }

  get length() {
    return this.line.length;
  }

  /**
   * Can a new item enter at distance d? Free if the nearest items on both
   * sides are at least MIN_SPACING away.
   */
  canAcceptAt(d) {
    let i = 0;
    while (i < this.items.length && this.items[i].d < d) i++;
    const after = this.items[i];
    const before = this.items[i - 1];
    if (after && after.d - d < MIN_SPACING) return false;
    if (before && d - before.d < MIN_SPACING) return false;
    return true;
  }

  /** Can a new item enter at the head (d=0)? */
  canAccept() {
    return this.canAcceptAt(0);
  }

  /**
   * Insert an item at distance d (head is 0). Caller may check canAcceptAt()
   * first; returns false if spacing does not allow it.
   */
  accept(itemId, d = 0) {
    if (d < 0) d = 0;
    if (d > this.length - 1) d = this.length - 1;
    if (!this.canAcceptAt(d)) return false;
    let i = 0;
    while (i < this.items.length && this.items[i].d < d) i++;
    this.items.splice(i, 0, { d, item: itemId });
    return true;
  }

  /**
   * Advance all items by `velocity` tiles, respecting spacing.
   *
   * @param {number} velocity  total tiles to move this tick (beltRate * dt)
   * @param {function} canEject  (itemId) => boolean, true if the acceptor
   *                             past the tail can take that specific item
   * @returns {string[]}  itemIds ejected (in order, first = furthest)
   */
  step(velocity, canEject) {
    velocity += this.velCarry;
    this.velCarry = 0;
    const ejected = [];
    const exitD = this.length - 1; // items exit when they reach the last tile

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const ahead = i + 1 < this.items.length ? this.items[i + 1].d : Infinity;
      let move = velocity;
      const maxBySpacing = ahead - MIN_SPACING - it.d;
      if (maxBySpacing < move) move = maxBySpacing;

      const maxByExit = exitD - it.d;
      if (maxByExit < move) move = maxByExit;

      if (move <= 0) {
        if (it.d >= exitD - 0.001 && canEject(it.item)) {
          this.items.splice(i, 1);
          ejected.push(it.item);
        }
        if (i === this.items.length - 1) {
          this.velCarry = velocity;
        }
        continue;
      }

      it.d += move;
      velocity -= move;
      if (velocity <= 0) break;

      if (it.d >= exitD - 0.001) {
        if (canEject(it.item)) {
          this.items.splice(i, 1);
          ejected.push(it.item);
        } else {
          it.d = exitD;
          this.velCarry = velocity;
          velocity = 0;
          break;
        }
      }
    }

    return ejected;
  }

  /**
   * Pixel position of the item at distance d along the path.
   * d is in [0, length - 1]; position d is the center of tile floor(d),
   * offset toward the next tile by the fractional part.
   */
  posAt(d, tileSize) {
    const tiles = this.line.tiles;
    if (!tiles.length) return { x: 0, y: 0, z: 0 };
    if (d < 0) d = 0;
    if (d > this.length - 1) d = this.length - 1;
    const i = Math.min(Math.floor(d), tiles.length - 1);
    const t = tiles[i];
    const off = Math.min(d - i, 1);
    const dir = DIRS[t.dir];
    return {
      x: (t.x + 0.5 + dir.dx * off) * tileSize,
      y: (t.y + 0.5 + dir.dy * off) * tileSize,
      z: t.z || 0,
    };
  }

  /**
   * Re-insert an item at the tail after a failed delivery. Spacing may be
   * temporarily violated if another item is also at the tail; step() clamps
   * movement so nothing overlaps or crashes.
   */
  requeueAtTail(itemId) {
    const d = Math.max(0, this.length - 1);
    this.items.push({ d, item: itemId });
    this.items.sort((a, b) => a.d - b.d);
  }

  /** Remove all items (e.g., when the line is destroyed). */
  clear() {
    this.items = [];
    this.velCarry = 0;
  }

  count() {
    return this.items.length;
  }
}
