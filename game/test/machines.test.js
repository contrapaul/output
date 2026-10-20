// Machine handler tests (M3): process form { outputs, left }, all machines.

import test from "node:test";
import assert from "node:assert/strict";

import { HANDLERS } from "../src/game/systems/process.js";
import { SaveSystem } from "../src/game/save.js";

const BOARD = "solder(copper_coil|silicon_die)";
const MODULE = "mount(battery_cell|solder(copper_coil|silicon_die))";
const DEVICE = "encap(housing|mount(battery_cell|solder(copper_coil|silicon_die)))";

test("saw: ingot -> 2 wafers", () => {
  assert.deepEqual(HANDLERS.saw.process(["silicon_ingot"]), { outputs: ["silicon_wafer", "silicon_wafer"], left: [] });
});

test("saw: wafer -> 2 dies", () => {
  assert.deepEqual(HANDLERS.saw.process(["silicon_wafer"]), { outputs: ["silicon_die", "silicon_die"], left: [] });
});

test("saw: rejects unknown item", () => {
  assert.equal(HANDLERS.saw.process(["copper_wire"]), null);
});

test("saw: rejects 2 inputs", () => {
  assert.equal(HANDLERS.saw.process(["silicon_ingot", "silicon_ingot"]), null);
});

test("press: wire -> coil", () => {
  assert.deepEqual(HANDLERS.press.process(["copper_wire"]), { outputs: ["copper_coil"], left: [] });
});

test("press: rejects non-wire", () => {
  assert.equal(HANDLERS.press.process(["silicon_ingot"]), null);
});

test("solder: die + coil -> board (order-insensitive)", () => {
  assert.deepEqual(HANDLERS.solder.process(["silicon_die", "copper_coil"]), { outputs: [BOARD], left: [] });
  assert.deepEqual(HANDLERS.solder.process(["copper_coil", "silicon_die"]), { outputs: [BOARD], left: [] });
});

test("solder: rejects wrong pair", () => {
  assert.equal(HANDLERS.solder.process(["silicon_die", "silicon_die"]), null);
  assert.equal(HANDLERS.solder.process(["copper_coil", "copper_coil"]), null);
});

test("mounter: board + cell -> module (order-insensitive)", () => {
  assert.deepEqual(HANDLERS.mounter.process([BOARD, "battery_cell"]), { outputs: [MODULE], left: [] });
  assert.deepEqual(HANDLERS.mounter.process(["battery_cell", BOARD]), { outputs: [MODULE], left: [] });
});

test("encap: module + housing -> device (order-insensitive)", () => {
  assert.deepEqual(HANDLERS.encap.process([MODULE, "housing"]), { outputs: [DEVICE], left: [] });
  assert.deepEqual(HANDLERS.encap.process(["housing", MODULE]), { outputs: [DEVICE], left: [] });
});

test("merger: passes through any item", () => {
  for (const item of ["silicon_ingot", "copper_coil", BOARD]) {
    assert.deepEqual(HANDLERS.merger.process([item]), { outputs: [item], left: [] });
  }
});

test("splitter: one part in, one part out, two exits", () => {
  // Phase 0: the splitter no longer duplicates parts (it routes them)
  assert.deepEqual(HANDLERS.splitter.process(["copper_coil"]), { outputs: ["copper_coil"], left: [] });
  assert.deepEqual(HANDLERS.splitter.process([BOARD]), { outputs: [BOARD], left: [] });
  assert.deepEqual(HANDLERS.splitter.outDirs, [0, 1]);
});

test("recycler: consumes any item, outputs nothing", () => {
  assert.deepEqual(HANDLERS.recycler.process(["silicon_ingot"]), { outputs: [], left: [] });
  assert.deepEqual(HANDLERS.recycler.process([DEVICE]), { outputs: [], left: [] });
});

test("bin: buffer machine with capacity", () => {
  assert.equal(HANDLERS.bin.buffer, true);
  assert.equal(HANDLERS.bin.capacity, 10);
  assert.equal(HANDLERS.bin.process, null);
});

test("every handler documents in/out text for the machine card", () => {
  for (const [id, h] of Object.entries(HANDLERS)) {
    assert.ok(h.inText, `${id} missing inText`);
    assert.ok(h.outText, `${id} missing outText`);
  }
});

test("item registry: all items exist", async () => {
  const { ITEM_REGISTRY } = await import("../src/game/items.js");
  for (const id of [
    "silicon_ingot", "silicon_wafer", "silicon_die",
    "copper_wire", "copper_coil", "battery_cell", "housing",
    BOARD, MODULE, DEVICE,
  ]) {
    assert.ok(ITEM_REGISTRY[id], `missing item: ${id}`);
    assert.ok(ITEM_REGISTRY[id].name, `missing name for: ${id}`);
  }
});

// ---- save system -----------------------------------------------------------

function mockGame(overrides = {}) {
  return Object.assign({
    world: { machinesList: () => [
      { t: "belt", x: 1, y: 2, r: 0, z: 0 },
      { t: "belt_high", x: 1, y: 2, r: 1, z: 1 },
      { t: "saw", x: 3, y: 2, r: 0, z: 0 },
      { t: "dock", x: 5, y: 2, r: 0, z: 0 },
    ] },
    machines: new Map(),
    dock: { accepted: 5 },
    contract: { id: "u2" },
    coins: 12,
    upgrades: new Set(["bin20"]),
    contracts: { "t-a": { stars: 3, bestTime: 40 } },
    settings: { sound: false, theme: "light", motion: true, colorblind: false },
    stats: { timePlayedSec: 300, machinesBuilt: 15 },
    time: 80,
    placedCount: 9,
  }, overrides);
}

test("save v2: serialize captures upgrades, settings, layers", () => {
  const sys = new SaveSystem();
  const data = sys.serialize(mockGame());
  assert.equal(data.format, "output.save");
  assert.equal(data.version, 2);
  assert.equal(data.active.level, "u2");
  assert.equal(data.active.accepted, 5);
  assert.deepEqual(data.profile.upgrades, ["bin20"]);
  assert.equal(data.profile.coins, 12);
  assert.equal(data.settings.motion, true);
  assert.equal(data.settings.colorblind, false);
  const overhead = data.active.machines.find((m) => m.t === "belt_high");
  assert.equal(overhead.z, 1);
  // dock is not serialized (it comes from the level file)
  assert.ok(!data.active.machines.some((m) => m.t === "dock"));
  // round-trip through JSON
  const restored = JSON.parse(JSON.stringify(data));
  assert.equal(restored.active.machines.length, 3);
});

test("save migration: v1 -> v2", () => {
  const sys = new SaveSystem();
  const v1 = {
    format: "output.save",
    version: 1,
    profile: { coins: 50, contracts: { "t-a": { stars: 2 } } },
    active: { level: "t-b", machines: [{ t: "belt", x: 1, y: 2, r: 0 }], accepted: 3 },
    settings: { sound: false, theme: "light" },
    stats: { timePlayedSec: 10, machinesBuilt: 2 },
  };
  const out = sys.migrate(JSON.parse(JSON.stringify(v1)));
  assert.equal(out.version, 2);
  assert.deepEqual(out.profile.upgrades, []);
  assert.equal(out.settings.motion, true);
  assert.equal(out.settings.colorblind, false);
  assert.equal(out.active.time, 0);
  assert.equal(out.active.placedCount, 0);
  assert.equal(out.active.machines[0].z, 0);
  assert.equal(out.profile.contracts["t-a"].stars, 2);
});
