// Phase 2 tests: abstract items and operations, depots, the order dock,
// the campaign (auto-advance, unlocks, expansion), contract data, save v3.

import test from "node:test";
import assert from "node:assert/strict";

import {
  make, itemExists, isPart, isAssembly, isShell, depth, itemName, recipeSteps, RAW, DEPTH_LIMIT,
} from "../src/game/items.js";
import { HANDLERS, PORTS } from "../src/game/systems/process.js";
import { GameRoot } from "../src/game/root.js";
import { Campaign, CONTRACTS, STAGES, ALL_TOOLS, sandboxGame } from "../src/game/campaign.js";
import { SaveSystem } from "../src/game/save.js";
import { DragPath } from "../src/game/dragpath.js";
import { planPlacement, applyPlan } from "../src/game/build.js";
import { plot } from "../src/data/index.js";

const { cut, press, join } = make;

// ---- items and operations ---------------------------------------------------

test("items: canonical ids, join is order-free, case keeps assembly first", () => {
  assert.equal(join("m3", cut("m1")), join(cut("m1"), "m3"));
  assert.equal(join("m3", cut("m1")), "join(cut(m1)|m3)");
  const a = join("m1", "m2");
  assert.equal(make.case(a, "m4"), "case(join(m1|m2)|m4)");
  assert.ok(itemExists("case(join(m1|m2)|m4)"));
  assert.equal(itemExists("case(m4|join(m1|m2))"), false);
  assert.equal(itemExists("join(m2|m1)"), false, "unsorted join is not canonical");
});

test("items: parts, pressing is final, shells, depth", () => {
  assert.ok(isPart("m1") && isPart(cut(cut("m1"))) && isPart(press(cut("m2"))));
  assert.equal(isPart(cut(press("m1"))), false, "a pressed part cannot be cut");
  assert.equal(isPart(press(press("m1"))), false, "or pressed again");
  assert.equal(isPart(join("m1", "m2")), false);
  assert.ok(isAssembly(join("m1", "m2")));
  assert.ok(isShell("m4") && isShell(press("m4")) && !isShell("m1"));
  assert.equal(depth("m1"), 0);
  assert.equal(depth(join(cut("m1"), "m3")), 2);
  assert.equal(RAW.length, 4);
});

test("items: generated labels and recipe steps read clearly", () => {
  assert.equal(itemName(cut(cut("m1"))), "M1 quarter");
  assert.equal(itemName(press(cut("m2"))), "pressed M2 half");
  assert.equal(itemName(join(join(cut("m1"), "m3"), press("m2"))), "(M1 half + M3) + pressed M2");
  assert.deepEqual(recipeSteps(join(cut("m1"), cut("m1"))), ["Cut M1", "Combine M1 half with M1 half"]);
});

test("operations: what each machine takes and makes", () => {
  const H = HANDLERS;
  assert.deepEqual(H.cutter.process(["m1"]).outputs, [cut("m1"), cut("m1")]);
  assert.equal(H.cutter.canTake(press("m1"), []), false);
  assert.equal(H.cutter.canTake(join("m1", "m2"), []), false, "assemblies cannot be cut");
  assert.deepEqual(H.press.process([cut("m2")]).outputs, [press(cut("m2"))]);
  assert.deepEqual(H.combiner.process(["m3", "m1"]).outputs, [join("m1", "m3")]);
  const a = join("m1", "m2");
  assert.ok(H.encaser.canTake(a, []) && H.encaser.canTake("m4", [a]));
  assert.equal(H.encaser.canTake("m1", [a]), false, "m1 is not a shell");
  assert.equal(H.encaser.canTake(join("m3", "m3"), [a]), false, "only one assembly");
  assert.deepEqual(H.encaser.process(["m4", a]).outputs, [make.case(a, "m4")]);
});

test("operations: the depth limit stops endless nesting", () => {
  let x = "m1";
  for (let i = 0; i < DEPTH_LIMIT; i++) x = join(x, "m2");
  assert.equal(depth(x), DEPTH_LIMIT);
  assert.equal(HANDLERS.combiner.canTake(x, []), false);
});

test("combiner: one part from each side, so one belt cannot pair with itself", () => {
  const g = new GameRoot({ zone: { w: 10, h: 6 }, hoppers: [{ x: 0, y: 2, r: 0, item: "m1" }] });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("combiner", 2, 2, 0);
  for (let i = 0; i < 300; i++) g.tick();
  const m = g.machines.get("2,2");
  assert.equal(m.inputs.length, 1, "the second m1 from the same side waits");
  assert.equal(m.outputs.length, 0);
});

test("combiner: two sides make the pair", () => {
  const g = new GameRoot({
    zone: { w: 10, h: 6 },
    hoppers: [{ x: 0, y: 2, r: 0, item: "m1" }, { x: 2, y: 0, r: 1, item: "m3" }],
  });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("belt", 2, 1, 1);
  g.placeMachine("combiner", 2, 2, 0);
  g.placeMachine("recycler", 3, 2, 0);
  for (let i = 0; i < 600; i++) g.tick();
  assert.ok(g.recycled >= 2, "assemblies came out");
  assert.ok(g.ledgerOk(), "ledger exact with 2 into 1");
});

// ---- depots -----------------------------------------------------------------

test("depots: store one kind of part, up to capacity, and feed it out", () => {
  const g = new GameRoot({ zone: { w: 10, h: 4 } });
  g.placeMachine("belt", 1, 1, 0);
  g.placeMachine("depot_s", 2, 1, 0);
  const d = g.machines.get("2,1");
  assert.equal(d.handler.capacity, 50);
  assert.ok(g._machineCanTake(d, "m1", 2));
  d.buffer.push("m1");
  assert.equal(g._machineCanTake(d, "m2", 2), false, "type locked to m1");
  assert.deepEqual(PORTS.depot_m.out, [0]);
  assert.equal(HANDLERS.depot_l.capacity, 1000);
});

test("depots: a pre-filled depot is a supply drop that works like a hopper", () => {
  const g = new GameRoot({ zone: { w: 10, h: 4 }, dock: { x: 6, y: 1 }, target: { item: press("m4"), amount: 5 } });
  g.placeFilledDepot("depot_m", 1, 1, 0, "m4", 30);
  g.placeMachine("belt", 2, 1, 0);
  g.placeMachine("press", 3, 1, 0);
  g.placeMachine("belt", 4, 1, 0);
  g.placeMachine("belt", 5, 1, 0);
  for (let i = 0; i < 3000 && !g.dock.complete; i++) g.tick();
  assert.ok(g.dock.complete);
  assert.equal(g.injected, 30);
  assert.ok(g.ledgerOk());
  // once empty it is a normal depot
  for (let i = 0; i < 3000; i++) g.tick();
});

// ---- order dock ---------------------------------------------------------------

test("dock: 2x2, takes only what an open slot needs, wrong parts wait", () => {
  const g = new GameRoot({
    zone: { w: 12, h: 6 },
    hoppers: [{ x: 0, y: 2, r: 0, item: "m1" }],
    dock: { x: 8, y: 2 },
    target: { item: "m2", amount: 5 },
  });
  assert.equal(g.world.machineAt(9, 3).t, "dock");
  for (let x = 1; x <= 7; x++) g.placeMachine("belt", x, 2, 0);
  for (let i = 0; i < 900; i++) g.tick();
  assert.equal(g.delivered, 0);
  assert.ok(g.itemCount() > 0, "m1 parts wait on the belt, none lost");
  assert.ok(g.ledgerOk());
  assert.match(g.findJam().msg, /dock does not need/);
  // a side order for m1 opens: now the dock takes it
  g.dock.setSlot(1, { item: "m1", amount: 3, creditEach: 2 });
  for (let i = 0; i < 900; i++) g.tick();
  assert.equal(g.dock.slots[1].accepted, 3);
  assert.equal(g.coins, 6);
});

// ---- campaign -------------------------------------------------------------------

/** Build along a path the way a player drags (uses the real planner). */
function drag(g, tool, pts, r) {
  const p = new DragPath(pts[0][0], pts[0][1], r ?? 0);
  for (const [x, y] of pts.slice(1)) p.moveTo(x, y);
  const tiles = tool === "belt" || tool === "belt_high" ? p.withDirs() : p.withDirs().map((t) => ({ ...t, r }));
  const plan = planPlacement(g.world, tool, tiles, tool === "belt_high" ? 1 : 0);
  const bad = plan.filter((s) => s.action === "invalid");
  assert.equal(bad.length, 0, `${tool} path blocked: ${JSON.stringify(bad)}`);
  return applyPlan(g, plan);
}

function runUntil(c, index, maxTicks = 30 * 600) {
  for (let i = 0; i < maxTicks && c.index < index; i++) c.game.tick();
  assert.equal(c.index, index, `reached contract ${index + 1} (stuck on ${c.current?.id})`);
}

test("campaign: contracts arrive on their own, unlock tools, and the plot grows", () => {
  const c = new Campaign();
  const g = c.game;
  const events = [];
  let sideCredits = 0;
  g.signals.on("itemAccepted", (e) => { if (e.slot.kind === "side") sideCredits += e.gain; });
  g.signals.on("contractComplete", (e) => events.push(e.contract.id));
  g.signals.on("expanded", (e) => events.push(`stage${e.stage}`));
  assert.deepEqual(c.tools(), ["belt"]);
  assert.equal(g.dock.main.item, CONTRACTS[0].item);

  // c01: m1 straight to the dock
  drag(g, "belt", [[2, 3], [10, 3], [10, 5], [12, 5]]);
  runUntil(c, 1);
  assert.ok(c.tools().includes("cutter"));
  // c02: insert a cutter
  drag(g, "cutter", [[4, 3]], 0);
  runUntil(c, 2);
  // c03: pressed m2 on a second line
  drag(g, "belt", [[2, 8], [9, 8], [9, 6], [12, 6]]);
  drag(g, "press", [[4, 8]], 0);
  runUntil(c, 3);
  // c04: quarters - a second cutter on the m1 line (old halves drain into
  // the dock for free, so nothing needs clearing)
  drag(g, "cutter", [[6, 3]], 0);
  runUntil(c, 4);
  // c05 (milestone): pressed m2 half - a cutter before the press
  drag(g, "cutter", [[3, 8]], 0);
  assert.equal(g.world.zone.w, STAGES[0].zone.w);
  runUntil(c, 5);
  assert.equal(c.stage, 1);
  assert.deepEqual(g.world.zone, { ...STAGES[1].zone });
  assert.ok(c.tools().includes("combiner"));
  assert.equal(g.hoppers.length, 4, "new hoppers arrived with the new land");

  // c06: M1 half + M3 - back to halves, and bring m3 in from the new hopper
  g.removeMachine(6, 3);
  g.placeMachine("belt", 6, 3, 0);
  for (let i = 0; i < 300; i++) g.tick(); // old quarters drain into the dock
  drag(g, "combiner", [[10, 4]], 1); // swaps the belt; faces down, m1 halves enter its back
  drag(g, "belt", [[-3, 1], [12, 1], [12, 4], [11, 4]]); // m3 enters its other side
  runUntil(c, 6);
  assert.deepEqual(events.slice(0, 6), ["c01", "c02", "c03", "c04", "stage1", "c05"]);
  assert.ok(g.ledgerOk(), "no part created or lost across the whole run");
  assert.ok(g.dock.leftoversTaken > 0, "old parts drained into the dock");
  const paid = CONTRACTS.slice(0, 6).reduce((n, k) => n + k.amount * k.creditEach, 0);
  assert.equal(g.coins, paid + sideCredits, "leftovers paid nothing (side orders pay extra)");
});

test("dock leftovers: earlier contracts' parts are taken free, no progress, no credits", () => {
  const c = new Campaign({ index: 2, stage: 0, unlocked: ["belt", "cutter", "press"] });
  const g = c.game;
  assert.ok(g.dock.wants("m1") && g.dock.wants(make.cut("m1")), "c01 and c02 items are leftovers");
  assert.equal(g.dock.wants(make.cut(make.cut("m1"))), false, "a part never ordered still waits");
  drag(g, "belt", [[2, 3], [10, 3], [10, 5], [12, 5]]);
  for (let i = 0; i < 900; i++) g.tick();
  assert.ok(g.dock.leftoversTaken > 0);
  assert.equal(g.coins, 0);
  assert.equal(g.dock.main.accepted, 0);
  assert.equal(c.index, 2);
  assert.ok(g.ledgerOk());
});

test("campaign: an encaser line completes a product order (c11 item)", () => {
  const item = CONTRACTS.find((c) => c.id === "c11").item; // (M1 half + M3) in M4 shell
  const g = new GameRoot({ zone: { w: 14, h: 8 }, dock: { x: 11, y: 3 }, target: { item, amount: 4 } });
  g.placeFilledDepot("depot_m", 0, 2, 0, "m1", 20);
  g.placeFilledDepot("depot_m", 3, 0, 1, "m3", 20);
  g.placeFilledDepot("depot_m", 5, 6, 3, "m4", 20);
  drag(g, "belt", [[1, 2], [1, 2]]);
  g.placeMachine("cutter", 2, 2, 0);
  g.placeMachine("combiner", 3, 2, 0); // halves from the back, m3 from above
  g.placeMachine("belt", 3, 1, 1);
  g.placeMachine("belt", 4, 2, 0);
  g.placeMachine("encaser", 5, 2, 0); // assembly from the back, m4 from below
  drag(g, "belt", [[5, 5], [5, 3]]);
  drag(g, "belt", [[6, 2], [10, 2], [10, 3]]);
  g.rotateAt(10, 3, 0, 0);
  for (let i = 0; i < 30 * 120 && !g.dock.complete; i++) g.tick();
  assert.ok(g.dock.complete, `product order filled (${g.dock.main.accepted}/4)`);
  assert.ok(g.ledgerOk());
});

test("sandbox: largest plot, every hopper, no orders", () => {
  const g = sandboxGame();
  assert.deepEqual(g.world.zone, { ...STAGES[STAGES.length - 1].zone });
  assert.equal(g.hoppers.length, STAGES.flatMap((s) => s.hoppers).length);
  assert.equal(g.dock.main, null);
});

// ---- data checks --------------------------------------------------------------------

test("contracts: valid items, known tools, reachable with what is unlocked by then", () => {
  const unlocked = new Set(["belt"]);
  let stage = 0;
  const opFor = { cut: "cutter", press: "press", join: "combiner", case: "encaser" };
  const needs = (id, out = new Set()) => {
    const open = id.indexOf("(");
    if (open === -1) { out.add(`raw:${id}`); return out; }
    out.add(opFor[id.slice(0, open)]);
    const inner = id.slice(open + 1, -1);
    let d = 0, s = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") d++;
      else if (inner[i] === ")") d--;
      else if (inner[i] === "|" && d === 0) { needs(inner.slice(s, i), out); s = i + 1; }
    }
    needs(inner.slice(s), out);
    return out;
  };
  const ids = new Set();
  for (const c of CONTRACTS) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(itemExists(c.item), `${c.id}: unknown item ${c.item}`);
    assert.ok((c.amount > 0 || (c.rate?.perMinute > 0 && c.rate?.minutes > 0)) && Number.isFinite(c.creditEach), `${c.id}: amount (or rate) and credits`);
    assert.ok(!/—/.test(c.title + c.brief), `${c.id}: no em dashes`);
    const raws = new Set(STAGES.slice(0, stage + 1).flatMap((s) => s.hoppers.map((h) => h.item)));
    for (const n of needs(c.item)) {
      if (n.startsWith("raw:")) assert.ok(raws.has(n.slice(4)), `${c.id}: no hopper for ${n.slice(4)} by stage ${stage}`);
      else assert.ok(unlocked.has(n), `${c.id}: needs ${n} before it is unlocked`);
    }
    for (const t of c.unlock || []) {
      assert.ok(ALL_TOOLS.includes(t), `${c.id}: unknown tool ${t}`);
      unlocked.add(t);
    }
    if (c.milestone) stage = Math.min(stage + 1, STAGES.length - 1);
  }
});

test("plot: stages only grow, hoppers and the dock sit inside their stage", () => {
  const inside = (p, z) => p.x >= z.x && p.y >= z.y && p.x < z.x + z.w && p.y < z.y + z.h;
  for (let i = 0; i < STAGES.length; i++) {
    const z = STAGES[i].zone;
    if (i > 0) {
      const prev = STAGES[i - 1].zone;
      assert.ok(z.x <= prev.x && z.y <= prev.y && z.x + z.w >= prev.x + prev.w && z.y + z.h >= prev.y + prev.h, `stage ${i} contains stage ${i - 1}`);
    }
    for (const h of STAGES[i].hoppers) assert.ok(inside(h, z) && RAW.includes(h.item), `stage ${i} hopper ${JSON.stringify(h)}`);
  }
  assert.ok(inside(plot.dock, STAGES[0].zone) && inside({ x: plot.dock.x + 1, y: plot.dock.y + 1 }, STAGES[0].zone));
});

// ---- save v3 --------------------------------------------------------------------

test("save v3: reload gives the same factory, parts in transit included", () => {
  const c = new Campaign();
  const g = c.game;
  drag(g, "belt", [[2, 3], [10, 3], [10, 5], [12, 5]]);
  for (let i = 0; i < 200; i++) g.tick();
  const sys = new SaveSystem();
  const data = JSON.parse(JSON.stringify(sys.serialize(c)));
  const c2 = sys.restore(data);
  const g2 = c2.game;
  assert.equal(g2.itemCount(), g.itemCount());
  assert.equal(g2.world.machines.size, g.world.machines.size);
  assert.deepEqual(c2.state(), c.state());
  assert.ok(g2.ledgerOk());
  // both run on identically
  for (let i = 0; i < 300; i++) { g.tick(); g2.tick(); }
  assert.equal(g2.delivered, g.delivered);
  assert.equal(g2.itemCount(), g.itemCount());
  assert.equal(c2.index, c.index);
});

test("save v3: machine contents and campaign progress survive", () => {
  const c = new Campaign({ index: 5, stage: 1, unlocked: ["belt", "combiner", "depot_s"] }, { coins: 42 });
  c.game.placeMachine("combiner", 3, 3, 0);
  c.game.machines.get("3,3").inputs.push("m1");
  c.game.machines.get("3,3").inputSides.push(2);
  c.game.placeFilledDepot("depot_s", 5, 5, 0, "m2", 12);
  const sys = new SaveSystem();
  const c2 = sys.restore(JSON.parse(JSON.stringify(sys.serialize(c))));
  assert.deepEqual(c2.game.machines.get("3,3").inputs, ["m1"]);
  assert.equal(c2.game.machines.get("5,5").buffer.length, 12);
  assert.equal(c2.stage, 1);
  assert.equal(c2.game.coins, 42);
  assert.equal(c2.game.hoppers.length, 4);
});

test("save migration: a v2 save becomes a new factory that keeps its credits", () => {
  const sys = new SaveSystem();
  const v2 = {
    format: "output.save", version: 2,
    profile: { coins: 75, upgrades: ["motor2x"], contracts: { u2: { stars: 3 } } },
    active: { level: "u2", machines: [{ t: "saw", x: 1, y: 1, r: 0, z: 0 }] },
    settings: { theme: "dark", motion: true, colorblind: false }, stats: { timePlayedSec: 10, machinesBuilt: 3 },
  };
  const v3 = sys.migrate(v2);
  assert.equal(v3.version, 3);
  assert.equal(v3.coins, 75);
  const c = sys.restore(v3);
  assert.equal(c.index, 0);
  assert.equal(c.game.coins, 75);
  assert.equal(c.game.settings.theme, "dark");
});
