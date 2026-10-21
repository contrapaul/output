// Save system (Phase 2): one factory, versioned JSON, localStorage,
// export/import.
//
// Save format v3:
// {
//   "format": "output.save",
//   "version": 3,
//   "campaign": { "index": 4, "stage": 1, "unlocked": ["belt", ...], "mainAccepted": 7 },
//   "coins": 120,
//   "pieces": [{ "t": "cutter", "x": 2, "y": 3, "r": 0, "z": 0,
//                "in": [], "out": [], "buf": [], "c": 0.2, "oc": 0 }],
//   "items": [{ "k": "4,3", "f": 0.37, "i": "cut(m1)" }],   parts on belts
//   "ledger": { "emitted": 40, ... },
//   "placedCount": 31,
//   "settings": { "sound": false, "theme": "light", "motion": true, "colorblind": false },
//   "stats": { "timePlayedSec": 300, "machinesBuilt": 40 }
// }
//
// Unlike v2, parts in transit ARE saved (the engine keeps them through
// edits now, so a reload should too). Fixed pieces (dock, hoppers) come
// from data/plot.json and are not saved.
//
// Migrations: v1 -> v2 -> v3. v2 saves were per level; v3 starts a new
// factory and keeps the credits.

import { Campaign } from "./campaign.js";
import { tileKey } from "../core/grid.js";

const STORAGE_KEY = "output.save";
const CURRENT_VERSION = 3;
const LEDGER = ["emitted", "injected", "made", "merged", "delivered", "recycled", "partsRemoved"];

export class SaveSystem {
  constructor() {
    this.version = CURRENT_VERSION;
  }

  /** Build a save object from a campaign. */
  serialize(campaign) {
    const game = campaign.game;
    const pieces = [];
    for (const m of game.world.machinesList()) {
      if (m.fixed) continue;
      const p = { t: m.t, x: m.x, y: m.y, r: m.r, z: m.z || 0 };
      if (m.paid) p.paid = m.paid;
      const inst = game.machines.get(tileKey(m.x, m.y, 0));
      if (inst && (m.z || 0) === 0) {
        if (inst.inputs.length) { p.in = [...inst.inputs]; p.is = [...inst.inputSides]; }
        if (inst.outputs.length) p.out = [...inst.outputs];
        if (inst.buffer.length) p.buf = [...inst.buffer];
        if (inst.charge) p.c = inst.charge;
        if (inst.outCursor) p.oc = inst.outCursor;
      }
      pieces.push(p);
    }
    const items = [];
    for (const fl of game.flowLines.values()) {
      const tiles = fl.line.tiles;
      for (const it of fl.items) {
        const i = Math.min(Math.floor(it.d), tiles.length - 1);
        items.push({ k: tiles[i].key, f: it.d - i, i: it.item });
      }
    }
    const ledger = {};
    for (const k of LEDGER) ledger[k] = game[k];
    return {
      format: "output.save",
      version: this.version,
      campaign: campaign.state(),
      coins: game.coins,
      pieces,
      items,
      ledger,
      placedCount: game.placedCount,
      time: game.time,
      hoppers: game.hoppers.map((h) => h.cooldown),
      upgrades: game.upgradeLevels,
      boosts: game.boostUntil,
      settings: game.settings,
      stats: game.stats,
    };
  }

  /** Rebuild a campaign (and its game) from a v3 save object. */
  restore(data) {
    const campaign = new Campaign(data.campaign || {}, {
      coins: data.coins,
      settings: data.settings,
      stats: data.stats,
    });
    const game = campaign.game;
    for (const p of data.pieces || []) {
      // force: a saved factory may already be over the power cap
      if (!game.placeMachine(p.t, p.x, p.y, p.r, p.z || 0, { force: true, paid: p.paid || 0 })) continue;
      const inst = game.machines.get(tileKey(p.x, p.y, 0));
      if (inst && (p.z || 0) === 0) {
        inst.inputs = p.in || [];
        inst.inputSides = p.is || inst.inputs.map(() => 2);
        inst.outputs = p.out || [];
        inst.buffer = p.buf || [];
        inst.charge = p.c || 0;
        inst.outCursor = p.oc || 0;
      }
    }
    for (const it of data.items || []) {
      const line = game.world.lines.tileToLine.get(it.k);
      const fl = line && game.flowLines.get(line.id);
      const idx = line ? line.index(it.k) : null;
      if (!fl || idx === null) continue;
      const d = Math.min(idx + it.f, line.length - 1);
      fl.items.push({ d, pd: d, item: it.i });
    }
    for (const fl of game.flowLines.values()) fl.items.sort((a, b) => a.d - b.d);
    for (const k of LEDGER) if (data.ledger && typeof data.ledger[k] === "number") game[k] = data.ledger[k];
    game.placedCount = data.placedCount || 0;
    game.time = data.time || 0;
    (data.hoppers || []).forEach((cd, i) => { if (game.hoppers[i]) game.hoppers[i].cooldown = cd; });
    Object.assign(game.upgradeLevels, data.upgrades || {});
    game.boostUntil = { ...(data.boosts || {}) };
    game.stats = Object.assign({ timePlayedSec: 0, machinesBuilt: 0 }, data.stats || {});
    return campaign;
  }

  save(campaign) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize(campaign)));
      return true;
    } catch (err) {
      console.error("save failed:", err);
      return false;
    }
  }

  /** Load from localStorage. Returns the (migrated) save object or null. */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.format !== "output.save") return null;
      return this.migrate(data);
    } catch (err) {
      console.error("load failed:", err);
      return null;
    }
  }

  /** Apply migrations from older versions to current. */
  migrate(data) {
    let v = data.version || 0;
    while (v < CURRENT_VERSION) {
      const fn = this[`_migrate_${v}_to_${v + 1}`];
      if (fn) data = fn.call(this, data);
      v++;
    }
    data.version = CURRENT_VERSION;
    return data;
  }

  // ---- migrations -------------------------------------------------------

  /** v1 -> v2: add upgrades, settings.motion/colorblind, machine z. */
  _migrate_1_to_2(data) {
    data.profile = data.profile || { coins: 0 };
    data.settings = data.settings || {};
    if (typeof data.settings.motion !== "boolean") data.settings.motion = true;
    if (typeof data.settings.colorblind !== "boolean") data.settings.colorblind = false;
    data.stats = data.stats || { timePlayedSec: 0, machinesBuilt: 0 };
    return data;
  }

  /** v2 -> v3: per-level saves become one new factory; credits are kept. */
  _migrate_2_to_3(data) {
    return {
      format: "output.save",
      version: 3,
      campaign: null,
      coins: data.profile?.coins || 0,
      pieces: [],
      items: [],
      ledger: {},
      placedCount: 0,
      settings: data.settings,
      stats: data.stats,
    };
  }

  exportString(campaign) {
    return JSON.stringify(this.serialize(campaign), null, 2);
  }

  /** Import a save from a JSON string. Returns the save object or null. */
  import(json) {
    try {
      const data = JSON.parse(json);
      if (data.format !== "output.save") return null;
      const migrated = this.migrate(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (err) {
      console.error("import failed:", err);
      return null;
    }
  }

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* headless */
    }
  }
}
