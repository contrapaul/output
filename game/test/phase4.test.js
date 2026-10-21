// Phase 4 tests: upgrades, boosts, standing orders and the rate meter, side
// orders, production rates, machine rates, economy pacing, and saves.

import test from "node:test";
import assert from "node:assert/strict";

import { GameRoot } from "../src/game/root.js";
import { Campaign, CONTRACTS } from "../src/game/campaign.js";
import { RateTracker } from "../src/game/systems/rates.js";
import { SaveSystem } from "../src/game/save.js";
import { upgrades as UP } from "../src/data/index.js";
import { CONFIG } from "../src/core/config.js";

const run = (g, seconds) => { for (let i = 0; i < seconds * CONFIG.SIM_HZ; i++) g.tick(); };

/** hopper -> belt -> cutter -> belt -> dock, standing order on halves */
function line(target) {
  const g = new GameRoot({ zone: { w: 14, h: 6 }, hoppers: [{ x: 0, y: 2, r: 0, item: "m1" }], dock: { x: 10, y: 2 }, target }, { coins: 1000 });
  g.placeMachine("belt", 1, 2, 0);
  g.placeMachine("cutter", 2, 2, 0);
  for (let x = 3; x <= 9; x++) g.placeMachine("belt", x, 2, 0);
  return g;
}

// ---- upgrades -------------------------------------------------------------------

test("upgrades: each track changes exactly what it says, level by level", () => {
  const g = line();
  const base = { belt: g.beltSpeedMult(), machine: g.machineSpeedMult("cutter"), hopper: g.hopperRate(g.hoppers[0]) };
  assert.equal(g.buyUpgrade("belts"), null);
  assert.equal(g.beltSpeedMult(), base.belt * UP.tracks.belts.levels[0].mult);
  assert.equal(g.buyUpgrade("machines"), null);
  assert.equal(g.machineSpeedMult("cutter"), base.machine * UP.tracks.machines.levels[0].mult);
  assert.equal(g.buyUpgrade("hoppers"), null);
  assert.equal(g.hopperRate(g.hoppers[0]), base.hopper * UP.tracks.hoppers.levels[0].mult);
  g.placeMachine("depot_s", 5, 4, 0);
  assert.equal(g.buyUpgrade("depots"), null);
  assert.equal(g.capacityOf(g.machines.get("5,4")), 50 * UP.tracks.depots.levels[0].mult);
  // level 2 replaces level 1 (the mult is the total, not added again)
  g.buyUpgrade("belts");
  assert.equal(g.beltSpeedMult(), base.belt * UP.tracks.belts.levels[1].mult);
});

test("upgrades: cost credits, refuse when short, stop at the top level", () => {
  const g = line();
  g.coins = 10;
  assert.match(g.buyUpgrade("belts"), /needs 30 credits/);
  g.coins = 10000;
  for (const _ of UP.tracks.depots.levels) assert.equal(g.buyUpgrade("depots"), null);
  assert.match(g.buyUpgrade("depots"), /top level/);
  assert.equal(g.coins, 10000 - UP.tracks.depots.levels.reduce((n, l) => n + l.price, 0));
});

test("upgrades: faster belts really deliver faster", () => {
  const slow = line({ item: "cut(m1)", amount: 1000 });
  const fast = line({ item: "cut(m1)", amount: 1000 });
  fast.buyUpgrade("hoppers");
  fast.buyUpgrade("belts");
  run(slow, 60);
  run(fast, 60);
  assert.ok(fast.delivered > slow.delivered * 1.3, `faster line delivered ${fast.delivered} vs ${slow.delivered}`);
  assert.ok(fast.ledgerOk());
});

// ---- boosts ----------------------------------------------------------------------

test("boosts: overdrive doubles machine speed for 60 s, then stops; time can be added", () => {
  const g = line();
  const before = g.machineSpeedMult("cutter");
  assert.equal(g.buyBoost("overdrive"), null);
  assert.equal(g.machineSpeedMult("cutter"), before * 2);
  run(g, 30);
  assert.equal(g.buyBoost("overdrive"), null);
  assert.ok(Math.abs(g.boostLeft("overdrive") - 90) < 0.1, "adds 60 s to the 30 s left");
  run(g, 91);
  assert.equal(g.machineSpeedMult("cutter"), before);
  assert.equal(g.coins, 1000 - 2 * UP.boosts.overdrive.price);
});

test("boosts: rush doubles hopper rate", () => {
  const g = line();
  const before = g.hopperRate(g.hoppers[0]);
  g.buyBoost("rush");
  assert.equal(g.hopperRate(g.hoppers[0]), before * 2);
  g.coins = 0;
  assert.match(g.buyBoost("rush"), /needs/);
});

// ---- standing orders and the rate meter ---------------------------------------------

test("rate tracker: per-minute numbers match a known steady flow", () => {
  const r = new RateTracker();
  for (let t = 0; t < 300; t += 2) r.add("x", t); // 30 a minute
  assert.ok(Math.abs(r.perMinute("x", 300, 60) - 30) <= 1.5);
  assert.ok(Math.abs(r.perMinute("x", 300, 300) - 30) <= 1.5);
  assert.equal(r.perMinute("nothing", 300), 0);
});

test("standing order: the meter matches the line's real rate, and holding it fills the order", () => {
  // hopper 30 m1 a minute -> cutter makes 60 halves a minute
  const g = line({ item: "cut(m1)", rate: { perMinute: 40, seconds: 60 } });
  g.dock.setSlot(0, { item: "cut(m1)", rate: { perMinute: 40, seconds: 60 }, creditEach: 1 });
  let filled = null;
  g.signals.on("orderFilled", (e) => { filled = e.slot; });
  run(g, 70); // the meter counts the last full minute
  const meter = g.dock.ratePerMinute(g.dock.main);
  assert.ok(Math.abs(meter - 60) <= 3, `meter ${meter} vs 60 a minute`);
  assert.ok(Math.abs(g.rates.perMinute("delivered:cut(m1)", g.time) - 60) <= 4);
  run(g, 60);
  assert.ok(filled && filled.kind === "main");
  assert.equal(g.dock.complete, true);
});

test("standing order: below the rate, time held pauses and does not go back", () => {
  const g = line();
  g.dock.setSlot(0, { item: "cut(m1)", rate: { perMinute: 100, seconds: 30 }, creditEach: 1 });
  run(g, 90);
  assert.equal(g.dock.main.held, 0, "60 a minute never reaches 100");
  g.dock.main.held = 10;
  run(g, 10);
  assert.equal(g.dock.main.held, 10);
  assert.ok(g.coins > 1000, "deliveries still pay");
});

test("standing order contracts are in the campaign and advance it", () => {
  const idx = CONTRACTS.findIndex((c) => c.rate);
  assert.ok(idx > 0);
  const c = new Campaign({ index: idx, stage: 1 });
  const s = c.game.dock.main;
  assert.ok(s.rate && s.rate.seconds === CONTRACTS[idx].rate.minutes * 60);
  s.held = s.rate.seconds - 0.01;
  for (let i = 0; i < s.rate.perMinute; i++) c.game._dockAccept(s.item);
  c.game.tick();
  assert.equal(c.index, idx + 1);
});

// ---- side orders ------------------------------------------------------------------------

test("side orders: appear on a timer, ask for an earlier contract's part, pay extra, expire gently", () => {
  const c = new Campaign({ index: 4, stage: 0, unlocked: ["belt", "cutter", "press"] });
  const g = c.game;
  const seen = [];
  g.signals.on("sideOrder", ({ slot }) => seen.push(slot));
  let expired = 0;
  g.signals.on("sideOrderExpired", () => expired++);
  run(g, UP.sideOrders.everySeconds + 1);
  assert.equal(seen.length, 1);
  const s = seen[0];
  const earlier = CONTRACTS.slice(0, 4).map((k) => k.item);
  assert.ok(earlier.includes(s.item), "only parts the player has made before");
  assert.ok(s.amount >= UP.sideOrders.minAmount && s.amount <= UP.sideOrders.maxAmount);
  const base = CONTRACTS.find((k) => k.item === s.item).creditEach;
  assert.equal(s.creditEach, Math.max(1, Math.round(base * UP.sideOrders.creditBonus)));
  run(g, UP.sideOrders.expireSeconds);
  assert.ok(expired >= 1);
  assert.equal(c.index, 4, "side orders never move the contracts on");
});

test("side orders: filling one pays and clears the slot, with no contract progress", () => {
  const c = new Campaign({ index: 4, stage: 0 });
  const g = c.game;
  run(g, UP.sideOrders.everySeconds + 1);
  const s = g.dock.slots.find((x, i) => i > 0 && x);
  const before = { coins: g.coins, main: g.dock.main.accepted };
  let done = null;
  g.signals.on("sideOrderDone", (e) => { done = e; });
  for (let i = 0; i < s.amount; i++) g._dockAccept(s.item);
  assert.ok(done);
  assert.equal(g.coins - before.coins, s.amount * s.creditEach);
  assert.equal(g.dock.main.accepted, before.main);
  assert.ok(!g.dock.slots.includes(s), "slot cleared");
});

test("side orders: none before the first contract is done", () => {
  const c = new Campaign();
  let n = 0;
  c.game.signals.on("sideOrder", () => n++);
  run(c.game, UP.sideOrders.everySeconds * 2);
  assert.equal(n, 0);
});

// ---- machine rates and economy -----------------------------------------------------------

test("machine rates: jobs per minute on the hover card match the line", () => {
  const g = line({ item: "cut(m1)", amount: 1000 });
  run(g, 70);
  const cutter = g.machines.get("2,2");
  const jobs = g.jobsPerMinute(cutter);
  assert.ok(Math.abs(jobs - 30) <= 2, `cutter ran ${jobs} jobs a minute (hopper gives 30)`);
  assert.ok(Math.abs(g.rates.perMinute("made:cut(m1)", g.time) - 60) <= 4);
});

test("economy: the first upgrade is affordable within 2 contracts", () => {
  const parts = (c) => c.amount ?? c.rate.perMinute * c.rate.minutes;
  const after2 = CONTRACTS.slice(0, 2).reduce((n, c) => n + parts(c) * c.creditEach, 0);
  const cheapest = Math.min(...Object.values(UP.tracks).map((t) => t.levels[0].price));
  assert.ok(after2 >= cheapest, `${after2} credits after 2 contracts, cheapest upgrade ${cheapest}`);
});

// ---- save ---------------------------------------------------------------------------------

test("save: upgrades, boosts, game time, standing progress and side orders survive", () => {
  const idx = CONTRACTS.findIndex((c) => c.rate);
  const c = new Campaign({ index: idx, stage: 1 }, { coins: 500 });
  const g = c.game;
  g.buyUpgrade("belts");
  g.buyBoost("overdrive");
  run(g, UP.sideOrders.everySeconds + 2);
  g.dock.main.held = 33;
  const side = g.dock.slots.find((x, i) => i > 0 && x);
  assert.ok(side, "a side order is open");
  const sys = new SaveSystem();
  const c2 = sys.restore(JSON.parse(JSON.stringify(sys.serialize(c))));
  const g2 = c2.game;
  assert.equal(g2.upgradeLevels.belts, 1);
  assert.equal(g2.beltSpeedMult(), g.beltSpeedMult());
  assert.ok(Math.abs(g2.boostLeft("overdrive") - g.boostLeft("overdrive")) < 1e-6);
  assert.equal(g2.time, g.time);
  assert.equal(g2.dock.main.held, 33);
  const side2 = g2.dock.slots.find((x, i) => i > 0 && x);
  assert.equal(side2.item, side.item);
  assert.equal(side2.expiresAt, side.expiresAt);
  assert.equal(c2.nextSideAt, c.nextSideAt);
});
