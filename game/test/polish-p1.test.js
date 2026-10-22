// Polish pass P1 (Paul's playtest 2026-10-22): build feel.
//
// Defect 2 (smart direction) + defect 4 (patch-up belt connects):
// suggestBeltDir / suggestMachineDir.
// Input-level: machine drag is one undo step, keyboard rotation is kept,
// a single belt placed to repair a line connects to the belt that feeds it.

import test from "node:test";
import assert from "node:assert/strict";

import { GameRoot } from "../src/game/root.js";
import { Input } from "../src/game/input.js";
import { DragPath } from "../src/game/dragpath.js";
import { suggestBeltDir, suggestMachineDir } from "../src/game/autoDir.js";

const stubRenderer = () => ({ setGhostPlan() {}, setArea() {}, setSelected() {} });
const makeInput = (game) => new Input(null, null, game, stubRenderer(), {});

// ---- suggestBeltDir (defect 4) -------------------------------------------

test("suggestBeltDir: continues the one belt that feeds this tile", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0); // heading east, feeds (2,2)
  assert.equal(suggestBeltDir(g.world, 2, 2, 0), 0);
});

test("suggestBeltDir: a belt feeding from above continues downward", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 2, 1, 1); // heading down, feeds (2,2)
  assert.equal(suggestBeltDir(g.world, 2, 2, 0), 1);
});

test("suggestBeltDir: no feeder and nothing to serve means no suggestion", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  assert.equal(suggestBeltDir(g.world, 5, 5, 0), null);
});

test("suggestBeltDir: two feeders is ambiguous, no suggestion", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0); // feeds (2,2) from the west
  g.placeMachine("belt", 3, 2, 2); // feeds (2,2) from the east
  assert.equal(suggestBeltDir(g.world, 2, 2, 0), null);
});

test("suggestBeltDir: continuation blocked by a taken tile means no suggestion", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("belt", 3, 2, 2); // sits where the continuation would deliver
  assert.equal(suggestBeltDir(g.world, 2, 2, 0), null);
});

// ---- suggestMachineDir (defect 2) -----------------------------------------

test("suggestMachineDir: cutter fed from the west faces east (back port on the feeder)", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0);
  assert.equal(suggestMachineDir(g.world, "cutter", 2, 2), 0);
});

test("suggestMachineDir: fed from above, the machine faces down", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 2, 1, 1);
  assert.equal(suggestMachineDir(g.world, "cutter", 2, 2), 1);
});

test("suggestMachineDir: a hopper feeding the tile counts as a feeder", () => {
  const g = new GameRoot({
    zone: { w: 10, h: 6 },
    hoppers: [{ x: 1, y: 2, r: 0, item: "m1" }],
  });
  assert.equal(suggestMachineDir(g.world, "cutter", 2, 2), 0);
});

test("suggestMachineDir: an empty machine next to the dock faces the dock", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 }, dock: { x: 3, y: 2 } });
  assert.equal(suggestMachineDir(g.world, "cutter", 2, 2), 0);
});

test("suggestMachineDir: combiner with feeders west and north faces the follower east", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0); // feeder from the west (dir 2 from machine)
  g.placeMachine("belt", 2, 1, 1); // feeder from the north (dir 3 from machine)
  g.placeMachine("recycler", 3, 2, 0); // follower to the east
  assert.equal(suggestMachineDir(g.world, "combiner", 2, 2), 0);
});

test("suggestMachineDir: no feeders and no followers means no suggestion", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  assert.equal(suggestMachineDir(g.world, "cutter", 5, 5), null);
});

test("suggestMachineDir: when no rotation satisfies every feeder, one still is offered", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("belt", 3, 2, 2); // cutters only take from the back: no r fits both
  const r = suggestMachineDir(g.world, "cutter", 2, 2);
  assert.ok(r === 0 || r === 2, `expected a best-effort facing, got ${r}`);
});

// ---- belt repair end to end (defect 4) -------------------------------------

test("repair a line: delete a mid-run belt, place one, parts flow through", () => {
  const g = new GameRoot({
    zone: { w: 10, h: 6 },
    hoppers: [{ x: 2, y: 0, r: 1, item: "m1" }],
  });
  for (let y = 1; y <= 4; y++) g.placeMachine("belt", 2, y, 1); // run heading down
  g.placeMachine("recycler", 2, 5, 1);
  g.removeMachine(2, 3); // knock out a mid-run belt

  const input = makeInput(g);
  input.setTool("belt");
  input._build(new DragPath(2, 3)); // one tap, no rotation pressed: must face down

  for (let i = 0; i < 900; i++) g.tick();
  assert.ok(g.recycled >= 1, `parts should reach the recycler, got ${g.recycled}`);
  assert.equal(g.world.machineAt(2, 3, 0).r, 1, "the patch belt faces down");
});

// ---- input level: machine drag, rotation, one undo step --------------------

test("machine drag: one 4-tile drag is one undo step and places 4 machines", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  const input = makeInput(g);
  input.setTool("cutter");
  const p = new DragPath(1, 2);
  p.moveTo(4, 2);
  input._build(p);
  const built = [...g.world.machines.values()].filter((m) => m.t === "cutter");
  assert.equal(built.length, 4, "one machine per tile");
  assert.equal(input.history.undoStack.length, 1, "the whole drag is one step");
  input.undo();
  assert.equal([...g.world.machines.values()].filter((m) => m.t === "cutter").length, 0);
});

test("keyboard rotation while placing wins over the smart direction", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0); // would suggest r=0 for a cutter at (2,2)
  const input = makeInput(g);
  input.setTool("cutter");
  input._rotate(2); // the player turned the ghost twice: 0 -> 2
  input._build(new DragPath(2, 2));
  const m = g.world.machineAt(2, 2, 0);
  assert.ok(m, "the cutter was placed");
  assert.equal(m.r, 2, "the player's rotation is kept");
});

test("machine placed without rotation uses the smart direction", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 1, 2, 0);
  const input = makeInput(g);
  input.setTool("cutter");
  input._build(new DragPath(2, 2));
  const m = g.world.machineAt(2, 2, 0);
  assert.equal(m.r, 0, "faces away from the feeding belt");
});

test("single belt tap reuses the suggested continuation for the next belt", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 } });
  g.placeMachine("belt", 2, 1, 1); // heading down, feeds (2,2)
  const input = makeInput(g);
  input.setTool("belt");
  input._build(new DragPath(2, 2)); // suggested r=1 (down), not the default 0
  assert.equal(input.ghostDir, 1, "the ghost keeps the direction that was used");
});
