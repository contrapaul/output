// Phase 3 tests: power budget, generators, the city cap, perks and level-up
// offers, supply drops, and saving all of it.

import test from "node:test";
import assert from "node:assert/strict";

import { GameRoot, GENERATORS } from "../src/game/root.js";
import { Campaign, CONTRACTS, ALL_TOOLS } from "../src/game/campaign.js";
import { makeOffer, applyPerk, weakestArea, PERKS } from "../src/game/perks.js";
import { planPlacement, applyPlan } from "../src/game/build.js";
import { History } from "../src/game/history.js";
import { SaveSystem } from "../src/game/save.js";
import { MACHINE_NAMES } from "../src/game/systems/process.js";

const capped = (cityPower, coins = 0) => {
  const g = new GameRoot({ zone: { w: 20, h: 12 } }, { coins });
  g.cityPower = cityPower;
  return g;
};

// ---- power budget ---------------------------------------------------------------

test("power: machines use power, belts and logistics do not", () => {
  const g = new GameRoot({ zone: { w: 20, h: 12 } });
  assert.equal(g.powerOf("cutter"), 1);
  assert.equal(g.powerOf("combiner"), 2);
  assert.equal(g.powerOf("belt"), 0);
  assert.equal(g.powerOf("splitter"), 0);
  assert.equal(g.powerOf("depot_l"), 1);
  g.placeMachine("cutter", 1, 1, 0);
  g.placeMachine("combiner", 3, 1, 0);
  assert.equal(g.powerUsed(), 3);
  assert.equal(g.powerSupply(), Infinity, "the city covers everything before the cap");
});

test("power: over the cap, new machines are blocked with a reason; belts still build", () => {
  const g = capped(3);
  assert.ok(g.placeMachine("cutter", 1, 1, 0));
  assert.ok(g.placeMachine("combiner", 3, 1, 0));
  assert.equal(g.placeMachine("cutter", 5, 1, 0), null);
  assert.match(g.budgetError("cutter", 5, 1), /needs 1 power/);
  assert.ok(g.placeMachine("belt", 5, 1, 0), "belts need no power");
  const plan = planPlacement(g.world, "press", [{ x: 7, y: 1, r: 0 }], 0, g);
  assert.equal(plan[0].action, "invalid");
  assert.match(plan[0].reason, /power/);
});

test("power: a drag adds up its own power use", () => {
  const g = capped(3);
  const tiles = [0, 1, 2, 3, 4].map((x) => ({ x: x * 2, y: 4, r: 0 }));
  const plan = planPlacement(g.world, "cutter", tiles, 0, g);
  assert.deepEqual(plan.map((p) => p.action), ["place", "place", "place", "invalid", "invalid"]);
  assert.equal(applyPlan(g, plan).length, 3);
  assert.equal(g.powerUsed(), 3);
});

test("power: going over the cap later never stops running machines", () => {
  const g = new GameRoot({ zone: { w: 20, h: 6 }, hoppers: [{ x: 0, y: 2, r: 0, item: "m1" }] });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("cutter", 2, 2, 0);
  g.placeMachine("recycler", 3, 2, 0);
  g.cityPower = 0; // the city cap arrives below current use
  for (let i = 0; i < 300; i++) g.tick();
  assert.ok(g.recycled > 0, "the line keeps working");
  assert.equal(g.placeMachine("press", 6, 2, 0), null, "but nothing new that needs power");
});

// ---- generators -------------------------------------------------------------------

test("generators: cost credits, add supply, refund when removed, undo is fair", () => {
  const g = capped(0, 100);
  const h = new History(g);
  h.push(applyPlan(g, planPlacement(g.world, "solar", [{ x: 1, y: 1, r: 0 }], 0, g)));
  assert.equal(g.coins, 100 - GENERATORS.solar.price);
  assert.equal(g.powerSupply(), GENERATORS.solar.output);
  assert.ok(g.placeMachine("cutter", 3, 1, 0), "now there is power");
  g.removeMachine(3, 1);
  h.undo();
  assert.equal(g.coins, 100, "removing gives the credits back");
  assert.equal(g.powerSupply(), 0);
});

test("generators: blocked without credits; free builds are used first", () => {
  const g = capped(0, 10);
  assert.match(g.budgetError("solar", 1, 1), /needs 25 credits/);
  g.freeBuilds.solar = 2;
  const plan = planPlacement(g.world, "solar", [{ x: 1, y: 1, r: 0 }, { x: 3, y: 1, r: 0 }, { x: 5, y: 1, r: 0 }], 0, g);
  assert.deepEqual(plan.map((p) => p.action), ["place", "place", "invalid"], "two free, the third needs credits");
  applyPlan(g, plan);
  assert.equal(g.coins, 10);
  assert.equal(g.freeBuilds.solar, 0);
  g.removeMachine(1, 1);
  assert.equal(g.coins, 10, "free panels give nothing back");
});

test("wind turbines need space around them (both ways); calm winds lifts it", () => {
  const g = capped(10, 500);
  g.placeMachine("cutter", 5, 5, 0);
  assert.match(g.budgetError("wind", 6, 5), /empty space/);
  assert.ok(g.placeMachine("belt", 8, 4, 0));
  assert.ok(g.placeMachine("wind", 8, 5, 0), "belts next to it are fine");
  assert.match(g.budgetError("press", 9, 6), /too close to a wind turbine/);
  g.mods.calmWinds = true;
  assert.equal(g.budgetError("press", 9, 6), null);
  assert.equal(g.powerSupply(), 10 + GENERATORS.wind.output);
});

// ---- campaign: the city cap ------------------------------------------------------

test("city cap: the contract sets it, unlocks solar and wind, and gives free panels", () => {
  const capIdx = CONTRACTS.findIndex((c) => typeof c.cityPower === "number");
  assert.ok(capIdx >= 0, "a contract sets the city cap");
  const capC = CONTRACTS[capIdx];
  assert.ok(capC.milestone && capC.unlock.includes("solar") && capC.unlock.includes("wind"));
  const c = new Campaign({ index: capIdx, stage: 1, unlocked: ["belt", "cutter", "combiner", "press"] });
  let capped = null;
  c.game.signals.on("cityCapped", (e) => { capped = e; });
  c.game.dock.main.accepted = capC.amount - 1;
  c.game._dockAccept(capC.item);
  assert.equal(c.index, capIdx + 1);
  assert.equal(capped.cityPower, capC.cityPower);
  assert.equal(c.game.cityPower, capC.cityPower);
  assert.equal(c.game.freeBuilds.solar, 2);
  assert.ok(c.tools().includes("solar") && c.tools().includes("wind"));
  assert.ok(c.game.coins >= 0);
});

test("dead-end guard: after the cap, the player can always get more power", () => {
  const capIdx = CONTRACTS.findIndex((c) => typeof c.cityPower === "number");
  // credits earned up to and including the cap contract, plus its gift
  const earned = CONTRACTS.slice(0, capIdx + 1).reduce((n, c) => n + c.amount * c.creditEach, 0);
  const gift = CONTRACTS[capIdx].gift?.solar || 0;
  assert.ok(gift * GENERATORS.solar.output + Math.floor(earned / GENERATORS.solar.price) * GENERATORS.solar.output >= 4,
    "free panels plus earned credits cover at least two more machines");
});

// ---- perks ------------------------------------------------------------------------

test("perks: data is well formed and plain", () => {
  const cats = new Set(["power", "speed", "supply", "storage", "production", "economy"]);
  for (const p of PERKS) {
    assert.ok(cats.has(p.category), p.id);
    assert.ok(p.name && p.text && !/—/.test(p.name + p.text), `${p.id}: text, no em dashes`);
  }
  assert.ok(ALL_TOOLS.includes("solar") && ALL_TOOLS.includes("wind"));
});

function factory(state = {}) {
  const c = new Campaign({ index: 9, stage: 1, unlocked: ["belt", "cutter", "press", "combiner"], ...state });
  const g = c.game;
  g.placeMachine("cutter", 2, 1, 0, { force: true });
  g.placeMachine("cutter", 2, 2, 0, { force: true });
  g.placeMachine("combiner", 4, 1, 0, { force: true });
  return c;
}

test("perks: each one changes exactly what it says", () => {
  const c = factory({ cityPower: 10 });
  const g = c.game;
  const apply = (card) => applyPerk(c, card);
  apply({ id: "efficient_motors", type: "combiner" });
  assert.equal(g.powerOf("combiner"), 1);
  apply({ id: "free_power", type: "cutter" });
  assert.equal(g.powerOf("cutter"), 0);
  apply({ id: "fast_machines", type: "press" });
  assert.equal(g.mods.typeSpeed.press, 1.25);
  apply({ id: "belt_speed" });
  apply({ id: "belt_speed" });
  assert.ok(Math.abs(g.mods.beltMult - 1.21) < 1e-9, "stacks");
  apply({ id: "rich_hopper", material: "m1" });
  const h = g.hoppers.find((x) => x.item === "m1");
  assert.equal(g.hopperRate(h), h.rate * 1.5);
  apply({ id: "bigger_depots" });
  g.placeMachine("depot_s", 8, 8, 0);
  assert.equal(g.capacityOf(g.machines.get("8,8")), 75);
  apply({ id: "credit_bonus" });
  assert.ok(Math.abs(g.mods.creditMult - 1.1) < 1e-9);
  apply({ id: "discount" });
  assert.equal(g.priceOf("wind"), Math.round(GENERATORS.wind.price * 0.85));
  apply({ id: "solar_free" });
  assert.equal(g.freeBuilds.solar, 2);
  apply({ id: "free_depot" });
  assert.ok(c.unlocked.has("depot_l"));
  apply({ id: "calm_winds" });
  assert.equal(g.mods.calmWinds, true);
});

test("perks: bonus cut makes every 10th cut give an extra half, ledger stays exact", () => {
  const g = new GameRoot({ zone: { w: 12, h: 4 }, hoppers: [{ x: 0, y: 1, r: 0, item: "m1" }] });
  g.mods.bonusCutEvery = 10;
  g.mods.hopperMult.m1 = 4;
  g.placeMachine("belt", 1, 1, 0);
  g.placeMachine("cutter", 2, 1, 0);
  g.placeMachine("recycler", 3, 1, 0);
  for (let i = 0; i < 30 * 60; i++) g.tick();
  assert.ok(g.cutJobs >= 20);
  assert.equal(g.made, g.cutJobs + Math.floor(g.cutJobs / 10));
  assert.ok(g.ledgerOk());
});

test("perks: supply drop puts a full depot near the dock", () => {
  const c = factory();
  const before = c.game.machines.size;
  const card = { id: "supply_drop", item: "cut(m1)", amount: 50 };
  applyPerk(c, card);
  assert.equal(c.game.machines.size, before + 1);
  const d = c.game.machines.get(`${card.at.x},${card.at.y}`);
  assert.equal(d.buffer.length, 50);
  assert.ok(c.game.ledgerOk());
});

// ---- offers -----------------------------------------------------------------------

test("offers: 3 cards from different categories, the first from the weakest area", () => {
  const c = factory({ cityPower: 4 }); // 4 power used of 4: power is the weak spot
  assert.equal(weakestArea(c.game), "power");
  const offer = makeOffer(c, MACHINE_NAMES);
  assert.equal(offer.length, 3);
  assert.equal(offer[0].category, "power");
  assert.equal(new Set(offer.map((o) => o.category)).size, 3);
  for (const o of offer) assert.ok(!/\{|\}/.test(o.name + o.text), `filled in: ${o.name} ${o.text}`);
});

test("offers: no power perks before the city cap; fixed perks when a milestone lists them", () => {
  const c = factory();
  for (let k = 0; k < 6; k++) {
    c.index = 9 + k; // vary the seed
    for (const o of makeOffer(c, MACHINE_NAMES)) assert.notEqual(o.category, "power");
  }
  const fixed = makeOffer(c, MACHINE_NAMES, ["belt_speed", "credit_bonus", "bigger_depots"]);
  assert.deepEqual(fixed.map((o) => o.id), ["belt_speed", "credit_bonus", "bigger_depots"]);
});

test("offers: a milestone offers a choice; picking applies it; once-only perks do not return", () => {
  const ms = CONTRACTS.findIndex((x) => x.milestone);
  const c = new Campaign({ index: ms, stage: 0, unlocked: ["belt", "cutter", "press"] });
  let offered = null;
  c.game.signals.on("perkOffer", (e) => { offered = e.offers; });
  c.game.dock.main.accepted = CONTRACTS[ms].amount - 1;
  c.game._dockAccept(CONTRACTS[ms].item);
  assert.ok(offered && offered.length >= 1);
  const card = c.choosePerk(0);
  assert.equal(c.perks.length, 1);
  assert.equal(c.pendingOffer, null);
  assert.equal(card.id, offered[0].id);
  c.perks.push({ id: "bonus_cut" });
  for (let k = 0; k < 8; k++) {
    c.index = k;
    assert.ok(!makeOffer(c, MACHINE_NAMES).some((o) => o.id === "bonus_cut"));
  }
});

// ---- save -----------------------------------------------------------------------

test("save: city cap, perks, free builds, a pending offer and generator refunds survive", () => {
  const c = factory({ cityPower: 6 });
  const g = c.game;
  g.coins = 200;
  applyPerk(c, { id: "efficient_motors", type: "combiner" });
  c.perks.push({ id: "efficient_motors", type: "combiner", name: "x", text: "y", category: "power" });
  g.freeBuilds.solar = 1;
  g.placeMachine("wind", 12, 8, 0);
  c.pendingOffer = makeOffer(c, MACHINE_NAMES);
  const sys = new SaveSystem();
  const c2 = sys.restore(JSON.parse(JSON.stringify(sys.serialize(c))));
  const g2 = c2.game;
  assert.equal(g2.cityPower, 6);
  assert.equal(g2.powerOf("combiner"), 1, "lasting perks are re-applied");
  assert.equal(g2.freeBuilds.solar, 1);
  assert.equal(g2.powerSupply(), g.powerSupply());
  assert.equal(g2.coins, g.coins);
  assert.deepEqual(c2.pendingOffer, c.pendingOffer);
  g2.removeMachine(12, 8);
  assert.equal(g2.coins, g.coins + GENERATORS.wind.price, "refund kept through the save");
});
