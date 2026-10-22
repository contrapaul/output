// Polish pass P2 (Paul's playtest 2026-10-22): belt look + the Q4 alert.
//
// beltShape.linePath: the snake path the renderer strokes (corners curve).
// GameRoot.refusalReason / machineRefusal: a machine that will not take a
// part says why, out loud, at most once per quiet period.

import test from "node:test";
import assert from "node:assert/strict";

import { linePath } from "../src/game/beltShape.js";
import { GameRoot } from "../src/game/root.js";
import { make } from "../src/game/items.js";

const T = 40;

// ---- linePath (snake belts) ------------------------------------------------

test("linePath: one tile spans the tile in its direction", () => {
  const p = linePath([{ x: 2, y: 3, dir: 0 }], T);
  assert.deepEqual(p, [{ x: 80, y: 140 }, { x: 120, y: 140 }]);
});

test("linePath: a straight run keeps its ends at the tile edges", () => {
  const p = linePath([{ x: 0, y: 1, dir: 0 }, { x: 1, y: 1, dir: 0 }, { x: 2, y: 1, dir: 0 }], T);
  assert.deepEqual(p, [{ x: 0, y: 60 }, { x: 20, y: 60 }, { x: 100, y: 60 }, { x: 120, y: 60 }]);
});

test("linePath: a corner turns at tile centres, no diagonals, no two squares", () => {
  // run east then south: (0,0) (1,0) face east, (1,1) (1,2) face south
  const p = linePath([
    { x: 0, y: 0, dir: 0 }, { x: 1, y: 0, dir: 0 },
    { x: 1, y: 1, dir: 1 }, { x: 1, y: 2, dir: 1 },
  ], T);
  assert.deepEqual(p, [
    { x: 0, y: 20 }, // head edge
    { x: 20, y: 20 }, // first centre
    { x: 60, y: 20 }, // last east tile: the corner
    { x: 60, y: 100 }, // last centre (segment passes through the south tile centres)
    { x: 60, y: 120 }, // tail edge
  ]);
  // every segment is axis-aligned
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i].x === p[i - 1].x || p[i].y === p[i - 1].y, `segment ${i} is diagonal`);
  }
});

test("linePath: empty run gives no points", () => {
  assert.deepEqual(linePath([], T), []);
});

// ---- refusalReason (Q4: say why) -------------------------------------------

const press_ = make.press;
const cut = make.cut;
const join = make.join;

test("refusalReason: a cutter says a pressed part is finished", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("cutter", 3, 3, 0);
  const m = g.machines.get("3,3");
  const why = g.refusalReason(m, press_("m1"), 2); // arriving from the west = its back
  assert.match(why, /pressed part/);
  assert.equal(g.refusalReason(m, "m1", 2), null, "a plain part is fine");
});

test("refusalReason: a cutter refuses assemblies by name", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("cutter", 3, 3, 0);
  const m = g.machines.get("3,3");
  const why = g.refusalReason(m, join("m1", "m2"), 2);
  assert.match(why, /single parts/);
  assert.match(why, /assemblies/);
});

test("refusalReason: wrong side is called out with the F hint", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("cutter", 3, 3, 0); // back is to the west
  const m = g.machines.get("3,3");
  const why = g.refusalReason(m, "m1", 0); // arriving from the east = its front
  assert.match(why, /cannot take parts from that side/);
  assert.match(why, /F/);
});

test("refusalReason: a depot holding m2 refuses m1 by name", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeFilledDepot("depot_s", 3, 3, 0, "m2", 5);
  const m = g.machines.get("3,3");
  const why = g.refusalReason(m, "m1", 2);
  assert.match(why, /one kind of part/);
  assert.match(why, /holds/);
});

test("refusalReason: encaser refuses a single part", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("encaser", 3, 3, 0);
  const m = g.machines.get("3,3");
  const why = g.refusalReason(m, "m1", 2);
  assert.match(why, /assembly/);
});

// ---- the alert fires in the running game ------------------------------------

function pressedIntoCutter() {
  const g = new GameRoot({ zone: { w: 10, h: 8 } });
  // a press fed by a hopper, output belt into a cutter
  g.addHopper({ x: 0, y: 2, r: 0, item: "m1" });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("press", 2, 2, 0);
  g.placeMachine("belt", 3, 2, 0);
  g.placeMachine("cutter", 4, 2, 0);
  return g;
}

test("alert: pressed parts at a cutter raise machineRefusal naming the rule", () => {
  const g = pressedIntoCutter();
  const seen = [];
  g.signals.on("machineRefusal", (e) => seen.push(e));
  for (let i = 0; i < 3000; i++) g.tick();
  assert.ok(seen.length >= 1, "the cutter said why");
  const pressed = seen.find((e) => e.t === "cutter" && e.item === "press(m1)");
  assert.ok(pressed, `expected a press(m1) refusal, got ${JSON.stringify(seen.map((e) => [e.t, e.item]))}`);
  assert.match(pressed.reason, /pressed part/);
});

test("alert: the same refusal does not spam while it lasts", () => {
  const g = pressedIntoCutter();
  let n = 0;
  g.signals.on("machineRefusal", () => n++);
  for (let i = 0; i < 3000; i++) g.tick(); // 100 seconds of game time
  assert.ok(n <= 6, `at most one alert per 20 s quiet period, got ${n}`);
  assert.ok(n >= 1);
});

test("alert: refusalAt shows the reason for the hover card and clears when it works", () => {
  const g = pressedIntoCutter();
  for (let i = 0; i < 3000; i++) g.tick();
  const r = g.refusalAt(4, 2);
  assert.ok(r, "the cutter keeps a visible refusal");
  assert.match(r.reason, /pressed/);
});

test("alert: the dock says it only takes what an order asks for", () => {
  const g = new GameRoot({
    zone: { w: 10, h: 8 },
    dock: { x: 4, y: 2 },
    target: { item: "m2", amount: 3 },
    hoppers: [{ x: 0, y: 2, r: 0, item: "m1" }],
  });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("belt", 2, 2, 0);
  g.placeMachine("belt", 3, 2, 0);
  const seen = [];
  g.signals.on("machineRefusal", (e) => seen.push(e));
  for (let i = 0; i < 2000; i++) g.tick();
  const dockRef = seen.find((e) => e.t === "dock");
  assert.ok(dockRef, "the dock said why m1 is not wanted");
  assert.match(dockRef.reason, /only takes what an open order asks for/);
});
