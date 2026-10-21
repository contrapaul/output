// M1/M3 flow simulation tests.
// Headless: item advance, spacing, backpressure, ejection, conservation,
// plus M3: mid-line acceptance (hoppers), polyline positions, turns.

import test from "node:test";
import assert from "node:assert/strict";

import { FlowLine } from "../src/game/systems/flow.js";
import { OrderDock } from "../src/game/systems/dock.js";

function Dock(item, amount) {
  const d = new OrderDock(0, 0);
  d.setSlot(0, { item, amount });
  return d;
}
import { CONFIG } from "../src/core/config.js";

function makeLine(tiles) {
  // tiles: array of {x, y, z, dir} head to tail
  const built = tiles.map((t, i) => ({ key: `${t.x},${t.y},${t.z || 0}`, ...t }));
  const line = {
    id: "test_line",
    tiles: built,
    links: new Map(),
    get head() { return built[0].key; },
    get tail() { return built[built.length - 1].key; },
    get length() { return built.length; },
    has(k) { return built.some((t) => t.key === k); },
    index(k) { return built.findIndex((t) => t.key === k); },
    tile(k) { return built.find((t) => t.key === k) || null; },
    keys() { return built.map((t) => t.key); },
  };
  return line;
}

const straight = (n) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0, dir: 0 }));

test("item advances at belt rate", () => {
  const flow = new FlowLine(makeLine(straight(5)), null);
  flow.accept("m1");
  const velocity = CONFIG.BELT_RATE / 30;
  const startD = flow.items[0].d;
  flow.step(velocity, () => false);
  const endD = flow.items[0].d;
  assert.ok(endD > startD, "item should advance");
  assert.ok(endD - startD < 0.1, "should not jump too far");
});

test("spacing is maintained between two items", () => {
  const flow = new FlowLine(makeLine(straight(10)), null);
  flow.accept("a");
  flow.items[0].d = 0;
  flow.items.push({ d: 2, item: "b" });
  const velocity = (CONFIG.BELT_RATE / 30) * 10;
  for (let i = 0; i < 30; i++) flow.step(velocity, () => false);
  const spacing = flow.items[1].d - flow.items[0].d;
  assert.ok(spacing >= CONFIG.MIN_SPACING - 0.001, `spacing ${spacing} < ${CONFIG.MIN_SPACING}`);
});

test("backpressure: blocked tail clamps the line", () => {
  const flow = new FlowLine(makeLine(straight(5)), null);
  flow.accept("a");
  flow.items[0].d = 0;
  flow.items.push({ d: 1, item: "b" });
  flow.items.push({ d: 2, item: "c" });
  const velocity = CONFIG.BELT_RATE / 30;
  for (let i = 0; i < 60; i++) flow.step(velocity, () => false);
  const maxD = Math.max(...flow.items.map((i) => i.d));
  assert.ok(maxD <= line_maxD() + 0.01, `no item should pass the tail (max d = ${maxD})`);
  assert.equal(flow.count(), 3);
  function line_maxD() { return 4; }
});

test("ejection works when tail is free", () => {
  const flow = new FlowLine(makeLine(straight(3)), null);
  flow.accept("item1");
  flow.items[0].d = 0;
  let ejected = [];
  const velocity = CONFIG.BELT_RATE / 30;
  for (let i = 0; i < 120; i++) {
    ejected.push(...flow.step(velocity, () => true));
    if (ejected.length) break;
  }
  assert.equal(ejected.length, 1);
  assert.equal(ejected[0], "item1");
  assert.equal(flow.count(), 0);
});

test("ejection is item-specific (canEject receives the item id)", () => {
  const flow = new FlowLine(makeLine(straight(2)), null);
  flow.accept("wrong_item");
  flow.items[0].d = 0;
  const seen = [];
  const velocity = CONFIG.BELT_RATE / 30;
  let ejected = [];
  for (let i = 0; i < 120; i++) {
    ejected.push(...flow.step(velocity, (item) => { seen.push(item); return item === "right_item"; }));
    if (ejected.length) break;
  }
  assert.equal(ejected.length, 0, "wrong item must not eject");
  assert.ok(seen.includes("wrong_item"), "canEject should be called with the item id");
});

test("accept at mid-line distance (hopper insertion)", () => {
  const flow = new FlowLine(makeLine(straight(6)), null);
  flow.accept("a");
  flow.items[0].d = 3; // item parked mid-line
  assert.equal(flow.accept("b", 0), true); // head is free
  assert.equal(flow.accept("c", 3), false); // too close to "a"
  assert.equal(flow.accept("d", 1), true); // gap between head and "a"
  const ds = flow.items.map((i) => i.d).sort((x, y) => x - y);
  assert.deepEqual(ds, [0, 1, 3]);
});

test("posAt follows turns", () => {
  const line = makeLine([
    { x: 0, y: 0, z: 0, dir: 0 },
    { x: 1, y: 0, z: 0, dir: 0 },
    { x: 2, y: 0, z: 0, dir: 1 }, // turns down
    { x: 2, y: 1, z: 0, dir: 1 },
  ]);
  const flow = new FlowLine(line, null);
  const tile = 40;
  assert.deepEqual(flow.posAt(0, tile), { x: 20, y: 20, z: 0 });
  assert.deepEqual(flow.posAt(1, tile), { x: 60, y: 20, z: 0 });
  // d=2 is the corner tile center
  assert.deepEqual(flow.posAt(2, tile), { x: 100, y: 20, z: 0 });
  // d=2.5 is halfway into the next tile (down)
  assert.deepEqual(flow.posAt(2.5, tile), { x: 100, y: 40, z: 0 });
  assert.deepEqual(flow.posAt(3, tile), { x: 100, y: 60, z: 0 });
});

test("posAt on overhead line keeps layer z", () => {
  const line = makeLine([{ x: 0, y: 0, z: 1, dir: 0 }, { x: 1, y: 0, z: 1, dir: 0 }]);
  const flow = new FlowLine(line, null);
  assert.equal(flow.posAt(0, 40).z, 1);
});

// ---- Dock tests -----------------------------------------------------------

test("dock accepts target item", () => {
  const dock = Dock("cut(m1)", 10);
  assert.ok(dock.tryAccept("cut(m1)"));
  assert.equal(dock.main.accepted, 1);
});

test("dock rejects wrong item", () => {
  const dock = Dock("cut(m1)", 10);
  assert.equal(dock.tryAccept("m1"), null);
  assert.equal(dock.lastReject, "m1");
});

test("dock completes at target amount", () => {
  const dock = Dock("cut(m1)", 3);
  dock.tryAccept("cut(m1)");
  dock.tryAccept("cut(m1)");
  assert.equal(dock.complete, false);
  dock.tryAccept("cut(m1)");
  assert.equal(dock.complete, true);
  assert.equal(dock.tryAccept("cut(m1)"), null, "a filled order takes no more");
});

// ---- Conservation test ----------------------------------------------------

test("conservation: items in = items out (no creation/destruction)", () => {
  const flow = new FlowLine(makeLine(straight(4)), null);
  const dock = Dock("m1", 10);
  let emitted = 0, accepted = 0;
  const velocity = CONFIG.BELT_RATE / 30;
  for (let tick = 0; tick < 600; tick++) {
    if (tick % 30 === 0 && emitted < 10) {
      if (flow.accept("m1")) emitted++;
    }
    const ejected = flow.step(velocity, () => true);
    for (const item of ejected) {
      if (dock.tryAccept(item)) accepted++;
    }
    assert.equal(flow.count(), emitted - accepted,
      `tick ${tick}: inWorld=${flow.count()}, emitted=${emitted}, accepted=${accepted}`);
    if (dock.complete) break;
  }
  assert.equal(dock.main.accepted, 10);
  assert.equal(flow.count(), 0);
});

// ---- Phase 4 fix: every item moves each tick ---------------------------------

test("every item on a busy belt moves each tick (not just the front one)", () => {
  const flow = new FlowLine(makeLine(straight(10)), null);
  flow.accept("m1", 0);
  flow.accept("m1", 1);
  flow.accept("m1", 2);
  const v = CONFIG.BELT_RATE / 30;
  flow.step(v, () => false);
  assert.deepEqual(flow.items.map((i) => +i.d.toFixed(6)), [0, 1, 2].map((d) => +(d + v).toFixed(6)));
});

test("a long belt carries parts at the belt's full capacity", () => {
  const flow = new FlowLine(makeLine(straight(12)), null);
  let out = 0;
  const v = CONFIG.BELT_RATE / 30;
  for (let t = 0; t < 30 * 60; t++) {
    flow.accept("m1", 0); // feed as fast as spacing allows
    out += flow.step(v, () => true).length;
  }
  const capacity = (CONFIG.BELT_RATE / CONFIG.MIN_SPACING) * 60; // parts a minute
  assert.ok(out > capacity * 0.85, `${out} a minute out, belt capacity about ${Math.round(capacity)}`);
});
