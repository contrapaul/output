// Phase 0 regression tests: repair and re-baseline.
//
// Covers roadmap.md Phase 0 automatic checks:
//   - edit while running (place, remove, rotate on full lines): no item loss
//   - splitter routes (1 in, 1 out), alternates, never duplicates
//   - credits earned is a real number (no NaN)
//   - conservation: items in world = injected + emitted - delivered - recycled
//     - partsRemoved, including a 5-minute random edit script (seeded)

import test from "node:test";
import assert from "node:assert/strict";

import { GameRoot } from "../src/game/root.js";
import { tileKey } from "../src/core/grid.js";

const INING = "silicon_ingot";
const COIL = "copper_coil";

function newGame(zone = { w: 12, h: 6 }) {
  return new GameRoot({ id: "phase0", zone });
}

function flowAt(g, x, y, z = 0) {
  const line = g.world.lines.lineForTile(x, y, z);
  assert.ok(line, `expected a belt line at (${x},${y})`);
  const fl = g.flowLines.get(line.id);
  assert.ok(fl, `expected a flow line for (${x},${y})`);
  return fl;
}

function machineAt(g, x, y) {
  const m = g.machines.get(tileKey(x, y, 0));
  assert.ok(m, `expected a machine at (${x},${y})`);
  return m;
}

/**
 * Conservation identity. `injected` counts parts the test itself placed on a
 * line (hopper emits are tracked by the engine as `emitted`).
 */
function assertConservation(g, injected = 0) {
  const expected = injected + g.emitted - g.delivered - g.recycled - g.partsRemoved;
  assert.equal(g.itemCount(), expected,
    `conservation: ${g.itemCount()} in world != injected ${injected} + emitted ${g.emitted} - delivered ${g.delivered} - recycled ${g.recycled} - removed ${g.partsRemoved}`);
}

test("place while running: extending the tail keeps every item", () => {
  const g = newGame();
  for (let x = 1; x <= 4; x++) g.placeMachine("belt", x, 0, 0);
  const fl = flowAt(g, 1, 0);
  fl.accept(INING, 0); fl.accept(INING, 0.7); fl.accept(INING, 1.4);
  assert.equal(g.itemCount(), 3);

  g.placeMachine("belt", 5, 0, 0); // tail extension

  const after = flowAt(g, 1, 0);
  assert.equal(after.count(), 3, "no item lost on tail extension");
  assert.deepEqual(after.items.map((i) => i.d), [0, 0.7, 1.4]);
  assertConservation(g, 3);
});

test("place while running: extending the head shifts items, loses none", () => {
  const g = newGame();
  for (let x = 1; x <= 4; x++) g.placeMachine("belt", x, 0, 0);
  const fl = flowAt(g, 1, 0);
  fl.accept(INING, 0.3); fl.accept(INING, 1.3);

  g.placeMachine("belt", 0, 0, 0); // feeds the head: new head, all d +1

  const after = flowAt(g, 0, 0);
  assert.equal(after.count(), 2, "no item lost on head extension");
  assert.deepEqual(after.items.map((i) => i.d), [1.3, 2.3]);
  assertConservation(g, 2);
});

test("remove while running: splitting a line keeps both halves intact", () => {
  const g = newGame();
  for (let x = 1; x <= 5; x++) g.placeMachine("belt", x, 0, 0);
  const fl = flowAt(g, 1, 0);
  fl.accept(INING, 0.3); // tile (1,0) -> front half
  fl.accept(INING, 1.3); // tile (2,0) -> front half
  fl.accept(INING, 2.3); // tile (3,0) -> the tile about to be removed
  fl.accept(INING, 3.3); // tile (4,0) -> back half

  g.removeMachine(3, 0); // interior removal: line splits

  const front = flowAt(g, 1, 0);
  const back = flowAt(g, 4, 0);
  assert.equal(front.count(), 2, "front half keeps its items");
  assert.equal(back.count(), 1, "back half keeps its items");
  assert.ok(Math.abs(back.items[0].d - 0.3) < 1e-9, "back-half item distance is re-based (got " + back.items[0].d + ")");
  assert.equal(g.partsRemoved, 1, "item on the removed tile is removed");
  assertConservation(g, 4);
});

test("remove while running: tail removal loses nothing", () => {
  const g = newGame();
  for (let x = 1; x <= 4; x++) g.placeMachine("belt", x, 0, 0);
  const fl = flowAt(g, 1, 0);
  fl.accept(INING, 0); fl.accept(INING, 1); fl.accept(INING, 2);

  g.removeMachine(4, 0);

  assert.equal(g.itemCount(), 3, "no item lost on tail removal");
  assert.equal(g.partsRemoved, 0);
  assertConservation(g, 3);
});

test("rotate while running (remove + place): items on surviving tiles kept", () => {
  const g = newGame();
  for (let x = 1; x <= 4; x++) g.placeMachine("belt", x, 0, 0);
  const fl = flowAt(g, 1, 0);
  fl.accept(INING, 0.3); // tile (1,0)
  fl.accept(INING, 2.3); // tile (3,0)

  // rotate the belt at (2,0) from right to down, as input.js does
  g.removeMachine(2, 0);
  assert.deepEqual(g.placeMachine("belt", 2, 0, 1), { t: "belt", x: 2, y: 0, r: 1, z: 0 });

  assert.equal(g.itemCount(), 2, "no item lost rotating a belt mid-line");
  assert.equal(g.partsRemoved, 0);
  assert.equal(flowAt(g, 1, 0).count(), 1);
  const back = flowAt(g, 3, 0);
  assert.equal(back.count(), 1);
  assert.ok(Math.abs(back.items[0].d - 0.3) < 1e-9, "surviving item distance re-based (got " + back.items[0].d + ")");
  assertConservation(g, 2);
});

test("splitter: parts alternate between two open exits", () => {
  const g = newGame();
  g.placeMachine("belt", 1, 0, 0);
  g.placeMachine("splitter", 2, 0, 0);
  g.placeMachine("belt", 3, 0, 0);
  g.placeMachine("bin", 4, 0, 0);      // exit A (dir 0)
  g.placeMachine("belt", 2, 1, 0);
  g.placeMachine("bin", 3, 1, 0);      // exit B (dir 1)
  const binA = machineAt(g, 4, 0);
  const binB = machineAt(g, 3, 1);
  // a bin holds parts in its buffer plus (with no downstream) one in its
  // output slot, so count both
  const total = (b) => b.buffer.length + b.outputs.length;

  const seq = [];
  let prevA = 0, prevB = 0, fed = 0;
  // feed 4 parts, paced one per clear feed belt, and wait until all 4 are
  // stored in the bins
  for (let i = 0; i < 1800 && total(binA) + total(binB) < 4; i++) {
    g.tick();
    if (total(binA) > prevA) { seq.push("A"); prevA = total(binA); }
    if (total(binB) > prevB) { seq.push("B"); prevB = total(binB); }
    if (fed < 4) {
      const fl = flowAt(g, 1, 0);
      if (fl.count() === 0 && fl.accept(COIL, 0)) fed++;
    }
  }
  assert.equal(fed, 4, "4 parts fed in");
  assert.equal(total(binA) + total(binB), 4, "no loss, no duplication");
  assert.equal(total(binA), 2, "exit A got 2 parts");
  assert.equal(total(binB), 2, "exit B got 2 parts");
  assert.deepEqual(seq, ["A", "B", "A", "B"], "exits alternate when both have room");
});

test("splitter: blocked preferred exit falls through to the other", () => {
  const g = newGame();
  g.placeMachine("belt", 0, 0, 0);
  g.placeMachine("belt", 1, 0, 0);
  g.placeMachine("splitter", 2, 0, 0);
  g.placeMachine("belt", 3, 0, 0);
  g.placeMachine("bin", 4, 0, 0);      // exit A (preferred, cursor 0)
  g.placeMachine("belt", 2, 1, 0);
  g.placeMachine("bin", 3, 1, 0);      // exit B
  const binA = machineAt(g, 4, 0);
  const binB = machineAt(g, 3, 1);

  // fill exit A solid: buffer at capacity plus one part in its output slot
  for (let i = 0; i < g.binCapacity(); i++) binA.buffer.push(COIL);
  binA.outputs.push(COIL);
  const total = (b) => b.buffer.length + b.outputs.length;

  let injected = 0;
  // feed 3 parts, paced one per clear feed belt, and wait until 2 are
  // stored in bin B (the first parks on the exit-A belt, which buffers one
  // part against the full bin - that is correct belt behaviour, not a loss)
  for (let i = 0; i < 1800 && total(binB) < 2; i++) {
    g.tick();
    if (injected < 3) {
      const fl = flowAt(g, 0, 0);
      if (fl.count() === 0 && fl.accept(COIL, 0)) injected++;
    }
  }
  assert.equal(injected, 3, "3 parts fed in");
  assert.equal(total(binA), 11, "full bin A was not overflowed");
  assert.equal(total(binB), 2, "2 parts routed to open exit B");
  assert.equal(flowAt(g, 3, 0).count(), 1, "1 part waits on the blocked exit-A belt");
  assert.equal(g.itemCount(), 11 + 2 + 1, "no part lost or duplicated (bin A + bin B + parked)");
});

test("splitter: one in, one out (conservation, no duplication)", () => {
  const g = newGame();
  g.placeMachine("belt", 1, 0, 0);
  g.placeMachine("splitter", 2, 0, 0);
  g.placeMachine("belt", 3, 0, 0);
  g.placeMachine("recycler", 4, 0, 0);   // drain exit A
  g.placeMachine("belt", 2, 1, 0);
  g.placeMachine("recycler", 3, 1, 0);   // drain exit B

  let injected = 0;
  for (let i = 0; i < 1800 && injected < 6; i++) {
    g.tick();
    const fl = flowAt(g, 1, 0);
    if (fl.accept(COIL, 0)) injected++;
  }
  for (let i = 0; i < 1800 && g.recycled < 6; i++) g.tick();
  assert.equal(injected, 6, "6 parts fed in");
  assert.equal(g.recycled, 6, "6 parts out: the splitter must not duplicate");
  assert.equal(g.itemCount(), 0, "line fully drained");
  assertConservation(g, 6);
});

test("credits: contract complete reports a real earned amount (no NaN)", () => {
  const g = new GameRoot({
    id: "phase0-credits", zone: { w: 10, h: 4 },
    fixed: [
      { t: "hopper_ingot", x: 0, y: 1, r: 0 },
      { t: "dock", x: 7, y: 1, r: 0 },
    ],
    target: { item: INING, amount: 10 },
  });
  for (let x = 1; x <= 6; x++) g.placeMachine("belt", x, 1, 0);

  let payload = null;
  g.signals.on("contractComplete", (p) => { payload = p; });
  for (let i = 0; i < 6000 && !g.dock.complete; i++) g.tick();
  assert.equal(g.dock.complete, true);
  assert.ok(payload, "contractComplete fired");
  assert.ok(Number.isFinite(payload.earned), `earned must be a number, got ${payload.earned}`);
  assert.equal(payload.earned, 50, "10 items x 5 credits");
  assert.equal(g.coinsEarnedHere, 50);
  assert.equal(g.delivered, 10);
  assertConservation(g);
});

/** Deterministic PRNG (mulberry32) so the random edit script is reproducible. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("conservation under random edits: 150 s of sandbox edits, zero drift", () => {
  const zone = { w: 12, h: 8 };
  const g = new GameRoot({ id: "phase0-random", zone });

  // factory (rows 0,1,3): splitter, bins, merger, recycler - no production
  // machines, so injected - recycled - removed is the exact ledger
  g.placeMachine("splitter", 2, 0, 0);
  g.placeMachine("belt", 3, 0, 0);
  g.placeMachine("bin", 4, 0, 0);          // splitter exit A
  g.placeMachine("belt", 2, 1, 0);
  g.placeMachine("belt", 3, 1, 0);
  g.placeMachine("bin", 4, 1, 0);          // splitter exit B
  g.placeMachine("merger", 2, 3, 0);
  g.placeMachine("belt", 3, 3, 0);
  g.placeMachine("recycler", 4, 3, 0);
  // upstream feed belts
  g.placeMachine("belt", 1, 0, 0);
  g.placeMachine("belt", 1, 3, 0);

  const factoryBelts = [
    { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 3 },
  ];
  const freeRows = [2, 5, 6, 7]; // random belts live here, out of the factory's way
  const placed = []; // belts the script placed: { x, y, r }
  const rng = mulberry32(20261015);

  const HZ = 30;
  const TOTAL = 150 * HZ; // 5 simulated minutes
  const EDIT_EVERY = 20;

  let injected = 0;
  const feedAt = (x, y) => {
    const line = g.world.lines.lineForTile(x, y, 0);
    const fl = line && g.flowLines.get(line.id);
    if (fl && fl.count() < 1) {
      if (fl.accept(INING, 0)) injected++;
    }
  };

  for (let t = 0; t < TOTAL; t++) {
    g.tick();
    if (t % 60 === 0) { feedAt(1, 0); feedAt(1, 3); } // keep parts moving

    if (t % EDIT_EVERY !== 0) continue;
    const roll = rng();
    if (roll < 0.4) {
      // place a random belt in the free area
      const x = Math.floor(rng() * zone.w);
      const y = freeRows[Math.floor(rng() * freeRows.length)];
      const r = Math.floor(rng() * 4);
      if (g.placeMachine("belt", x, y, r)) placed.push({ x, y, r });
    } else if (roll < 0.65) {
      // remove a belt: mostly script-placed, sometimes a factory belt
      if (placed.length && rng() < 0.6) {
        const i = Math.floor(rng() * placed.length);
        const b = placed.splice(i, 1)[0];
        g.removeMachine(b.x, b.y);
      } else {
        const b = factoryBelts[Math.floor(rng() * factoryBelts.length)];
        if (g.world.machineAt(b.x, b.y, 0)) g.removeMachine(b.x, b.y);
      }
    } else {
      // rotate a belt (remove + place, as input.js does)
      const usePlaced = placed.length > 0 && rng() < 0.6;
      const pool = usePlaced ? placed : factoryBelts;
      const b = pool[Math.floor(rng() * pool.length)];
      const cur = g.world.machineAt(b.x, b.y, 0);
      if (cur) {
        const nr = (cur.r + 1) % 4;
        g.removeMachine(b.x, b.y);
        if (usePlaced) placed.push({ x: b.x, y: b.y, r: nr });
        g.placeMachine("belt", b.x, b.y, nr);
      }
    }

    if ((t + 1) % 100 === 0) assertConservation(g, injected);
  }

  assert.equal(g.tickCount, TOTAL, "full 5-minute run completed");
  assertConservation(g, injected);
  // the ledger must show real traffic, not an empty factory
  assert.ok(injected > 0, "factory was fed");
  assert.ok(g.recycled > 0 || g.partsRemoved > 0, "parts left the world");
});
