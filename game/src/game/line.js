// Belt lines (M3).
//
// A Line is a path of belt tiles. Belt P FEEDS belt C when C sits on the tile
// P faces (C's own direction may differ, so lines can turn corners). Each belt
// has at most one feeder (a belt pointing at it) and at most one follower
// (the belt it points at), so a line is a simple path: one head (no feeder),
// one tail (no follower).
//
// Two layers exist (M3): z=0 ground belts and z=1 overhead belts (belt_high).
// Layers are independent: an overhead belt can cross a ground belt in the
// same tile. Lines never mix layers.
//
// Placement rules enforced in World.canPlace:
//   - no second feeder pointing at the new belt (two feeders = invalid)
//   - the belt the new belt points at must not already be fed
//   - no directed cycle through the new belt (wouldCreateCycle)
//
// Incremental maintenance:
//   placeBelt  -> extend the head or tail of a neighbouring line, or start one
//   removeBelt -> remove a tile; if the tile was interior, the back half
//                 becomes a new line (split)
// rebuild() recomputes all lines from the world; cheap at our zone sizes.
//
// Invariants (tested):
//   1. Every belt tile belongs to exactly one line (per layer).
//   2. Each line is a simple path with one head and one tail.
//   3. Consecutive tiles agree: tile i faces tile i+1.

import { DIRS, tileKey } from "../core/grid.js";
import { Signals } from "../core/signals.js";

let _lineSeq = 1;

export class Line {
  constructor(id) {
    this.id = id;
    this.tiles = []; // [{key, x, y, z, dir}], head to tail
    this.links = new Map(); // key -> { prev, next }
  }

  get head() {
    return this.tiles.length ? this.tiles[0].key : null;
  }

  get tail() {
    return this.tiles.length ? this.tiles[this.tiles.length - 1].key : null;
  }

  get length() {
    return this.tiles.length;
  }

  has(key) {
    return this.links.has(key);
  }

  index(key) {
    const i = this.tiles.findIndex((t) => t.key === key);
    return i === -1 ? null : i;
  }

  tile(key) {
    const i = this.index(key);
    return i === null ? null : this.tiles[i];
  }

  keys() {
    return this.tiles.map((t) => t.key);
  }
}

export class LineManager {
  /**
   * @param {object} world  { beltAt(x,y,z) -> {dir}|null, allBelts() -> [{x,y,z,dir}] }
   * @param {Signals} [signals]
   */
  constructor(world, signals) {
    this.world = world;
    this.signals = signals || new Signals();
    this.lines = new Map(); // line id -> Line
    this.tileToLine = new Map(); // key -> Line
  }

  // ---- public API ------------------------------------------------------

  lineForTile(x, y, z = 0) {
    return this.tileToLine.get(tileKey(x, y, z)) || null;
  }

  allLines() {
    return [...this.lines.values()];
  }

  /** Find the belt on layer z that feeds (x, y). At most one (placement rule). */
  _feederAt(x, y, z) {
    for (const d of [0, 1, 2, 3]) {
      const b = this.world.beltAt(x - DIRS[d].dx, y - DIRS[d].dy, z);
      if (b && b.dir === d) return b;
    }
    return null;
  }

  /** Place a belt tile and maintain line membership. Returns the line. */
  placeBelt(x, y, z, dir) {
    z = z || 0;
    const key = tileKey(x, y, z);
    const feeder = this._feederAt(x, y, z);
    const follower = this.world.beltAt(x + DIRS[dir].dx, y + DIRS[dir].dy, z);
    const feederLine = feeder ? this.lineForTile(feeder.x, feeder.y, z) : null;
    const followerLine = follower ? this.lineForTile(follower.x, follower.y, z) : null;
    const tile = { key, x, y, z, dir };

    let line = null;
    if (feederLine || followerLine) {
      line = feederLine || followerLine;
      if (feederLine && followerLine && feederLine !== followerLine) {
        // splice the new tile between feederLine's tail and followerLine's head
        this.splice(feederLine, followerLine, tile);
      } else if (feederLine) {
        line.tiles.push(tile);
        const prevKey = line.tiles[line.tiles.length - 2].key;
        line.links.get(prevKey).next = key;
        line.links.set(key, { prev: prevKey, next: null });
      } else {
        line.tiles.unshift(tile);
        line.links.set(key, { prev: null, next: line.tiles[1].key });
        line.links.get(line.tiles[1].key).prev = key;
      }
      this.tileToLine.set(key, line);
    } else {
      line = this.makeLine([tile]);
    }

    this.signals.emit("lineChanged", { key, line, reason: "place" });
    return line;
  }

  /** Remove a belt tile and maintain line membership. */
  removeBelt(x, y, z) {
    z = z || 0;
    const key = tileKey(x, y, z);
    const line = this.tileToLine.get(key);
    if (!line) return null;

    const i = line.tiles.findIndex((t) => t.key === key);
    if (i === -1) return null;
    const prevKey = i > 0 ? line.tiles[i - 1].key : null;
    const nextKey = i < line.tiles.length - 1 ? line.tiles[i + 1].key : null;

    line.tiles.splice(i, 1);
    this.tileToLine.delete(key);

    if (line.tiles.length === 0) {
      this.lines.delete(line.id);
      this.signals.emit("lineChanged", { key, line: null, reason: "remove" });
      return null;
    }

    if (prevKey && nextKey) {
      // split: back half becomes a new line
      const backTiles = line.tiles.splice(i);
      this.relink(line);
      const back = this.makeLine(backTiles);
      this.signals.emit("lineChanged", { key, line, reason: "split", other: back });
      return back;
    }

    if (prevKey) line.links.get(prevKey).next = null;
    if (nextKey) line.links.get(nextKey).prev = null;
    this.signals.emit("lineChanged", { key, line, reason: "remove" });
    return line;
  }

  /** Recompute every line from the world. Cheap at our zone sizes. */
  rebuild() {
    this.lines.clear();
    this.tileToLine.clear();
    const belts = this.world.allBelts().map((m) => ({ x: m.x, y: m.y, z: m.z || 0, dir: m.r }));
    const byKey = new Map(belts.map((b) => [tileKey(b.x, b.y, b.z || 0), b]));
    const visited = new Set();

    const followerOf = (b) =>
      byKey.get(tileKey(b.x + DIRS[b.dir].dx, b.y + DIRS[b.dir].dy, b.z || 0)) || null;
    const hasFeeder = (b) =>
      belts.some(
        (f) =>
          (f.z || 0) === (b.z || 0) &&
          f.x + DIRS[f.dir].dx === b.x &&
          f.y + DIRS[f.dir].dy === b.y
      );

    for (const b of belts) {
      const key = tileKey(b.x, b.y, b.z || 0);
      if (visited.has(key) || hasFeeder(b)) continue; // heads only
      // walk head to tail
      const tiles = [];
      let cur = b;
      while (cur) {
        const ck = tileKey(cur.x, cur.y, cur.z || 0);
        if (visited.has(ck)) break; // cycle guard (should not happen)
        visited.add(ck);
        tiles.push({ key: ck, x: cur.x, y: cur.y, z: cur.z || 0, dir: cur.dir });
        cur = followerOf(cur);
      }
      this.makeLine(tiles);
    }
    this.signals.emit("lineChanged", { reason: "rebuild" });
  }

  // ---- internals -------------------------------------------------------

  makeLine(tiles) {
    const line = new Line("line_" + _lineSeq++);
    line.tiles = tiles.slice();
    this.relink(line);
    this.lines.set(line.id, line);
    for (const t of line.tiles) this.tileToLine.set(t.key, line);
    return line;
  }

  relink(line) {
    line.links.clear();
    for (let i = 0; i < line.tiles.length; i++) {
      line.links.set(line.tiles[i].key, {
        prev: i > 0 ? line.tiles[i - 1].key : null,
        next: i < line.tiles.length - 1 ? line.tiles[i + 1].key : null,
      });
    }
  }

  splice(feederLine, followerLine, tile) {
    feederLine.tiles.push(tile, ...followerLine.tiles);
    for (const t of followerLine.tiles) this.tileToLine.set(t.key, feederLine);
    this.tileToLine.set(tile.key, feederLine);
    this.lines.delete(followerLine.id);
    this.relink(feederLine);
  }
}

/**
 * Would placing a belt at (x, y, z) facing `dir` close a directed loop?
 * The new belt feeds its follower. A cycle exists iff some belt in the
 * follower chain faces the new belt's tile (completing the loop).
 */
export function wouldCreateCycle(world, x, y, z, dir) {
  z = z || 0;
  const d = DIRS[dir];
  let b = world.beltAt(x + d.dx, y + d.dy, z);
  if (!b) return false;
  for (let i = 0; i < 10000; i++) {
    if (b.x + DIRS[b.dir].dx === x && b.y + DIRS[b.dir].dy === y) return true;
    b = world.beltAt(b.x + DIRS[b.dir].dx, b.y + DIRS[b.dir].dy, z);
    if (!b) return false;
  }
  return true; // pathologically long chain; treat as invalid
}
