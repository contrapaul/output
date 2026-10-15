// Belt line tests (M3): turns, layers, placement rules, invariants.
// Headless: node --test.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/game/world.js";
import { wouldCreateCycle } from "../src/game/line.js";
import { tileKey } from "../src/core/grid.js";

function makeWorld(w = 8, h = 6) {
  return new World({ w, h });
}

function assertInvariants(world) {
  const belts = world.allBelts();
  const seen = new Set();
  for (const line of world.lines.allLines()) {
    for (const k of line.keys()) {
      assert.ok(!seen.has(k), `tile ${k} in two lines`);
      seen.add(k);
    }
    // chain integrity
    for (let i = 0; i < line.tiles.length; i++) {
      const prev = i > 0 ? line.tiles[i - 1].key : null;
      const next = i < line.tiles.length - 1 ? line.tiles[i + 1].key : null;
      const link = line.links.get(line.tiles[i].key);
      assert.equal(link.prev, prev, `link.prev mismatch at ${line.tiles[i].key}`);
      assert.equal(link.next, next, `link.next mismatch at ${line.tiles[i].key}`);
    }
  }
  for (const b of belts) {
    assert.ok(seen.has(tileKey(b.x, b.y, b.z || 0)), `belt at (${b.x},${b.y},${b.z}) not in any line`);
  }
  // consecutive tiles: tile i must face tile i+1
  for (const line of world.lines.allLines()) {
    for (let i = 0; i + 1 < line.tiles.length; i++) {
      const a = line.tiles[i];
      const b = line.tiles[i + 1];
      const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      assert.equal(b.x, a.x + D[a.dir][0], `follower not in a's direction`);
      assert.equal(b.y, a.y + D[a.dir][1], `follower not in a's direction`);
      assert.equal(a.z, b.z, `line must stay on one layer`);
    }
  }
}

test("single belt forms a length-1 line", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0);
  const line = w.lines.lineForTile(3, 3, 0);
  assert.ok(line);
  assert.equal(line.length, 1);
  assert.equal(line.head, tileKey(3, 3, 0));
  assert.equal(line.tail, tileKey(3, 3, 0));
  assertInvariants(w);
});

test("placing a straight chain extends the line", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0);
  w.place("belt", 4, 3, 0);
  w.place("belt", 5, 3, 0);
  const line = w.lines.lineForTile(3, 3, 0);
  assert.equal(line.length, 3);
  assert.deepEqual(line.keys(), [tileKey(3, 3), tileKey(4, 3), tileKey(5, 3)]);
  assertInvariants(w);
});

test("turns form one line (L shape)", () => {
  const w = makeWorld();
  // (3,3) east -> (4,3) south -> (4,4) south -> (4,5)
  w.place("belt", 3, 3, 0);
  w.place("belt", 4, 3, 1);
  w.place("belt", 4, 4, 1);
  w.place("belt", 4, 5, 1);
  const line = w.lines.lineForTile(3, 3, 0);
  assert.equal(line.length, 4, `expected 4, got ${line.length}`);
  assert.deepEqual(line.keys(), [tileKey(3, 3), tileKey(4, 3), tileKey(4, 4), tileKey(4, 5)]);
  assertInvariants(w);
});

test("placing in the middle of a chain splices it", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0);
  w.place("belt", 5, 3, 0);
  assert.equal(w.lines.allLines().length, 2);
  w.place("belt", 4, 3, 0);
  assert.equal(w.lines.allLines().length, 1);
  const line = w.lines.lineForTile(3, 3, 0);
  assert.equal(line.length, 3);
  assert.deepEqual(line.keys(), [tileKey(3, 3), tileKey(4, 3), tileKey(5, 3)]);
  assertInvariants(w);
});

test("removing a middle tile splits the line", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0);
  w.place("belt", 4, 3, 0);
  w.place("belt", 5, 3, 0);
  w.remove(4, 3);
  const lines = w.lines.allLines();
  assert.equal(lines.length, 2);
  assert.equal(w.lines.lineForTile(3, 3, 0).length, 1);
  assert.equal(w.lines.lineForTile(5, 3, 0).length, 1);
  assertInvariants(w);
});

test("removing the tail shortens the line", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0);
  w.place("belt", 4, 3, 0);
  w.place("belt", 5, 3, 0);
  w.remove(5, 3);
  const line = w.lines.lineForTile(3, 3, 0);
  assert.equal(line.length, 2);
  assert.deepEqual(line.keys(), [tileKey(3, 3), tileKey(4, 3)]);
  assertInvariants(w);
});

test("removing the head shortens the line", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0);
  w.place("belt", 4, 3, 0);
  w.place("belt", 5, 3, 0);
  w.remove(3, 3);
  const line = w.lines.lineForTile(4, 3, 0);
  assert.equal(line.length, 2);
  assert.deepEqual(line.keys(), [tileKey(4, 3), tileKey(5, 3)]);
  assertInvariants(w);
});

test("loop placement is rejected", () => {
  const w = makeWorld();
  w.place("belt", 2, 2, 0); // east
  w.place("belt", 3, 2, 1); // south
  w.place("belt", 3, 3, 2); // west
  // (2,3) north would close the 2x2 loop
  assert.equal(w.place("belt", 2, 3, 3), null, "loop close should be rejected");
  assert.equal(wouldCreateCycle(w, 2, 3, 0, 3), true);
  assertInvariants(w);
});

test("two feeders into one belt are rejected", () => {
  const w = makeWorld();
  w.place("belt", 2, 2, 0); // points at (3,2)
  w.place("belt", 3, 1, 1); // points at (3,2)
  assert.equal(w.place("belt", 3, 2, 0), null, "double feed should be rejected");
  // the two existing belts are still separate single-belt lines
  assert.equal(w.lines.allLines().length, 2);
  assertInvariants(w);
});

test("two belts facing each other are rejected (2-cycle)", () => {
  const w = makeWorld();
  w.place("belt", 3, 3, 0); // points right, into (4,3)
  assert.equal(w.place("belt", 4, 3, 2), null, "facing back into the feeder is a loop");
  assertInvariants(w);
});

test("overhead belts cross ground belts in the same tile", () => {
  const w = makeWorld();
  w.place("belt", 2, 3, 0);
  w.place("belt", 3, 3, 0);
  const over = w.place("belt_high", 2, 3, 1, 1); // vertical overhead over (2,3)
  assert.ok(over, "overhead over a ground belt should be allowed");
  w.place("belt_high", 2, 2, 1, 1);
  w.place("belt_high", 2, 4, 1, 1);
  // ground line and overhead line are separate
  assert.equal(w.lines.lineForTile(2, 3, 0).length, 2);
  assert.deepEqual(w.lines.lineForTile(2, 3, 1).keys(), [
    "2,2,1", "2,3,1", "2,4,1",
  ]);
  assert.equal(w.lines.lineForTile(2, 2, 1).length, 3);
  assertInvariants(w);
});

test("overhead cannot be placed over a machine", () => {
  const w = makeWorld();
  w.place("saw", 4, 3, 0);
  assert.equal(w.place("belt_high", 4, 3, 0, 1), null);
});

test("ground belt cannot be placed where overhead exists", () => {
  const w = makeWorld();
  w.place("belt_high", 3, 3, 0, 1);
  assert.equal(w.place("belt", 3, 3, 0), null);
});

test("machines occupy a ground tile and block belts", () => {
  const w = makeWorld();
  w.place("saw", 3, 3, 0);
  assert.equal(w.place("belt", 3, 3, 0), null);
  assert.equal(w.place("bin", 3, 3, 0), null);
});

test("rebuild reproduces the same lines as incremental", () => {
  const w = makeWorld(10, 10);
  const layout = [
    [3, 3, 0, 0],
    [4, 3, 1, 0], // turn
    [4, 4, 1, 0],
    [1, 1, 0, 0],
    [2, 1, 0, 0],
    [4, 3, 0, 1], // overhead crossing (4,3)
    [4, 2, 0, 1],
  ];
  for (const [x, y, r, z] of layout) w.place(z ? "belt_high" : "belt", x, y, r, z);
  const before = w.lines.allLines().map((l) => l.keys().slice().sort()).sort();
  w.lines.rebuild();
  const after = w.lines.allLines().map((l) => l.keys().slice().sort()).sort();
  assert.deepEqual(after, before);
  assertInvariants(w);
});

test("zone bounds are enforced", () => {
  const w = makeWorld(4, 3);
  assert.ok(w.place("belt", 0, 0, 0));
  assert.equal(w.place("belt", 4, 0, 0), null);
  assert.equal(w.place("belt", 0, 3, 0), null);
  assert.equal(w.place("belt", -1, 0, 0), null);
});
