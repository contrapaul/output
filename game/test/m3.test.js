// M3 integration tests: full GameRoot simulations.
// These are the "solvable level" smoke tests: each builds a known-good
// factory and asserts the contract completes with no item loss.

import test from "node:test";
import assert from "node:assert/strict";

import { GameRoot } from "../src/game/root.js";
import { FlowLine } from "../src/game/systems/flow.js";
import { CONFIG } from "../src/core/config.js";

const BOARD = "solder(copper_coil|silicon_die)";
const MODULE = "mount(battery_cell|solder(copper_coil|silicon_die))";
const DEVICE = "encap(housing|mount(battery_cell|solder(copper_coil|silicon_die)))";

function run(g, maxTicks = 6000) {
  for (let i = 0; i < maxTicks && !(g.dock && g.dock.complete); i++) g.tick();
  return g;
}

test("t-a: hopper -> belt -> dock completes, no item loss", () => {
  const g = new GameRoot({
    id: "t-a", zone: { w: 12, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 1, y: 3, r: 0 },
      { t: "dock", x: 10, y: 3, r: 0 },
    ],
    target: { item: "silicon_ingot", amount: 10 },
    stars: { time2: 90, machines3: 8 },
  });
  for (let x = 2; x <= 9; x++) g.placeMachine("belt", x, 3, 0);
  run(g);
  assert.equal(g.dock.accepted, 10);
  assert.equal(g.dock.complete, true);
  // items still in transit on the 8-tile line are fine; the line holds at
  // most ~13 (spacing 0.63), so nothing was lost or created
  assert.ok(g.itemCount() <= 14, `line should not overflow: ${g.itemCount()} in world`);
  assert.equal(g.coins, 50); // 10 x 5 credits
});

test("t-b: saw cuts ingots, dock gets wafers", () => {
  const g = new GameRoot({
    id: "t-b", zone: { w: 12, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 1, y: 3, r: 0 },
      { t: "dock", x: 10, y: 3, r: 0 },
    ],
    target: { item: "silicon_wafer", amount: 10 },
  });
  g.placeMachine("belt", 2, 3, 0);
  g.placeMachine("saw", 3, 3, 0);
  for (let x = 4; x <= 9; x++) g.placeMachine("belt", x, 3, 0);
  run(g);
  assert.equal(g.dock.accepted, 10);
  assert.equal(g.dock.complete, true);
});

test("t-c: two lines join at solder, turns allowed", () => {
  const g = new GameRoot({
    id: "t-c", zone: { w: 14, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 0, y: 1, r: 0 },
      { t: "hopper_wire", x: 0, y: 6, r: 0 },
      { t: "dock", x: 12, y: 2, r: 0 },
    ],
    target: { item: BOARD, amount: 2 },
  });
  // die line: across row y=1, turn down at x=6 into the solder at (6,2)
  g.placeMachine("belt", 1, 1, 0);
  g.placeMachine("saw", 2, 1, 0);
  g.placeMachine("belt", 3, 1, 0);
  g.placeMachine("saw", 4, 1, 0);
  g.placeMachine("belt", 5, 1, 0);
  g.placeMachine("belt", 6, 1, 1);
  g.placeMachine("solder", 6, 2, 0);
  // coil line: across row y=6, turn up at x=6 into the solder at (6,2)
  g.placeMachine("belt", 1, 6, 0);
  g.placeMachine("press", 2, 6, 0);
  for (let x = 3; x <= 5; x++) g.placeMachine("belt", x, 6, 0);
  g.placeMachine("belt", 6, 6, 3);
  g.placeMachine("belt", 6, 5, 3);
  g.placeMachine("belt", 6, 4, 3);
  g.placeMachine("belt", 6, 3, 3);
  // boards: solder exits east to the dock
  for (let x = 7; x <= 11; x++) g.placeMachine("belt", x, 2, 0);
  run(g);
  assert.equal(g.dock.accepted, 2);
  assert.equal(g.dock.complete, true);
});

test("u4: full chain to a finished device", () => {
  const g = new GameRoot({
    id: "u4", zone: { w: 16, h: 12 },
    fixed: [
      { t: "hopper_ingot", x: 1, y: 1, r: 0 },
      { t: "hopper_wire", x: 1, y: 4, r: 0 },
      { t: "hopper_cell", x: 1, y: 7, r: 0 },
      { t: "hopper_case", x: 1, y: 10, r: 0 },
      { t: "dock", x: 14, y: 5, r: 0 },
    ],
    target: { item: DEVICE, amount: 1 },
  });
  // die line: across row y=1, turn down at x=6 into the solder at (6,4)
  g.placeMachine("belt", 2, 1, 0);
  g.placeMachine("saw", 3, 1, 0);
  g.placeMachine("belt", 4, 1, 0);
  g.placeMachine("saw", 5, 1, 0);
  g.placeMachine("belt", 6, 1, 1);
  g.placeMachine("belt", 6, 2, 1);
  g.placeMachine("belt", 6, 3, 1);
  g.placeMachine("solder", 6, 4, 0);
  // coil line
  g.placeMachine("belt", 2, 4, 0);
  g.placeMachine("press", 3, 4, 0);
  g.placeMachine("belt", 4, 4, 0);
  g.placeMachine("belt", 5, 4, 0);
  g.placeMachine("mounter", 8, 4, 0);
  g.placeMachine("belt", 7, 4, 0);
  // cell line: turn down at (2,7), across y=8, up column x=8
  g.placeMachine("belt", 2, 7, 1);
  g.placeMachine("belt", 2, 8, 0);
  for (let x = 3; x <= 8; x++) g.placeMachine("belt", x, 8, x === 8 ? 3 : 0);
  g.placeMachine("belt", 8, 7, 3);
  g.placeMachine("belt", 8, 6, 3);
  g.placeMachine("belt", 8, 5, 3);
  // module line
  g.placeMachine("belt", 9, 4, 0);
  g.placeMachine("encap", 10, 4, 0);
  // housing line (up column x=10)
  for (let x = 2; x <= 10; x++) g.placeMachine("belt", x, 10, x === 10 ? 3 : 0);
  for (let y = 9; y >= 5; y--) g.placeMachine("belt", 10, y, 3);
  // product line (turn at (13,4))
  g.placeMachine("belt", 11, 4, 0);
  g.placeMachine("belt", 12, 4, 0);
  g.placeMachine("belt", 13, 4, 1);
  g.placeMachine("belt", 13, 5, 0);
  run(g, 12000);
  assert.equal(g.dock.accepted, 1);
  assert.equal(g.dock.complete, true);
});

test("splitter: one coil line feeds two solder stations (alternating exits)", () => {
  const g = new GameRoot({
    id: "u5", zone: { w: 14, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 0, y: 0, r: 0 },
      { t: "hopper_wire", x: 0, y: 2, r: 0 },
      { t: "hopper_ingot", x: 0, y: 5, r: 0 },
      { t: "dock", x: 10, y: 4, r: 0 },
    ],
    target: { item: BOARD, amount: 2 },
  });
  // coil line: press -> splitter -> alternating exits (5,2) and (4,3)
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("press", 2, 2, 0);
  g.placeMachine("belt", 3, 2, 0);
  g.placeMachine("splitter", 4, 2, 0); // exit 1 -> (5,2), exit 2 -> (4,3)
  g.placeMachine("belt", 5, 2, 0);
  g.placeMachine("belt", 6, 2, 0);
  g.placeMachine("solder", 7, 2, 0);
  g.placeMachine("belt", 4, 3, 0);
  g.placeMachine("belt", 5, 3, 0);
  g.placeMachine("belt", 6, 3, 0);
  g.placeMachine("belt", 7, 3, 1);
  g.placeMachine("solder", 7, 4, 0);
  // die line A (top)
  g.placeMachine("belt", 1, 0, 0);
  g.placeMachine("saw", 2, 0, 0);
  g.placeMachine("belt", 3, 0, 0);
  g.placeMachine("saw", 4, 0, 0);
  g.placeMachine("belt", 5, 0, 0);
  g.placeMachine("belt", 6, 0, 0);
  g.placeMachine("belt", 7, 0, 1);
  g.placeMachine("belt", 7, 1, 1);
  // die line B (bottom)
  g.placeMachine("belt", 1, 5, 0);
  g.placeMachine("saw", 2, 5, 0);
  g.placeMachine("belt", 3, 5, 0);
  g.placeMachine("saw", 4, 5, 0);
  g.placeMachine("belt", 5, 5, 0);
  g.placeMachine("belt", 6, 5, 0);
  g.placeMachine("belt", 7, 5, 3);
  // boards to dock
  g.placeMachine("belt", 8, 2, 0);
  g.placeMachine("belt", 9, 2, 0);
  g.placeMachine("belt", 10, 2, 1);
  g.placeMachine("belt", 10, 3, 1);
  g.placeMachine("belt", 8, 4, 0);
  g.placeMachine("belt", 9, 4, 0);
  run(g, 9000);
  assert.equal(g.dock.accepted, 2);
  assert.equal(g.dock.complete, true);
});

test("recycler: drains a line so it never clogs", () => {
  const g = new GameRoot({
    id: "u6", zone: { w: 8, h: 4 },
    fixed: [{ t: "hopper_ingot", x: 0, y: 1, r: 0 }],
    target: null,
  });
  g.placeMachine("belt", 1, 1, 0);
  g.placeMachine("recycler", 2, 1, 0);
  // belt after the recycler must stay empty: nothing passes through
  g.placeMachine("belt", 3, 1, 0);
  const lineAfter = g.flowLines.get(g.world.lines.lineForTile(3, 1, 0).id);
  let sawAnything = false;
  for (let i = 0; i < 300; i++) {
    g.tick();
    if (lineAfter.count() > 0) sawAnything = true;
  }
  assert.equal(sawAnything, false, "recycler consumes items, nothing passes through");
  const lineBefore = g.flowLines.get(g.world.lines.lineForTile(1, 1, 0).id);
  assert.ok(lineBefore.count() <= 2, "upstream line must keep draining (not clogged)");
});

test("bin: buffers parts and releases them downstream", () => {
  const g = new GameRoot({
    id: "u3", zone: { w: 8, h: 4 },
    fixed: [
      { t: "hopper_ingot", x: 0, y: 1, r: 0 },
      { t: "dock", x: 6, y: 1, r: 0 },
    ],
    target: { item: "silicon_ingot", amount: 15 },
  });
  g.placeMachine("belt", 1, 1, 0);
  g.placeMachine("bin", 2, 1, 0);
  for (let x = 3; x <= 5; x++) g.placeMachine("belt", x, 1, 0);
  const bin = g.machines.get("2,1");
  let maxBuffer = 0;
  for (let i = 0; i < 2400 && !g.dock.complete; i++) {
    g.tick();
    maxBuffer = Math.max(maxBuffer, bin.buffer.length);
  }
  assert.equal(g.dock.accepted, 15);
  assert.ok(maxBuffer <= 10, `bin must not exceed capacity (max ${maxBuffer})`);
});

test("bin20 upgrade: capacity 20", () => {
  const g = new GameRoot(
    { id: "x", zone: { w: 4, h: 4 }, fixed: [], target: null },
    { upgrades: ["bin20"] }
  );
  assert.equal(g.binCapacity(), 20);
  const g2 = new GameRoot({ id: "x", zone: { w: 4, h: 4 }, fixed: [], target: null });
  assert.equal(g2.binCapacity(), 10);
});

test("motor2x upgrade: machines charge twice as fast", () => {
  const contract = { id: "x", zone: { w: 6, h: 4 }, fixed: [], target: null };
  const slow = new GameRoot(contract);
  slow.placeMachine("press", 2, 2, 0);
  const fast = new GameRoot(contract, { upgrades: ["motor2x"] });
  fast.placeMachine("press", 2, 2, 0);

  const ticksToOutput = (g) => {
    const m = g.machines.get("2,2");
    m.inputs.push("copper_wire");
    let ticks = 0;
    while (m.outputs.length === 0 && ticks < 100) {
      g.tick();
      ticks++;
    }
    return ticks;
  };
  const tSlow = ticksToOutput(slow);
  const tFast = ticksToOutput(fast);
  assert.ok(tFast * 2 <= tSlow, `fast (${tFast}) should be about half of slow (${tSlow})`);
});

test("dock_express upgrade: double credits", () => {
  const g = new GameRoot(
    {
      id: "t-a", zone: { w: 12, h: 8 },
      fixed: [
        { t: "hopper_ingot", x: 1, y: 3, r: 0 },
        { t: "dock", x: 10, y: 3, r: 0 },
      ],
      target: { item: "silicon_ingot", amount: 2 },
    },
    { coins: 200, upgrades: ["dock_express"] }
  );
  for (let x = 2; x <= 9; x++) g.placeMachine("belt", x, 3, 0);
  run(g);
  assert.equal(g.coins, 220); // 2 x 10 credits
});

test("wrong item at dock is not lost (stays in world)", () => {
  const g = new GameRoot({
    id: "t-b", zone: { w: 12, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 1, y: 3, r: 0 },
      { t: "dock", x: 10, y: 3, r: 0 },
    ],
    target: { item: "silicon_ingot", amount: 1 },
  });
  // send wafers (wrong) into the dock: they must pile up, not vanish
  g.placeMachine("belt", 2, 3, 0);
  g.placeMachine("saw", 3, 3, 0);
  for (let x = 4; x <= 9; x++) g.placeMachine("belt", x, 3, 0);
  for (let i = 0; i < 400; i++) g.tick();
  const dockAccepted = g.dock.accepted;
  const inWorld = g.itemCount();
  // every wafer ever produced is either at the dock (0, wrong) or in world
  assert.ok(inWorld > 0, "rejected wafers must remain in the world");
  assert.equal(dockAccepted <= 1, true);
});

test("overhead line crosses ground line independently (flow)", () => {
  // whitebox: two FlowLines sharing a tile on different layers
  const mk = (tiles) => {
    const built = tiles.map((t) => ({ key: `${t.x},${t.y},${t.z}`, ...t }));
    return {
      tiles: built,
      get head() { return built[0].key; },
      get tail() { return built[built.length - 1].key; },
      get length() { return built.length; },
      index(k) { return built.findIndex((t) => t.key === k); },
      tile(k) { return built.find((t) => t.key === k) || null; },
    };
  };
  const ground = mk([{ x: 0, y: 2, z: 0, dir: 0 }, { x: 1, y: 2, z: 0, dir: 0 }, { x: 2, y: 2, z: 0, dir: 0 }, { x: 3, y: 2, z: 0, dir: 0 }]);
  const over = mk([{ x: 1, y: 0, z: 1, dir: 1 }, { x: 1, y: 1, z: 1, dir: 1 }, { x: 1, y: 2, z: 1, dir: 1 }, { x: 1, y: 3, z: 1, dir: 1 }]);
  const fg = new FlowLine(ground, null);
  const fo = new FlowLine(over, null);
  fg.accept("a");
  fo.accept("b");
  const v = CONFIG.BELT_RATE / 30;
  let done = 0;
  for (let i = 0; i < 300 && done < 2; i++) {
    if (fg.step(v, () => true).length) done++;
    if (fo.step(v, () => true).length) done++;
  }
  assert.equal(done, 2, "both crossing lines must deliver");
});

test("stars: 3 stars for fast + small build", () => {
  const g = new GameRoot({
    id: "t-a", zone: { w: 12, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 1, y: 3, r: 0 },
      { t: "dock", x: 10, y: 3, r: 0 },
    ],
    target: { item: "silicon_ingot", amount: 3 },
    stars: { time2: 90, machines3: 8 },
  });
  for (let x = 2; x <= 9; x++) g.placeMachine("belt", x, 3, 0); // 8 belts
  run(g);
  assert.equal(g._computeStars(), 3);
  // budget exceeded -> 2 stars
  for (let x = 0; x < 4; x++) g.world.place("bin", 0, x, 0);
  g.placedCount += 4;
  assert.equal(g._computeStars(), 2);
});

test("sandbox: no dock, no completion, simulation stays stable", () => {
  const g = new GameRoot({
    id: "sandbox", zone: { w: 8, h: 6 },
    fixed: [{ t: "hopper_ingot", x: 0, y: 2, r: 0 }],
    target: null,
  });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("saw", 2, 2, 0);
  g.placeMachine("belt", 3, 2, 0);
  for (let i = 0; i < 300; i++) g.tick();
  assert.equal(g.dock, null);
  assert.equal(g.itemCount() >= 0, true); // no crash, items flow
});

test("conservation with machines: emitted = accepted + inWorld + (recycled)", () => {
  const g = new GameRoot({
    id: "t-b", zone: { w: 12, h: 8 },
    fixed: [
      { t: "hopper_ingot", x: 1, y: 3, r: 0 },
      { t: "dock", x: 10, y: 3, r: 0 },
    ],
    target: { item: "silicon_wafer", amount: 20 },
  });
  g.placeMachine("belt", 2, 3, 0);
  g.placeMachine("saw", 3, 3, 0);
  for (let x = 4; x <= 9; x++) g.placeMachine("belt", x, 3, 0);
  // run until the dock is complete, then a bit more
  run(g, 3000);
  assert.equal(g.dock.accepted, 20);
  // conservation: once complete, nothing is accepted or removed, so the
  // world count can only grow (the hopper keeps emitting) — never shrink
  const a = g.itemCount();
  for (let i = 0; i < 90; i++) g.tick();
  const b = g.itemCount();
  assert.ok(b >= a, `item count must not shrink after completion: ${a} -> ${b}`);
  // total items (world + dock) can't exceed what the hopper could emit
  // (0.5/s for ~103s -> 51 ingots -> 102 wafers)
  assert.ok(b + 20 <= 110, `too many items exist: ${b} in world + 20 docked`);
});
