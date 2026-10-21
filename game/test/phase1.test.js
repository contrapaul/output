// Phase 1 tests: drag paths, path planning, area delete, rotate in place,
// undo/redo, ports.

import test from "node:test";
import assert from "node:assert/strict";

import { DragPath } from "../src/game/dragpath.js";
import { planPlacement, applyPlan, piecesInArea, removePieces } from "../src/game/build.js";
import { History } from "../src/game/history.js";
import { GameRoot } from "../src/game/root.js";

const sandbox = (w = 12, h = 8, fixed = []) => new GameRoot({ id: "t", zone: { w, h }, fixed });
const layout = (g) =>
  [...g.world.machines.values()]
    .map((m) => `${m.t}@${m.x},${m.y},${m.z}:${m.r}`)
    .sort()
    .join(" ");

// ---- drag path builder ---------------------------------------------------

test("drag path: straight line, every belt faces the next tile", () => {
  const p = new DragPath(1, 2);
  p.moveTo(2, 2);
  p.moveTo(5, 2);
  assert.deepEqual(p.withDirs(), [
    { x: 1, y: 2, r: 0 }, { x: 2, y: 2, r: 0 }, { x: 3, y: 2, r: 0 },
    { x: 4, y: 2, r: 0 }, { x: 5, y: 2, r: 0 },
  ]);
});

test("drag path: one corner keeps going the current way, then turns", () => {
  const p = new DragPath(0, 0);
  p.moveTo(3, 0);
  p.moveTo(3, 2); // turn down
  const d = p.withDirs();
  assert.deepEqual(d.map((t) => [t.x, t.y]), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]]);
  assert.deepEqual(d.map((t) => t.r), [0, 0, 0, 1, 1, 1]);
});

test("drag path: a diagonal jump makes an L along the current heading", () => {
  const p = new DragPath(0, 0);
  p.moveTo(1, 0); // heading right
  p.moveTo(3, 2); // jump: continue right first, then down
  assert.deepEqual(p.tiles, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }]);
});

test("drag path: two corners in one drag", () => {
  const p = new DragPath(0, 0);
  p.moveTo(4, 0);
  p.moveTo(4, 3);
  p.moveTo(8, 3);
  const r = p.withDirs().map((t) => t.r);
  assert.equal(p.length, 12);
  assert.deepEqual(r, [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
});

test("drag path: back-tracking cuts the path back", () => {
  const p = new DragPath(0, 0);
  p.moveTo(5, 0);
  p.moveTo(2, 0);
  assert.equal(p.length, 3);
  assert.deepEqual(p.last, { x: 2, y: 0 });
  p.moveTo(2, 3);
  assert.deepEqual(p.withDirs().map((t) => t.r), [0, 0, 1, 1, 1, 1]);
});

test("drag path: crossing itself cuts back to the crossing tile", () => {
  const p = new DragPath(0, 1);
  p.moveTo(3, 1);
  p.moveTo(3, 3);
  p.moveTo(1, 3);
  p.moveTo(1, 0); // passes through (1,1), already in the path
  assert.equal(p.indexOf(1, 1), p.length - 2);
  assert.deepEqual(p.last, { x: 1, y: 0 });
});

test("drag path: single tile uses the ghost rotation", () => {
  const p = new DragPath(4, 4, 3);
  assert.deepEqual(p.withDirs(), [{ x: 4, y: 4, r: 3 }]);
});

// ---- planning and applying -------------------------------------------------

test("plan: a dragged belt line builds and forms one line", () => {
  const g = sandbox();
  const p = new DragPath(1, 1);
  p.moveTo(6, 1);
  p.moveTo(6, 4);
  const plan = planPlacement(g.world, "belt", p.withDirs(), 0);
  assert.ok(plan.every((s) => s.action === "place"));
  const ops = applyPlan(g, plan);
  assert.equal(ops.length, 9);
  assert.equal(g.world.lines.allLines().length, 1);
});

test("plan: blocked tiles are marked invalid with a reason, the rest builds", () => {
  const g = sandbox();
  g.placeMachine("cutter", 3, 1, 0);
  const p = new DragPath(1, 1);
  p.moveTo(5, 1);
  const plan = planPlacement(g.world, "belt", p.withDirs(), 0);
  const bad = plan.filter((s) => s.action === "invalid");
  assert.equal(bad.length, 1);
  assert.deepEqual([bad[0].x, bad[0].y], [3, 1]);
  assert.equal(bad[0].reason, "that tile is taken");
  applyPlan(g, plan);
  assert.equal(g.world.beltAt(2, 1).dir, 0);
  assert.equal(g.world.beltAt(4, 1).dir, 0);
});

test("plan: outside the build area is invalid", () => {
  const g = sandbox(4, 4);
  const p = new DragPath(2, 1);
  p.moveTo(6, 1);
  const plan = planPlacement(g.world, "belt", p.withDirs(), 0);
  assert.equal(plan.filter((s) => s.action === "invalid").length, 3);
  assert.equal(plan.find((s) => s.x === 4).reason, "outside the build area");
});

test("plan: dragging over a belt turns it (replace) and keeps same-way belts", () => {
  const g = sandbox();
  for (let x = 1; x <= 4; x++) g.placeMachine("belt", x, 2, 0);
  // drag from the tail tile downward: the tail turns down, new belts follow
  const p = new DragPath(4, 2);
  p.moveTo(4, 5);
  const plan = planPlacement(g.world, "belt", p.withDirs(), 0);
  assert.equal(plan[0].action, "replace");
  assert.ok(plan.slice(1).every((s) => s.action === "place"));
  applyPlan(g, plan);
  assert.equal(g.world.beltAt(4, 2).dir, 1);
  assert.equal(g.world.lines.allLines().length, 1, "the old line and the new tiles join");
  const again = planPlacement(g.world, "belt", p.withDirs(), 0);
  assert.ok(again.every((s) => s.action === "keep"));
});

test("plan: preview matches what really happens (two feeders rule)", () => {
  const g = sandbox();
  g.placeMachine("belt", 3, 0, 1); // points down at (3,1)
  const p = new DragPath(1, 1);
  p.moveTo(5, 1); // (3,1) would get a second feeder from (2,1)
  const plan = planPlacement(g.world, "belt", p.withDirs(), 0);
  const ops = applyPlan(g, plan);
  const planned = plan.filter((s) => s.action === "place").length;
  assert.equal(ops.length, planned, "every planned placement succeeded");
});

test("plan: machines repeat along a drag", () => {
  const g = sandbox();
  const p = new DragPath(2, 3, 1);
  p.moveTo(2, 6);
  const plan = planPlacement(g.world, "cutter", p.withDirs().map((t) => ({ ...t, r: 0 })), 0);
  applyPlan(g, plan);
  assert.equal(g.machines.size, 4);
});

test("area delete removes everything in the box except fixed pieces", () => {
  const g = sandbox(12, 8, [{ t: "dock", x: 5, y: 2, r: 0 }]);
  for (let x = 1; x <= 4; x++) g.placeMachine("belt", x, 2, 0);
  g.placeMachine("cutter", 3, 3, 0);
  g.placeMachine("belt_high", 2, 2, 1, 1);
  const pieces = piecesInArea(g.world, 0, 0, 6, 6);
  const ops = removePieces(g, pieces);
  assert.equal(ops.length, 6);
  assert.equal(ops[0].z, 1, "overhead goes first");
  assert.ok(g.world.machineAt(5, 2, 0), "dock stays");
  assert.equal(g.world.machines.size, 4, "only the 2x2 dock is left");
});

test("the dock cannot be removed or rotated", () => {
  const g = sandbox(12, 8, [{ t: "dock", x: 5, y: 2, r: 0 }]);
  assert.equal(g.removeMachine(5, 2, 0), null);
  assert.equal(g.rotateAt(5, 2, 0, 1), false);
});

// ---- rotate in place keeps parts ------------------------------------------

test("rotating a machine in place keeps its parts", () => {
  const g = sandbox();
  g.placeMachine("combiner", 4, 4, 0);
  const m = g.machines.get("4,4");
  m.inputs.push("cut(cut(m1))");
  assert.ok(g.rotateAt(4, 4, 0, 2));
  assert.equal(g.machines.get("4,4"), m);
  assert.deepEqual(m.inputs, ["cut(cut(m1))"]);
  assert.equal(m.r, 2);
  assert.equal(g.world.machineAt(4, 4).r, 2);
});

test("rotating a belt in place keeps the parts on it", () => {
  const g = new GameRoot({ id: "t", zone: { w: 12, h: 8 }, fixed: [{ t: "hopper", item: "m1", x: 0, y: 2, r: 0 }] });
  for (let x = 1; x <= 6; x++) g.placeMachine("belt", x, 2, 0);
  for (let i = 0; i < 90; i++) g.tick();
  const before = g.itemCount();
  assert.ok(before > 0);
  assert.ok(g.rotateAt(6, 2, 0, 1)); // tail turns down
  assert.equal(g.itemCount(), before);
  assert.equal(g.partsRemoved, 0);
});

test("a blocked rotation puts the belt back", () => {
  const g = sandbox();
  g.placeMachine("belt", 2, 2, 0);
  g.placeMachine("belt", 1, 3, 0); // feeds (2,3)
  g.placeMachine("belt", 2, 3, 0);
  const before = layout(g);
  // turning (2,2) down would point it at (2,3), which is already fed
  assert.equal(g.rotateAt(2, 2, 0, 1), false);
  assert.equal(layout(g), before);
});

test("removing a machine counts the parts it held (ledger stays exact)", () => {
  const g = sandbox();
  g.placeMachine("combiner", 4, 4, 0);
  g.machines.get("4,4").inputs.push("cut(cut(m1))");
  g.removeMachine(4, 4, 0);
  assert.equal(g.partsRemoved, 1);
});

// ---- undo / redo ----------------------------------------------------------

test("undo/redo: a whole drag is one step", () => {
  const g = sandbox();
  const h = new History(g);
  const p = new DragPath(1, 1);
  p.moveTo(6, 1);
  h.push(applyPlan(g, planPlacement(g.world, "belt", p.withDirs(), 0)));
  assert.equal(g.world.machines.size, 6);
  h.undo();
  assert.equal(g.world.machines.size, 0);
  h.redo();
  assert.equal(g.world.machines.size, 6);
});

test("undo/redo: area delete and rotation round trip to the same layout", () => {
  const g = sandbox();
  const h = new History(g);
  const p = new DragPath(1, 1);
  p.moveTo(5, 1);
  p.moveTo(5, 4);
  h.push(applyPlan(g, planPlacement(g.world, "belt", p.withDirs(), 0)));
  h.push(applyPlan(g, planPlacement(g.world, "cutter", [{ x: 2, y: 5, r: 0 }], 0)));
  g.rotateAt(2, 5, 0, 3);
  h.push([{ k: "rotate", x: 2, y: 5, z: 0, from: 0, to: 3 }]);
  const built = layout(g);
  h.push(removePieces(g, piecesInArea(g.world, 0, 0, 11, 7)));
  assert.equal(g.world.machines.size, 0);
  h.undo();
  assert.equal(layout(g), built);
  h.undo(); // rotation
  assert.equal(g.world.machineAt(2, 5).r, 0);
  h.redo();
  h.redo();
  assert.equal(g.world.machines.size, 0);
  h.undo();
  assert.equal(layout(g), built);
});

test("undo/redo: a new action clears redo; stack keeps at least 50 steps", () => {
  const g = sandbox(80, 4);
  const h = new History(g);
  for (let x = 0; x < 60; x++) h.push(applyPlan(g, planPlacement(g.world, "cutter", [{ x, y: 0, r: 0 }], 0)));
  for (let i = 0; i < 55; i++) assert.ok(h.undo(), `undo ${i}`);
  assert.equal(g.machines.size, 5);
  assert.ok(h.canRedo);
  h.push(applyPlan(g, planPlacement(g.world, "cutter", [{ x: 70, y: 2, r: 0 }], 0)));
  assert.equal(h.canRedo, false);
});

// ---- ports ------------------------------------------------------------------

import { acceptsFrom, PORTS } from "../src/game/systems/process.js";

test("ports: local sides follow rotation", () => {
  // saw facing right (r=0) takes from the left (absolute dir 2 = back)
  assert.equal(acceptsFrom("cutter", 0, 2), true);
  assert.equal(acceptsFrom("cutter", 0, 1), false);
  // saw facing down (r=1): back is up (absolute dir 3)
  assert.equal(acceptsFrom("cutter", 1, 3), true);
  assert.equal(acceptsFrom("cutter", 1, 2), false);
  // 2-input stations never take from the front
  assert.equal(acceptsFrom("combiner", 0, 0), false);
  for (const d of [1, 2, 3]) assert.equal(acceptsFrom("combiner", 0, d), true);
  assert.deepEqual(PORTS.splitter.out, [3, 1], "the splitter is a Y: left and right");
});

function feedRun(beltDir, sawR) {
  // hopper at (0,2) -> belts -> saw at (4,2); last belt points at the saw
  const g = new GameRoot({ id: "p", zone: { w: 10, h: 6 }, fixed: [{ t: "hopper", item: "m1", x: 0, y: 2, r: 0 }] });
  for (let x = 1; x <= 3; x++) g.placeMachine("belt", x, 2, beltDir);
  g.placeMachine("cutter", 4, 2, sawR);
  g.placeMachine("recycler", 5, 2, 0);
  for (let i = 0; i < 300; i++) g.tick();
  return g;
}

test("ports: a belt into the saw's back works, into its side waits", () => {
  const ok = feedRun(0, 0);
  assert.ok(ok.recycled > 0, "saw facing away from the belt cuts and outputs");
  const side = feedRun(0, 1); // saw faces down: the belt hits its left side
  assert.equal(side.recycled, 0);
  assert.equal(side.machines.get("4,2").inputs.length, 0, "nothing entered");
  assert.equal(side._acceptorPast([...side.flowLines.values()][0]).kind, "wrongSide");
  assert.equal(side.itemCount(), side.emitted, "parts wait on the belt, none lost");
});

test("ports: machine to machine respects the next machine's input side", () => {
  const make = (sawR) => {
    const g = new GameRoot({ id: "p", zone: { w: 10, h: 6 }, fixed: [{ t: "hopper", item: "m1", x: 0, y: 2, r: 0 }] });
    g.placeMachine("belt", 1, 2, 0);
    g.placeMachine("cutter", 2, 2, 0); // ingot -> wafers, out to the right
    g.placeMachine("cutter", 3, 2, sawR); // wafer -> dies
    g.placeMachine("recycler", 4, 2, 0);
    g.placeMachine("recycler", 3, 3, 0);
    g.placeMachine("recycler", 3, 1, 0);
    for (let i = 0; i < 300; i++) g.tick();
    return g;
  };
  assert.ok(make(0).recycled > 0, "back faces the first saw: wafers go in");
  const blocked = make(2); // facing left: its front faces the first saw
  assert.equal(blocked.recycled, 0);
  assert.equal(blocked.machines.get("2,2").outputs.length > 0, true, "first saw waits with its wafers");
});

test("plan: a machine dropped on a belt is inserted into the line (one undo step)", () => {
  const g = sandbox();
  for (let x = 1; x <= 5; x++) g.placeMachine("belt", x, 2, 0);
  const h = new History(g);
  const plan = planPlacement(g.world, "cutter", [{ x: 3, y: 2, r: 0 }], 0);
  assert.equal(plan[0].action, "swap");
  h.push(applyPlan(g, plan));
  assert.equal(g.world.machineAt(3, 2).t, "cutter");
  assert.equal(g.world.lines.allLines().length, 2, "the line splits around the saw");
  h.undo();
  assert.equal(g.world.machineAt(3, 2).t, "belt");
  assert.equal(g.world.lines.allLines().length, 1);
});
