// Build actions (Phase 1): plan and apply multi-tile placement and removal.
//
// planPlacement() checks a whole drag path BEFORE anything changes, using a
// planning overlay: a view of the world where earlier tiles of the path are
// already placed. World.placeError() runs on that overlay, so the preview
// uses exactly the same rules as real placement, tile by tile in order.
//
// Each planned tile gets an action:
//   place    empty tile, the piece will be placed
//   replace  a belt is already here facing another way; it is turned
//   keep     the same piece already sits here facing the same way
//   swap     a machine goes where a ground belt is (inserting it in a line);
//            the belt is removed first
//   invalid  cannot go here (reason says why); skipped, the rest still builds
//
// applyPlan() performs the actions in order and returns the ops it did, so
// the whole drag becomes one undo step (history.js).

import { tileKey } from "../core/grid.js";

const BELTS = new Set(["belt", "belt_high"]);

export function isBelt(t) {
  return BELTS.has(t);
}

/** A copy-on-write view of the world for checking a path in order. */
function makeOverlay(world) {
  const overlay = Object.create(world);
  const planned = new Map(); // key -> entry | null (null = hidden)
  overlay.machineAt = (x, y, z = 0) => {
    const key = tileKey(x, y, z);
    if (planned.has(key)) return planned.get(key);
    return world.machineAt(x, y, z);
  };
  overlay.set = (x, y, z, entry) => planned.set(tileKey(x, y, z), entry);
  return overlay;
}

/**
 * @param {World} world
 * @param {string} tool      machine type id
 * @param {Array<{x,y,r}>} tiles  from DragPath.withDirs()
 * @param {number} z         layer (1 for belt_high)
 * @returns {Array<{x,y,z,r,t,action,reason?,from?}>}
 */
export function planPlacement(world, tool, tiles, z = 0) {
  const overlay = makeOverlay(world);
  const plan = [];
  for (const { x, y, r } of tiles) {
    const here = overlay.machineAt(x, y, z);
    const entry = { x, y, z, r, t: tool };
    if (here) {
      if (here.t === tool && here.r === r) {
        plan.push({ ...entry, action: "keep" });
        continue;
      }
      if (isBelt(tool) && here.t === tool && !here.fixed) {
        overlay.set(x, y, z, null);
        const reason = overlay.placeError(tool, x, y, r, z);
        if (reason === null) {
          overlay.set(x, y, z, { t: tool, x, y, r, z });
          plan.push({ ...entry, action: "replace", from: here.r });
        } else {
          overlay.set(x, y, z, here);
          plan.push({ ...entry, action: "invalid", reason });
        }
        continue;
      }
      if (!isBelt(tool) && here.t === "belt" && z === 0 && !here.fixed) {
        overlay.set(x, y, z, null);
        const reason = overlay.placeError(tool, x, y, r, z);
        if (reason === null) {
          overlay.set(x, y, z, { t: tool, x, y, r, z });
          plan.push({ ...entry, action: "swap", from: here.r });
        } else {
          overlay.set(x, y, z, here);
          plan.push({ ...entry, action: "invalid", reason });
        }
        continue;
      }
      plan.push({ ...entry, action: "invalid", reason: "that tile is taken" });
      continue;
    }
    const reason = overlay.placeError(tool, x, y, r, z);
    if (reason === null) {
      overlay.set(x, y, z, { t: tool, x, y, r, z });
      plan.push({ ...entry, action: "place" });
    } else {
      plan.push({ ...entry, action: "invalid", reason });
    }
  }
  return plan;
}

/** Perform a plan on the game. Returns the ops done (for undo). */
export function applyPlan(game, plan) {
  const ops = [];
  for (const p of plan) {
    if (p.action === "place") {
      if (game.placeMachine(p.t, p.x, p.y, p.r, p.z)) {
        ops.push({ k: "place", t: p.t, x: p.x, y: p.y, r: p.r, z: p.z });
      }
    } else if (p.action === "swap") {
      if (!game.removeMachine(p.x, p.y, p.z)) continue;
      ops.push({ k: "remove", t: "belt", x: p.x, y: p.y, r: p.from, z: p.z });
      if (game.placeMachine(p.t, p.x, p.y, p.r, p.z)) {
        ops.push({ k: "place", t: p.t, x: p.x, y: p.y, r: p.r, z: p.z });
      } else {
        game.placeMachine("belt", p.x, p.y, p.from, p.z); // put it back
        ops.pop();
      }
    } else if (p.action === "replace") {
      if (game.rotateAt(p.x, p.y, p.z, p.r)) {
        ops.push({ k: "rotate", x: p.x, y: p.y, z: p.z, from: p.from, to: p.r });
      }
    }
  }
  return ops;
}

/** Every removable piece inside the rectangle, overhead first. */
export function piecesInArea(world, x0, y0, x1, y1) {
  const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
  const out = [];
  for (const z of [1, 0]) {
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) {
        const m = world.machineAt(x, y, z);
        if (m && !m.fixed) out.push(m);
      }
    }
  }
  return out;
}

/** Remove a list of pieces. Returns the ops done (for undo). */
export function removePieces(game, pieces) {
  const ops = [];
  for (const m of pieces) {
    const { t, x, y, r } = m;
    const z = m.z || 0;
    if (game.removeMachine(x, y, z)) ops.push({ k: "remove", t, x, y, r, z });
  }
  return ops;
}
