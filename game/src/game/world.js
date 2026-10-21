// World: the set of placed machines/belts, keyed by tile + layer.
//
// M3: two layers. z=0 is the ground (machines, belts, hoppers, dock).
// z=1 is overhead: only belt_high may live there, and only over an empty
// tile or over a ground belt (never over a machine). Lines never mix layers.
//
// Placement rules for belt-like tiles (belt, belt_high), same layer only:
//   - the tile is empty on that layer
//   - at most one belt already points at the tile (a second feeder is
//     an invalid layout: a belt cannot take two inputs)
//   - the belt it points at (its follower) must not already be fed
//   - placing it must not close a directed belt loop (wouldCreateCycle)
//
// Machines and the dock occupy a single ground tile.

import { inZone, DIRS, tileKey } from "../core/grid.js";
import { Signals } from "../core/signals.js";
import { LineManager, wouldCreateCycle } from "./line.js";

const BELT_TYPES = new Set(["belt", "belt_high"]);

export class World {
  /**
   * @param {{w:number,h:number}} zone
   */
  constructor(zone) {
    this.zone = zone;
    this.signals = new Signals();
    this.machines = new Map(); // tileKey(x,y,z) -> { t, x, y, r, z }
    this.lines = new LineManager(this, this.signals);
  }

  // ---- world interface used by LineManager ----------------------------

  beltAt(x, y, z = 0) {
    const m = this.machineAt(x, y, z);
    if (!m) return null;
    return BELT_TYPES.has(m.t) ? { x: m.x, y: m.y, z, dir: m.r } : null;
  }

  allBelts() {
    const out = [];
    for (const m of this.machines.values()) if (BELT_TYPES.has(m.t)) out.push(m);
    return out;
  }

  // ---- placement API ---------------------------------------------------

  /** Count belts on layer z that point at (x, y). */
  _countFeeders(x, y, z) {
    let n = 0;
    for (const d of [0, 1, 2, 3]) {
      const b = this.beltAt(x - DIRS[d].dx, y - DIRS[d].dy, z);
      if (b && b.dir === d) n++;
    }
    return n;
  }

  canPlace(t, x, y, r, z = 0) {
    return this.placeError(t, x, y, r, z) === null;
  }

  /**
   * Why can `t` not go at (x, y, z) facing r? Returns a short grade 7
   * reason, or null when placement is allowed. Uses only machineAt/beltAt,
   * so a planning overlay (build.js) can reuse it for whole drag paths.
   */
  placeError(t, x, y, r, z = 0) {
    if (!inZone(x, y, this.zone)) return "outside the build area";
    if (this.machineAt(x, y, z)) return "that tile is taken";

    if (BELT_TYPES.has(t)) {
      if (t === "belt") {
        // ground belt: tile must be fully clear (no overhead on top)
        if (this.machineAt(x, y, 1)) return "an overhead belt is above this tile";
      } else {
        // overhead belt: over empty ground or over a ground belt only
        const ground = this.machineAt(x, y, 0);
        if (ground && !BELT_TYPES.has(ground.t)) return "overhead goes over empty space or a ground belt";
      }
      // no second feeder, follower must be unfed, no loop
      if (this._countFeeders(x, y, z) > 1) return "two belts cannot feed one belt";
      const fx = x + DIRS[r].dx;
      const fy = y + DIRS[r].dy;
      if (this.beltAt(fx, fy, z)) {
        if (this._countFeeders(fx, fy, z) > 0) return "two belts cannot feed one belt";
        if (wouldCreateCycle(this, x, y, z, r)) return "that would close a loop";
      }
      return null;
    }

    // machines and dock: ground layer only
    if (z !== 0) return "machines go on the ground";
    if (this.machineAt(x, y, 1)) return "an overhead belt is above this tile";
    return null;
  }

  place(t, x, y, r, z = 0, fixed = false) {
    if (!this.canPlace(t, x, y, r, z)) return null;
    const m = { t, x, y, r, z: z || 0 };
    if (fixed) m.fixed = true; // part of the contract: cannot be moved or removed
    this.machines.set(tileKey(x, y, z), m);
    if (BELT_TYPES.has(t)) this.lines.placeBelt(x, y, z, r);
    this.signals.emit("machinePlaced", m);
    return m;
  }

  remove(x, y, z = 0) {
    const key = tileKey(x, y, z);
    const m = this.machines.get(key);
    if (!m) return null;
    this.machines.delete(key);
    if (BELT_TYPES.has(m.t)) this.lines.removeBelt(x, y, m.z);
    this.signals.emit("machineRemoved", m);
    return m;
  }

  machineAt(x, y, z = 0) {
    return this.machines.get(tileKey(x, y, z)) || null;
  }

  /** All stacked tiles at (x, y), ground first. */
  stackAt(x, y) {
    const out = [];
    for (const z of [0, 1]) {
      const m = this.machineAt(x, y, z);
      if (m) out.push(m);
    }
    return out;
  }

  machinesList() {
    return [...this.machines.values()];
  }

  clear() {
    for (const [k] of this.machines) this.machines.delete(k);
    this.lines.rebuild();
    this.signals.emit("worldCleared");
  }
}
