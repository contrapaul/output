// Game root (Phase 2): owns the world, belt flow, machines, hoppers and the
// order dock. One factory that keeps running; the campaign (campaign.js)
// sets the dock's orders and grows the plot.
//
// tick() order:
//   1. Hoppers emit (onto the belt or into the machine in front)
//   2. Lines advance items (tail-first)
//   3. Machines process (depots feed one stored part to their exit)
//   4. Dock bookkeeping
//
// Rules kept from earlier phases:
//   - a part only leaves a line or machine when the next thing can take
//     THAT part (ports, machine rules, depot room and type, dock orders)
//   - nothing is silently dropped; the ledger stays exact (ledgerOk):
//       itemCount() = emitted + injected + made - merged - delivered
//                     - recycled - partsRemoved
//     made: extra parts from cutters (1 in, 2 out); merged: parts used up
//     when combiners and encasers turn 2 into 1; injected: parts placed
//     straight into depots (supply drops)
//   - belt edits keep parts on surviving tiles (_snapshotItemTiles)
//
// Layout (constructor):
//   { zone: {x, y, w, h},
//     hoppers: [{ x, y, r, item, rate? }],
//     dock: { x, y } | null,                 2x2, top-left tile
//     target: { item, amount } | null,       main order (tests, sandbox)
//     fixed: [{ t, x, y, r, item? }] }       other fixed pieces (tests)

import { CONFIG } from "../core/config.js";
import { World } from "./world.js";
import { FlowLine } from "./systems/flow.js";
import { MachineInstance, HANDLERS, MACHINE_NAMES, acceptsFrom, localSide } from "./systems/process.js";
import { OrderDock } from "./systems/dock.js";
import { Signals } from "../core/signals.js";
import { DIRS, tileKey } from "../core/grid.js";
import { itemName, material } from "./items.js";
import { power as powerData } from "../data/index.js";

const HOPPER_RATE = 0.5; // parts per second
export const GENERATORS = powerData.generators;
const BELTS = new Set(["belt", "belt_high"]);

export class GameRoot {
  /**
   * @param {object} layout   see header
   * @param {object} [profile] { coins, settings, stats }
   */
  constructor(layout = {}, profile = {}) {
    this.signals = new Signals();
    this.world = new World({ x: 0, y: 0, ...(layout.zone || { w: 16, h: 12 }) });
    this.machines = new Map(); // tileKey -> MachineInstance
    this.flowLines = new Map(); // line id -> FlowLine
    this.hoppers = []; // { x, y, dir, item, rate, cooldown }
    this.tickCount = 0;
    this.time = 0;
    this.paused = false;

    this.coins = profile.coins || 0;
    this.settings = Object.assign(
      { sound: false, theme: "light", motion: true, colorblind: false },
      profile.settings || {}
    );
    this.stats = Object.assign({ timePlayedSec: 0, machinesBuilt: 0 }, profile.stats || {});
    this.speedMult = 1; // machine speed (upgrades, Phase 4)
    this.cityPower = null; // null: the city covers all demand
    this.freeBuilds = {}; // tool id -> free placements left (perks)
    this.mods = {
      powerDelta: {}, // type -> change in power use
      freePower: new Set(), // types that use no power
      typeSpeed: {}, // type -> speed multiplier
      beltMult: 1,
      hopperMult: {}, // material -> rate multiplier
      depotMult: 1,
      bonusCutEvery: 0, // every Nth cut makes one extra half (0 = off)
      creditMult: 1,
      priceMult: 1,
      calmWinds: false,
    };
    this.cutJobs = 0;

    // ledger
    this.emitted = 0;
    this.injected = 0;
    this.made = 0;
    this.merged = 0;
    this.delivered = 0;
    this.recycled = 0;
    this.partsRemoved = 0;
    this.placedCount = 0;
    this.jam = null;

    this.dock = null;
    if (layout.dock) this.addDock(layout.dock.x, layout.dock.y);
    for (const h of layout.hoppers || []) this.addHopper(h);
    for (const f of layout.fixed || []) {
      if (f.t === "hopper") this.addHopper(f);
      else if (f.t === "dock") this.addDock(f.x, f.y);
      else {
        this.world.place(f.t, f.x, f.y, f.r || 0, 0, true);
        if (f.t in HANDLERS) this.machines.set(tileKey(f.x, f.y, 0), new MachineInstance(f.t, f.x, f.y, f.r || 0));
      }
    }
    if (layout.target && this.dock) {
      this.dock.setSlot(0, { item: layout.target.item, amount: layout.target.amount, creditEach: layout.target.creditEach || 0 });
    }
    this._initFlowLines();
  }

  // ---- fixed pieces and the plot ----------------------------------------

  addDock(x, y) {
    this.dock = new OrderDock(x, y);
    for (const t of this.dock.tiles()) {
      const m = this.world.place("dock", t.x, t.y, 0, 0, true);
      if (m) m.anchor = { x, y };
    }
  }

  addHopper({ x, y, r = 0, item, rate = HOPPER_RATE }) {
    if (!this.world.place("hopper", x, y, r, 0, true)) return null;
    const h = { x, y, dir: r, item, rate, cooldown: 0 };
    this.hoppers.push(h);
    return h;
  }

  /** Grow the build area (plot expansion). */
  setZone(zone) {
    this.world.zone = { x: 0, y: 0, ...zone };
    this.signals.emit("zoneChanged", this.world.zone);
  }

  _initFlowLines() {
    this.flowLines.clear();
    for (const line of this.world.lines.allLines()) {
      this.flowLines.set(line.id, new FlowLine(line, this.world));
    }
  }

  /**
   * Snapshot each item's tile BEFORE a world mutation, so the edit can be
   * applied without dropping in-transit parts.
   */
  _snapshotItemTiles() {
    const snap = new Map();
    for (const [id, fl] of this.flowLines) {
      const tiles = fl.line.tiles;
      const entries = [];
      for (const it of fl.items) {
        const i = Math.min(Math.floor(it.d), tiles.length - 1);
        const t = tiles[i];
        if (t) entries.push({ tileKey: t.key, x: t.x, y: t.y, frac: it.d - i, item: it.item });
      }
      snap.set(id, entries);
    }
    return snap;
  }

  /**
   * Re-home every item after a belt edit. An item keeps the tile it sat on.
   * Items whose tile was deleted leave the world (partsRemoved, signal).
   */
  _resyncFlowLines(snapshot) {
    const next = new Map();
    for (const line of this.world.lines.allLines()) {
      next.set(line.id, new FlowLine(line, this.world));
    }
    const removed = [];
    for (const entries of snapshot.values()) {
      for (const e of entries) {
        const cur = this.world.lines.tileToLine.get(e.tileKey);
        const idx = cur ? cur.index(e.tileKey) : null;
        const target = cur && next.get(cur.id);
        if (idx !== null && target) {
          const d = Math.min(idx + e.frac, cur.length - 1);
          target.items.push({ d, pd: d, item: e.item });
        } else {
          removed.push({ item: e.item, x: e.x, y: e.y });
        }
      }
    }
    for (const fl of next.values()) fl.items.sort((a, b) => a.d - b.d);
    this.flowLines = next;
    if (removed.length) {
      this.partsRemoved += removed.length;
      for (const r of removed) this.signals.emit("partRemoved", r);
    }
  }

  // ---- placement ----------------------------------------------------------

  /**
   * Place a piece. Returns the world entry or null. Machines and generators
   * also need power and credits (budgetError). `opts.force` skips the budget
   * (restoring a save, where the factory may already be over the cap).
   */
  placeMachine(type, x, y, r, z, opts = {}) {
    if (z === undefined) z = type === "belt_high" ? 1 : 0;
    if (BELTS.has(type)) {
      const snapshot = this._snapshotItemTiles();
      const ok = this.world.place(type, x, y, r, z);
      if (ok) {
        this._resyncFlowLines(snapshot);
        this.placedCount++;
        this.stats.machinesBuilt++;
      }
      return ok;
    }
    if (!(type in HANDLERS) && !GENERATORS[type]) return null;
    if (!opts.force && this.budgetError(type, x, y) !== null) return null;
    const ok = this.world.place(type, x, y, r, 0);
    if (!ok) return null;
    if (type in HANDLERS) this.machines.set(tileKey(x, y, 0), new MachineInstance(type, x, y, r));
    if (opts.paid !== undefined) ok.paid = opts.paid;
    else if (!opts.force) this._pay(ok);
    this.placedCount++;
    this.stats.machinesBuilt++;
    return ok;
  }

  _pay(entry) {
    const price = this.priceOf(entry.t);
    if (!price) return;
    if ((this.freeBuilds[entry.t] || 0) > 0) {
      this.freeBuilds[entry.t]--;
      entry.paid = 0;
      return;
    }
    this.coins -= price;
    entry.paid = price;
  }

  // ---- power and prices ----------------------------------------------------

  /** Power one piece of `type` uses. */
  powerOf(type) {
    if (GENERATORS[type] || BELTS.has(type)) return 0;
    if (this.mods.freePower.has(type)) return 0;
    const base = HANDLERS[type]?.power ?? powerData.use[type] ?? 0;
    return Math.max(0, base + (this.mods.powerDelta[type] || 0));
  }

  powerUsed() {
    let n = 0;
    for (const m of this.world.machines.values()) if (!m.fixed) n += this.powerOf(m.t);
    return n;
  }

  generatorOutput() {
    let n = 0;
    for (const m of this.world.machines.values()) if (GENERATORS[m.t]) n += GENERATORS[m.t].output;
    return n;
  }

  /** Total supply: Infinity while the city still covers everything. */
  powerSupply() {
    return this.cityPower === null ? Infinity : this.cityPower + this.generatorOutput();
  }

  priceOf(type) {
    const g = GENERATORS[type];
    return g ? Math.round(g.price * this.mods.priceMult) : 0;
  }

  /**
   * Why the budget blocks placing `type` at (x, y), or null. `view` answers
   * machineAt (the planning overlay for a drag); `extra` is what earlier
   * tiles of the same drag already use { power, credits, free }.
   */
  budgetError(type, x, y, view = this.world, extra = { power: 0, credits: 0, free: 0 }) {
    const cost = this.powerOf(type);
    if (cost > 0 && this.powerUsed() + extra.power + cost > this.powerSupply()) {
      return `needs ${cost} power. Build solar panels or wind turbines`;
    }
    const price = this.priceOf(type);
    const freeLeft = (this.freeBuilds[type] || 0) - extra.free;
    if (price > 0 && freeLeft <= 0 && this.coins - extra.credits < price) {
      return `needs ${price} credits`;
    }
    return this.windError(type, x, y, view);
  }

  /** Wind turbines need clear space around them (both ways). */
  windError(type, x, y, view = this.world) {
    if (this.mods.calmWinds || BELTS.has(type)) return null;
    const spacing = GENERATORS.wind?.spacing || 1;
    for (let dy = -spacing; dy <= spacing; dy++) {
      for (let dx = -spacing; dx <= spacing; dx++) {
        if (!dx && !dy) continue;
        const n = view.machineAt(x + dx, y + dy, 0);
        if (!n || BELTS.has(n.t)) continue;
        if (type === "wind") return "a wind turbine needs empty space around it (belts are fine)";
        if (n.t === "wind") return "too close to a wind turbine";
      }
    }
    return null;
  }

  /** Effective storage of a depot (perks can raise it). */
  capacityOf(m) {
    return Math.floor(m.handler.capacity * this.mods.depotMult);
  }

  /**
   * Place a depot that already holds parts (a supply drop). The parts count
   * as `injected` in the ledger.
   */
  placeFilledDepot(type, x, y, r, item, amount) {
    const ok = this.placeMachine(type, x, y, r, 0, { force: true });
    if (!ok) return null;
    const m = this.machines.get(tileKey(x, y, 0));
    const n = Math.min(amount, this.capacityOf(m));
    for (let i = 0; i < n; i++) m.buffer.push(item);
    this.injected += n;
    return ok;
  }

  /**
   * Remove whatever is at (x, y, z). Fixed pieces (dock, hoppers) cannot be
   * removed. Parts held inside a removed machine leave the world and are
   * counted in partsRemoved, like parts on a removed belt.
   */
  removeMachine(x, y, z = 0) {
    const key = tileKey(x, y, z);
    const m = this.world.machineAt(x, y, z);
    if (!m || m.fixed) return null;
    const isBelt = m.t === "belt" || m.t === "belt_high";
    const snapshot = isBelt ? this._snapshotItemTiles() : null;
    const inst = this.machines.get(key);
    this.world.remove(x, y, z);
    this.machines.delete(key);
    if (m.paid) this.coins += m.paid; // generators give their credits back
    if (isBelt) this._resyncFlowLines(snapshot);
    if (inst) {
      const held = [...inst.inputs, ...inst.outputs, ...inst.buffer];
      this.partsRemoved += held.length;
      if (held.length) this.signals.emit("partRemoved", { item: held[0], x, y, count: held.length });
    }
    this.jam = null;
    return m;
  }

  /**
   * Turn the piece at (x, y, z) to face r, keeping its parts. A belt is
   * re-laid (lines re-resolve, items keep their tiles); if the new direction
   * is not allowed the old belt is put back. Returns true on success.
   */
  rotateAt(x, y, z, r) {
    const m = this.world.machineAt(x, y, z);
    if (!m || m.fixed) return false;
    if (m.r === r) return true;
    if (m.t === "belt" || m.t === "belt_high") {
      const snapshot = this._snapshotItemTiles();
      const from = m.r;
      this.world.remove(x, y, z);
      const ok = !!this.world.place(m.t, x, y, r, z);
      if (!ok) this.world.place(m.t, x, y, from, z);
      this._resyncFlowLines(snapshot);
      return ok;
    }
    const inst = this.machines.get(tileKey(x, y, 0));
    m.r = r;
    if (inst) inst.r = r;
    return true;
  }

  // ---- tick -----------------------------------------------------------------

  tick() {
    if (this.paused) return;
    const dt = 1 / CONFIG.SIM_HZ;
    this.tickCount++;
    this.time += dt;
    this.stats.timePlayedSec += dt;

    this._tickHoppers(dt);
    this._tickLines(dt);
    this._tickMachines(dt);
    if (this.dock) this.dock.tick();
  }

  _tickHoppers(dt) {
    for (const h of this.hoppers) {
      if (h.cooldown > 0) h.cooldown -= dt;
      if (h.cooldown > 0) continue;
      if (this._ejectToDir({ x: h.x, y: h.y, r: h.dir }, 0, h.item)) {
        this.emitted++;
        h.cooldown = 1 / this.hopperRate(h);
      }
    }
  }

  hopperRate(h) {
    return h.rate * (this.mods.hopperMult[material(h.item)] || 1);
  }

  /**
   * What sits past the tail of a flow line? Returns { kind, m } or null.
   * kind is "machine", "dock", "belt", "wrongSide" (a machine whose ports do
   * not face this belt), "blocked" (a hopper) or "empty".
   */
  _acceptorPast(flowLine) {
    const tailTile = flowLine.line.tile(flowLine.tail);
    if (!tailTile) return null;
    const d = DIRS[tailTile.dir];
    const nx = tailTile.x + d.dx;
    const ny = tailTile.y + d.dy;
    const target = this.world.machineAt(nx, ny, 0) || this.world.machineAt(nx, ny, 1);
    if (!target) return { kind: "empty" };
    if (target.t === "belt" || target.t === "belt_high") return { kind: "belt", m: target };
    if (target.t === "hopper") return { kind: "blocked", m: target };
    const fromDir = (tailTile.dir + 2) % 4;
    if (!acceptsFrom(target.t, target.r, fromDir)) return { kind: "wrongSide", m: target };
    if (target.t === "dock") return { kind: "dock" };
    if (target.t in HANDLERS) {
      const m = this.machines.get(tileKey(nx, ny, 0));
      return m ? { kind: "machine", m, fromDir } : null;
    }
    return null;
  }

  /**
   * Can machine instance `m` take this item right now, arriving from the
   * absolute direction `fromDir` (machine to source)?
   */
  _machineCanTake(m, item, fromDir) {
    const h = m.handler;
    if (!h) return false;
    if (h.buffer) {
      const stored = m.stored;
      if (stored && stored !== item) return false; // one kind of part per depot
      return m.buffer.length < this.capacityOf(m);
    }
    if (m.outputs.length > 0) return false;
    if (h.oneEachSide && m.inputSides.includes(localSide(m.r, fromDir))) return false;
    return h.canTake(item, m.inputs);
  }

  _putInto(m, item, fromDir) {
    if (m.handler.buffer) {
      m.buffer.push(item);
    } else {
      m.inputs.push(item);
      m.inputSides.push(localSide(m.r, fromDir));
    }
  }

  /** Can the acceptor past `flowLine` take this specific item? */
  _canTake(flowLine, item) {
    const a = this._acceptorPast(flowLine);
    if (!a) return false;
    if (a.kind === "dock") return !!this.dock && this.dock.wants(item);
    if (a.kind === "machine") return this._machineCanTake(a.m, item, a.fromDir);
    return false;
  }

  /** Deliver one ejected item. Returns true if the acceptor took it. */
  _deliverItem(flowLine, item) {
    const a = this._acceptorPast(flowLine);
    if (!a) return false;
    if (a.kind === "machine" && this._machineCanTake(a.m, item, a.fromDir)) {
      this._putInto(a.m, item, a.fromDir);
      return true;
    }
    if (a.kind === "dock") return this._dockAccept(item);
    return false;
  }

  /** The dock took an item: credits + ledger + signals. */
  _dockAccept(item) {
    if (!this.dock) return false;
    const slot = this.dock.tryAccept(item);
    if (!slot) return false;
    this.delivered++;
    if (slot.kind === "leftover") return true; // free: no credits, no progress
    const gain = (slot.creditEach || 0) * this.mods.creditMult;
    this.coins += gain;
    this.signals.emit("itemAccepted", { item, slot, gain });
    if (slot.accepted >= slot.amount) this.signals.emit("orderFilled", { slot });
    return true;
  }

  _tickLines(dt) {
    const velocity = CONFIG.BELT_RATE * this.mods.beltMult * dt;
    for (const flowLine of this.flowLines.values()) {
      const canEject = (item) => this._canTake(flowLine, item);
      const ejected = flowLine.step(velocity, canEject);
      for (const itemId of ejected) {
        if (!this._deliverItem(flowLine, itemId)) flowLine.requeueAtTail(itemId);
      }
    }
  }

  _tickMachines(dt) {
    const machines = [...this.machines.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const m of machines) {
      const h = m.handler;
      if (!h) continue;

      if (h.buffer) {
        // depot: free one stored part into the exit slot, then eject
        if (m.outputs.length === 0 && m.buffer.length > 0) m.outputs.push(m.buffer.shift());
        if (m.outputs.length > 0) this._ejectMachineOutput(m);
        continue;
      }

      if (m.outputs.length > 0) this._ejectMachineOutput(m);

      const needed = h.needs || 1;
      if (m.outputs.length === 0 && m.inputs.length >= needed) {
        m.charge += dt * this.speedMult * (this.mods.typeSpeed[m.type] || 1);
        if (m.charge >= h.chargeTime) {
          const res = h.process(m.inputs);
          if (res && m.type === "cutter") {
            this.cutJobs++;
            const every = this.mods.bonusCutEvery;
            if (every && this.cutJobs % every === 0) res.outputs = [...res.outputs, res.outputs[0]];
          }
          if (res) {
            const used = m.inputs.length - res.left.length;
            if (h.sink) this.recycled += used;
            else if (res.outputs.length > used) this.made += res.outputs.length - used;
            else if (res.outputs.length < used) this.merged += used - res.outputs.length;
            m.outputs = res.outputs;
            m.inputs = res.left;
            m.inputSides = m.inputSides.slice(m.inputSides.length - res.left.length);
            m.charge = 0;
          }
        }
      }
    }
  }

  /**
   * Eject machine outputs one by one. Machines with handler.outDirs
   * (splitter) try their exits starting at m.outCursor and alternate.
   */
  _ejectMachineOutput(m) {
    const h = m.handler;
    const outDirs = h && h.outDirs ? h.outDirs : [0];
    while (m.outputs.length > 0) {
      const item = m.outputs[0];
      let used = -1;
      for (let k = 0; k < outDirs.length; k++) {
        const di = (m.outCursor + k) % outDirs.length;
        if (this._ejectToDir(m, outDirs[di], item)) { used = di; break; }
      }
      if (used < 0) break;
      m.outputs.shift();
      m.outCursor = (used + 1) % outDirs.length;
    }
    return m.outputs.length === 0;
  }

  /**
   * Try to deliver one item from source `m` ({x, y, r}) through its local
   * side `dirOffset` (0 = front). Used by machines and hoppers.
   */
  _ejectToDir(m, dirOffset, item) {
    const outDir = (m.r + dirOffset) % 4;
    const ox = m.x + DIRS[outDir].dx;
    const oy = m.y + DIRS[outDir].dy;
    const target = this.world.machineAt(ox, oy, 0) || this.world.machineAt(ox, oy, 1);
    if (!target) return false;
    if (target.t === "belt" || target.t === "belt_high") {
      const line = this.world.lines.lineForTile(ox, oy, target.z);
      const flowLine = line && this.flowLines.get(line.id);
      if (!flowLine) return false;
      const idx = line.index(tileKey(ox, oy, target.z));
      return idx !== null && flowLine.accept(item, idx);
    }
    if (!acceptsFrom(target.t, target.r, (outDir + 2) % 4)) return false; // no input port on this side
    if (target.t === "dock") return this._dockAccept(item);
    if (target.t in HANDLERS) {
      const tm = this.machines.get(tileKey(ox, oy, 0));
      const fromDir = (outDir + 2) % 4;
      if (!tm || !this._machineCanTake(tm, item, fromDir)) return false;
      this._putInto(tm, item, fromDir);
      return true;
    }
    return false;
  }

  // ---- state for the renderer and hover card -------------------------------

  /**
   *   "blocked"  finished parts it cannot send out (or a full depot)
   *   "working"  has what it needs and is making something
   *   "waiting"  needs more parts
   */
  machineState(m) {
    const h = m.handler;
    if (!h) return "waiting";
    if (h.buffer) {
      if (m.buffer.length >= this.capacityOf(m)) return "blocked";
      return m.buffer.length || m.outputs.length ? "working" : "waiting";
    }
    if (m.outputs.length > 0) return "blocked";
    if (m.inputs.length >= (h.needs || 1)) return "working";
    return "waiting";
  }

  /** Belt tails that end against a machine side with no input port. */
  wrongSideEnds() {
    const out = [];
    for (const fl of this.flowLines.values()) {
      const a = this._acceptorPast(fl);
      if (a && a.kind === "wrongSide") {
        const t = fl.line.tile(fl.tail);
        out.push({ x: t.x, y: t.y, dir: t.dir, z: t.z || 0 });
      }
    }
    return out;
  }

  // ---- jam detection (H key) -------------------------------------------------

  findJam() {
    const name = (m) => MACHINE_NAMES[m.type] || m.type;
    for (const m of this.machines.values()) {
      if (m.outputs.length > 0 && !m.handler?.buffer) {
        return {
          key: tileKey(m.x, m.y, 0),
          msg: `The ${name(m)} is stuck holding ${itemName(m.outputs[0])}. Check what is in front of it.`,
        };
      }
    }
    for (const fl of this.flowLines.values()) {
      if (!fl.items.length) continue;
      const last = fl.items[fl.items.length - 1];
      if (last.d >= fl.length - 1 - 0.01) {
        const a = this._acceptorPast(fl);
        const why = a?.kind === "wrongSide" ? " The belt runs into the side of a machine with no input there."
          : a?.kind === "dock" ? " The dock does not need this part right now."
          : a?.kind === "empty" ? " The belt ends here." : "";
        return { key: fl.tail, msg: `A ${itemName(last.item)} is waiting at the end of this belt.${why}` };
      }
    }
    for (const m of this.machines.values()) {
      const h = m.handler;
      if (h && !h.buffer && m.inputs.length > 0 && m.inputs.length < (h.needs || 1)) {
        return {
          key: tileKey(m.x, m.y, 0),
          msg: `The ${name(m)} has ${m.inputs.map(itemName).join(", ")} and is waiting for one more part.`,
        };
      }
    }
    return null;
  }

  // ---- stats --------------------------------------------------------------

  itemCount() {
    let count = 0;
    for (const fl of this.flowLines.values()) count += fl.count();
    for (const m of this.machines.values()) count += m.inputs.length + m.outputs.length + m.buffer.length;
    return count;
  }

  /** Ledger check: true when no part was created or lost unexpectedly. */
  ledgerOk() {
    const expected = this.emitted + this.injected + this.made - this.merged - this.delivered - this.recycled - this.partsRemoved;
    return this.itemCount() === expected;
  }
}
