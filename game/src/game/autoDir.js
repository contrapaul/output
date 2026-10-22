// Smart placement direction (polish pass P1, Paul's playtest 2026-10-22).
//
// Placing a piece should rarely need a rotation press. These functions look
// at the tiles around the target and answer "which way should this piece
// face?" from how the existing lines flow:
//
//   suggestBeltDir    join the one belt that feeds this tile (fixes the
//                     repair gap: delete a belt mid-run, tap once, the new
//                     belt continues the line instead of facing nowhere).
//   suggestMachineDir face so that its input ports sit against the feeders
//     (belts or hoppers pointing at the tile) and its output port sits
//     against the follower (a belt or machine that can take from it).
//
// Both return null when there is nothing to learn from the neighbourhood
// (fresh tile), so the caller keeps the player's own rotation. Pure world
// reads: no placement, no mutation. Tests: test/polish-p1.test.js.

import { DIRS } from "../core/grid.js";
import { isBelt } from "./build.js";
import { PORTS, localSide } from "./systems/process.js";

/**
 * Direction for a belt placed at (x, y, z) that joins the existing flow,
 * or null when the neighbourhood says nothing.
 */
export function suggestBeltDir(world, x, y, z = 0) {
  // the usual case: one belt already feeds this tile, continue its run
  for (let d = 0; d < 4; d++) {
    const src = world.machineAt(x - DIRS[d].dx, y - DIRS[d].dy, z);
    if (src && isBelt(src.t) && src.r === d) {
      return world.canPlace("belt", x, y, d, z) ? d : null;
    }
  }
  // no feeder: face the single belt that would take from us
  let found = null;
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const nb = world.machineAt(x + DIRS[d].dx, y + DIRS[d].dy, z);
    if (nb && isBelt(nb.t) && nb.r === d && world.canPlace("belt", x, y, d, z)) {
      n++;
      found = d;
    }
  }
  return n === 1 ? found : null;
}

/**
 * Facing for a machine of `type` placed at (x, y): the rotation whose input
 * ports sit against the feeders and whose output port sits against the
 * follower. Best effort when no rotation fits everything (most ports
 * satisfied wins, lowest rotation on a tie). Null when the neighbourhood is
 * empty or the type has no ports (generators).
 */
export function suggestMachineDir(world, type, x, y) {
  const p = PORTS[type];
  if (!p) return null;
  const feeders = []; // absolute directions (machine -> source) we must take from
  const followers = []; // absolute directions (machine -> target) we should deliver to
  for (let d = 0; d < 4; d++) {
    const nb = world.machineAt(x + DIRS[d].dx, y + DIRS[d].dy, 0);
    if (!nb) continue;
    const towardUs = (d + 2) % 4; // direction the neighbour must face to point at us
    if ((isBelt(nb.t) || nb.t === "hopper") && nb.r === towardUs) feeders.push(d);
    if (isBelt(nb.t)) {
      if (nb.r === d) followers.push(d); // a belt heading away takes from us
    } else if (PORTS[nb.t]?.in.length && PORTS[nb.t].in.includes(localSide(nb.r, towardUs))) {
      followers.push(d); // a machine whose input port faces us takes from us
    }
  }
  if (!feeders.length && !followers.length) return null;
  let best = null;
  let bestScore = -1;
  for (let r = 0; r < 4; r++) {
    let score = 0;
    for (const f of feeders) if (p.in.includes(localSide(r, f))) score += 2;
    for (const t of followers) if (p.out.includes(localSide(r, t))) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}
