// Campaign (Phase 2): one growing factory with contracts that arrive on
// their own (roadmap D1, D3, D4).
//
// - Contracts come from data/contracts.json, in order. The current one is
//   the dock's main order. Each delivered part pays creditEach right away.
// - When the main order is filled: unlocks are added, credits shown, and the
//   next contract is set on the dock. No menu in between.
// - Parts made for earlier contracts are still taken by the dock, for free
//   (no credits, no progress), so changing orders never blocks a line.
// - A contract marked `milestone` grows the plot to the next stage in
//   data/plot.json (new land and new hoppers). The UI eases the camera out.
//
// Events (on game.signals):
//   contractComplete { contract, next, unlocked: [ids] }
//   expanded         { stage, zone, hoppers }
//   allContractsDone {}
//   cityCapped       { cityPower }       the city stops covering all power
//   perkOffer        { offers }          a milestone: pick 1 of 3
//   perkChosen       { card }
//
// Phase 3: a contract may set `cityPower` (the city's power cap from then
// on), `gift` (free builds, for example { "solar": 2 }) and `perks` (fixed
// perk ids for its level-up card). Every milestone offers a perk choice.

import { GameRoot, GENERATORS } from "./root.js";
import { contracts as contractData, plot } from "../data/index.js";
import { makeOffer, applyPerk, applyLasting, ONE_TIME } from "./perks.js";
import { MACHINE_NAMES } from "./systems/process.js";

export const CONTRACTS = contractData.list;
export const STAGES = plot.stages;

/** Everything the toolbar can offer, in toolbar order. */
export const ALL_TOOLS = [
  "belt", "belt_high", "cutter", "press", "combiner", "encaser",
  "merger", "splitter", "depot_s", "depot_m", "depot_l", "recycler",
  ...Object.keys(GENERATORS),
];

export class Campaign {
  /**
   * @param {object} [state]  { index, stage, unlocked } from a save
   * @param {object} [profile] passed to GameRoot { coins, settings, stats }
   */
  constructor(state = {}, profile = {}) {
    this.index = state.index || 0;
    this.stage = Math.min(state.stage || 0, STAGES.length - 1);
    this.unlocked = new Set(state.unlocked || contractData.start.unlocked);
    this.game = new GameRoot(
      {
        zone: STAGES[this.stage].zone,
        dock: plot.dock,
        hoppers: STAGES.slice(0, this.stage + 1).flatMap((s) => s.hoppers),
      },
      profile
    );
    this.perks = state.perks || []; // chosen perk cards
    this.pendingOffer = state.pendingOffer || null;
    const g = this.game;
    g.cityPower = state.cityPower ?? null;
    g.freeBuilds = { ...(state.freeBuilds || {}) };
    for (const card of this.perks) if (!ONE_TIME.has(card.id)) applyLasting(g, card);
    // parts from earlier contracts are taken for free (no stuck changeovers)
    for (const c of CONTRACTS.slice(0, this.index)) this.game.dock.leftovers.add(c.item);
    this._setOrder(state.mainAccepted || 0);
    this.game.signals.on("orderFilled", ({ slot }) => {
      if (slot.kind === "main") this._complete();
    });
  }

  get current() {
    return CONTRACTS[this.index] || null;
  }

  get done() {
    return this.index >= CONTRACTS.length;
  }

  /** Tools the toolbar shows, in a stable order. */
  tools() {
    return ALL_TOOLS.filter((t) => this.unlocked.has(t));
  }

  _setOrder(accepted = 0) {
    const c = this.current;
    if (!c) {
      this.game.dock.setSlot(0, null);
      return;
    }
    this.game.dock.leftovers.delete(c.item); // the current order always counts
    this.game.dock.setSlot(0, { item: c.item, amount: c.amount, creditEach: c.creditEach || 0 });
    this.game.dock.main.accepted = Math.min(accepted, c.amount);
  }

  _complete() {
    const c = this.current;
    if (!c) return;
    const unlocked = [];
    for (const t of c.unlock || []) {
      if (!this.unlocked.has(t)) {
        this.unlocked.add(t);
        unlocked.push(t);
      }
    }
    this.index++;
    this.game.dock.leftovers.add(c.item);
    for (const [tool, n] of Object.entries(c.gift || {})) this.game.freeBuilds[tool] = (this.game.freeBuilds[tool] || 0) + n;
    if (c.milestone) this.expand();
    this._setOrder(0);
    this.game.signals.emit("contractComplete", { contract: c, next: this.current, unlocked });
    if (typeof c.cityPower === "number") {
      this.game.cityPower = c.cityPower;
      this.game.signals.emit("cityCapped", { cityPower: c.cityPower });
    }
    if (c.milestone) {
      this.pendingOffer = makeOffer(this, MACHINE_NAMES, c.perks);
      if (this.pendingOffer.length) this.game.signals.emit("perkOffer", { offers: this.pendingOffer });
      else this.pendingOffer = null;
    }
    if (this.done) this.game.signals.emit("allContractsDone", {});
  }

  /** The player picked card `i` of the pending offer. */
  choosePerk(i) {
    const card = this.pendingOffer?.[i];
    if (!card) return null;
    applyPerk(this, card);
    this.perks.push(card);
    this.pendingOffer = null;
    this.game.signals.emit("perkChosen", { card });
    return card;
  }

  /** Move to the next plot stage: bigger zone, new hoppers. */
  expand() {
    if (this.stage >= STAGES.length - 1) return false;
    this.stage++;
    const s = STAGES[this.stage];
    this.game.setZone(s.zone);
    const added = s.hoppers.map((h) => this.game.addHopper(h)).filter(Boolean);
    this.game.signals.emit("expanded", { stage: this.stage, zone: this.game.world.zone, hoppers: added });
    return true;
  }

  /** Plain data for the save file. */
  state() {
    return {
      index: this.index,
      stage: this.stage,
      unlocked: [...this.unlocked],
      mainAccepted: this.game.dock.main ? this.game.dock.main.accepted : 0,
      cityPower: this.game.cityPower,
      freeBuilds: { ...this.game.freeBuilds },
      perks: this.perks,
      pendingOffer: this.pendingOffer,
    };
  }
}

/** A sandbox factory: the largest plot, every hopper, every tool, no orders. */
export function sandboxGame(profile = {}) {
  const last = STAGES[STAGES.length - 1];
  return new GameRoot(
    { zone: last.zone, dock: plot.dock, hoppers: STAGES.flatMap((s) => s.hoppers) },
    profile
  );
}
