// Game root (M3): owns the world, flow lines, machines, dock, and contract.
// The tick() method runs the full simulation step in the correct order:
//   1. Hoppers emit (into the line at their belt tile, mid-line allowed)
//   2. Lines advance items (tail-first)
//   3. Machines process (buffer machines first move bin -> output slot)
//   4. Dock consumes (only the exact target; nothing is ever dropped)
//
// M3 additions:
//   - dock is a real world tile, so belt-to-dock delivery works
//   - items only leave a line/machine when the acceptor can take THAT item
//     (canTake + dock target + bin capacity) - no silent item loss
//   - bins buffer (FIFO) up to their capacity (upgrade bin20 -> 20)
//   - splitter routes a part to one of two exits (handler.outDirs),
//     alternating when both have room (MachineInstance.outCursor)
//   - recycler consumes items (sink); counted in this.recycled
//   - upgrades (profile level, never required):
//       motor2x     machine charge rate x2
//       bin20       bin capacity 10 -> 20
//       dock_express  credits per accepted item 5 -> 10
//   - credits: earned per accepted item; profile-level coin balance
//   - stars: 1 for completing; +1 within contract.stars.time2 seconds;
//            +1 more when placed machine count <= contract.stars.machines3
//   - jam detection (H key): findJam() reports the blocked machine/line

import { CONFIG } from "../core/config.js";
import { World } from "./world.js";
import { FlowLine } from "./systems/flow.js";
import { MachineInstance, HANDLERS, MACHINE_NAMES, acceptsFrom } from "./systems/process.js";
import { Dock } from "./systems/dock.js";
import { Signals } from "../core/signals.js";
import { DIRS, tileKey } from "../core/grid.js";
import { getItem } from "./items.js";

const CREDIT_BASE = 5;

export class GameRoot {
  /**
   * @param {object} contract  { zone, target?, fixed, unlocked, stars?, ... }
   * @param {object} [profile] { coins, upgrades, contracts, settings }
   */
  constructor(contract, profile = {}) {
    this.signals = new Signals();
    this.world = new World(contract.zone);
    this.machines = new Map(); // tileKey -> MachineInstance
    this.flowLines = new Map(); // line id -> FlowLine
    this.hoppers = []; // { x, y, dir, item, rate, cooldown }
    this.contract = contract;
    this.tickCount = 0;
    this.time = 0; // seconds of active play on this level
    this.paused = false;

    // profile state (persisted)
    this.coins = profile.coins || 0;
    this.upgrades = new Set(profile.upgrades || []);
    this.contracts = profile.contracts || {};
    this.settings = Object.assign(
      { sound: false, theme: "light", motion: true, colorblind: false },
      profile.settings || {}
    );
    this.stats = Object.assign({ timePlayedSec: 0, machinesBuilt: 0 }, profile.stats || {});

    // per-level state
    this.placedCount = 0;
    // conservation ledger: itemCount() === emitted - delivered - recycled - partsRemoved
    this.emitted = 0; // parts released into the world by hoppers
    this.delivered = 0; // parts accepted by the dock
    this.recycled = 0; // parts consumed by recyclers
    this.partsRemoved = 0; // parts lost when their belt tile was deleted
    this.coinsEarnedHere = 0;
    this.dock = null;
    this.dockPos = null;
    this._completed = false;
    this.jam = null; // { key, msg } for H-key highlight

    if (contract.target) {
      this.dock = new Dock(contract.target.item, contract.target.amount);
    }

    for (const f of contract.fixed || []) {
      if (f.t === "dock") {
        this.world.place("dock", f.x, f.y, f.r || 0, 0, true);
        this.dockPos = { x: f.x, y: f.y };
      } else if (f.t && f.t.startsWith("hopper")) {
        this.hoppers.push({
          x: f.x, y: f.y, dir: f.r || 0,
          item: this._hopperItem(f.t), rate: 0.5, cooldown: 0,
        });
      } else {
        this.world.place(f.t, f.x, f.y, f.r || 0, 0, true);
        if (f.t in HANDLERS) {
          this.machines.set(tileKey(f.x, f.y, 0), new MachineInstance(f.t, f.x, f.y, f.r || 0));
        }
      }
    }

    this._initFlowLines();
  }

  _hopperItem(typeId) {
    const map = {
      hopper_ingot: "silicon_ingot",
      hopper_wire: "copper_wire",
      hopper_cell: "battery_cell",
      hopper_case: "housing",
    };
    return map[typeId] || "silicon_ingot";
  }

  _initFlowLines() {
    this.flowLines.clear();
    for (const line of this.world.lines.allLines()) {
      this.flowLines.set(line.id, new FlowLine(line, this.world));
    }
  }

  /**
   * Snapshot each item's tile BEFORE a world mutation, so the edit can be
   * applied without dropping in-transit parts (Phase 0: no item wipe).
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
   * Re-home every item after a belt edit (place/remove/split/splice).
   * An item keeps the tile it sat on; its new distance is that tile's index
   * in the line that now owns it. Items whose tile was deleted are removed
   * (counted in partsRemoved, "partRemoved" signal for the puff) - there is
   * no player stock system yet, so removal is the documented choice.
   */
  _resyncFlowLines(snapshot) {
    const next = new Map();
    for (const line of this.world.lines.allLines()) {
      next.set(line.id, new FlowLine(line, this.world));
    }
    const removed = [];
    for (const [id, entries] of snapshot) {
      for (const e of entries) {
        const cur = this.world.lines.tileToLine.get(e.tileKey);
        if (cur) {
          const idx = cur.index(e.tileKey);
          if (idx !== null) {
            const target = next.get(cur.id);
            if (target) {
              const d = Math.min(idx + e.frac, cur.length - 1);
              target.items.push({ d, pd: d, item: e.item });
            }
            continue;
          }
        }
        removed.push({ item: e.item, x: e.x, y: e.y });
      }
    }
    for (const fl of next.values()) fl.items.sort((a, b) => a.d - b.d);
    this.flowLines = next;
    if (removed.length) {
      this.partsRemoved += removed.length;
      for (const r of removed) this.signals.emit("partRemoved", { item: r.item, x: r.x, y: r.y });
    }
  }

  // ---- placement (delegates to world, updates flow) --------------------

  placeMachine(type, x, y, r, z) {
    if (z === undefined) z = type === "belt_high" ? 1 : 0;
    if (type === "belt" || type === "belt_high") {
      const snapshot = this._snapshotItemTiles();
      const ok = this.world.place(type, x, y, r, z);
      if (ok) {
        this._resyncFlowLines(snapshot);
        this.placedCount++;
        this.stats.machinesBuilt++;
      }
      return ok;
    }
    if (type in HANDLERS) {
      const ok = this.world.place(type, x, y, r, 0);
      if (ok) {
        this.machines.set(tileKey(x, y, 0), new MachineInstance(type, x, y, r));
        this.placedCount++;
        this.stats.machinesBuilt++;
      }
      return ok;
    }
    return null;
  }

  /**
   * Remove whatever is at (x, y, z). Fixed contract pieces (the dock) cannot
   * be removed. Parts held inside a removed machine leave the world and are
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
    if (isBelt) this._resyncFlowLines(snapshot);
    if (inst) {
      const held = [...inst.inputs, ...inst.outputs, ...inst.buffer];
      this.partsRemoved += held.length;
      for (const item of held) this.signals.emit("partRemoved", { item, x, y });
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
      let ok = !!this.world.place(m.t, x, y, r, z);
      if (!ok) this.world.place(m.t, x, y, from, z);
      this._resyncFlowLines(snapshot);
      return ok;
    }
    const inst = this.machines.get(tileKey(x, y, 0));
    m.r = r;
    if (inst) inst.r = r;
    return true;
  }

  // ---- economy ----------------------------------------------------------

  creditPerItem() {
    return this.upgrades.has("dock_express") ? CREDIT_BASE * 2 : CREDIT_BASE;
  }

  binCapacity() {
    return this.upgrades.has("bin20") ? 20 : 10;
  }

  chargeRate() {
    return this.upgrades.has("motor2x") ? 2 : 1;
  }

  buyUpgrade(id, price) {
    if (this.upgrades.has(id)) return false;
    if (this.coins < price) return false;
    this.coins -= price;
    this.upgrades.add(id);
    this.signals.emit("upgradeBought", { id, coins: this.coins });
    return true;
  }

  _computeStars() {
    let stars = 1;
    const s = this.contract.stars;
    if (s && this.time <= s.time2) stars = 2;
    if (s && stars === 2 && this.placedCount <= s.machines3) stars = 3;
    return stars;
  }

  // ---- tick -------------------------------------------------------------

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

    if (this.dock && this.dock.complete && !this._completed) {
      this._completed = true;
      const stars = this._computeStars();
      const prev = this.contracts[this.contract.id] || {};
      this.contracts[this.contract.id] = {
        stars: Math.max(prev.stars || 0, stars),
        bestTime: prev.bestTime ? Math.min(prev.bestTime, this.time) : this.time,
      };
      this.signals.emit("contractComplete", {
        accepted: this.dock.accepted,
        target: this.dock.target,
        stars,
        coins: this.coins,
        earned: this.coinsEarnedHere,
        time: this.time,
      });
    }
  }

  _hopperFront(h) {
    const d = DIRS[h.dir];
    return this.world.beltAt(h.x + d.dx, h.y + d.dy, 0);
  }

  _tickHoppers(dt) {
    for (const h of this.hoppers) {
      h.cooldown -= dt;
      if (h.cooldown > 0) continue;
      const front = this._hopperFront(h);
      if (!front) continue;
      const line = this.world.lines.lineForTile(front.x, front.y, front.z);
      if (!line) continue;
      const flowLine = this.flowLines.get(line.id);
      if (!flowLine) continue;
      const idx = line.index(tileKey(front.x, front.y, front.z));
      if (idx === null) continue;
      if (flowLine.accept(h.item, idx)) {
        this.emitted++;
        h.cooldown = 1 / h.rate;
      }
    }
  }

  /**
   * What sits past the tail of a flow line? Returns { kind, m | dock }
   * or null. kind is "machine", "dock", "belt", "wrongSide" (a machine
   * whose ports do not face this belt) or "empty".
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
    // the belt touches the target on the side facing back along the belt
    const fromDir = (tailTile.dir + 2) % 4;
    if (!acceptsFrom(target.t, target.r, fromDir)) return { kind: "wrongSide", m: target };
    if (target.t === "dock") return { kind: "dock" };
    if (target.t in HANDLERS) {
      const m = this.machines.get(tileKey(nx, ny, 0));
      return m ? { kind: "machine", m } : null;
    }
    return null;
  }

  /** Can the acceptor past `flowLine` take this specific item? */
  _canTake(flowLine, item) {
    const a = this._acceptorPast(flowLine);
    if (!a) return false;
    if (a.kind === "dock") {
      return !!this.dock && !this.dock.complete && item === this.dock.target;
    }
    if (a.kind === "machine") {
      const h = a.m.handler;
      if (!h) return false;
      if (h.buffer) return a.m.buffer.length < this.binCapacity();
      if (a.m.outputs.length > 0) return false;
      if (a.m.inputs.length >= (h.needs || 1)) return false;
      if (h.needs === 2 && a.m.inputs.includes(item)) return false; // avoid dead pairs like die+die
      return h.canTake(item);
    }
    return false; // belt, empty, unknown
  }

  /** Deliver one ejected item. Returns true if the acceptor took it. */
  _deliverItem(flowLine, item) {
    const a = this._acceptorPast(flowLine);
    if (!a) return false;
    if (a.kind === "machine") {
      if (this._canTake(flowLine, item)) {
        if (a.m.handler && a.m.handler.buffer) a.m.buffer.push(item);
        else a.m.inputs.push(item);
        return true;
      }
      return false;
    }
    if (a.kind === "dock") {
      if (this.dock && !this.dock.complete && this.dock.tryAccept(item)) {
        this._creditDock(item);
        return true;
      }
    }
    return false;
  }

  /** Dock accepted an item: credits + ledger (single source of truth). */
  _creditDock(item) {
    const gain = this.creditPerItem();
    this.coins += gain;
    this.coinsEarnedHere += gain;
    this.delivered++;
    this.signals.emit("itemAccepted", { item, accepted: this.dock.accepted, gain });
  }

  _tickLines(dt) {
    const velocity = CONFIG.BELT_RATE * dt;
    for (const flowLine of this.flowLines.values()) {
      const canEject = (item) => this._canTake(flowLine, item);
      const ejected = flowLine.step(velocity, canEject);
      for (const itemId of ejected) {
        if (!this._deliverItem(flowLine, itemId)) {
          // delivery failed in the meantime (e.g., the dock completed this
          // tick). Put the item back at the tail so it is never lost.
          flowLine.requeueAtTail(itemId);
        }
      }
    }
  }

  _tickMachines(dt) {
    const machines = [...this.machines.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const m of machines) {
      const h = m.handler;
      if (!h) continue;

      if (h.buffer) {
        // bin: free one buffered item into the output slot, then eject
        if (m.outputs.length === 0 && m.buffer.length > 0) {
          m.outputs.push(m.buffer.shift());
        }
        if (m.outputs.length > 0) this._ejectMachineOutput(m);
        continue;
      }

      if (m.outputs.length > 0) this._ejectMachineOutput(m);

      const needed = h.needs || 1;
      if (m.outputs.length === 0 && m.inputs.length >= needed) {
        m.charge += dt * this.chargeRate();
        if (m.charge >= h.chargeTime) {
          const res = h.process(m.inputs);
          if (res) {
            const outputs = Array.isArray(res) ? res : res.outputs;
            const left = Array.isArray(res) ? [] : res.left || [];
            if (h.sink) this.recycled += m.inputs.length - left.length;
            m.outputs = outputs;
            m.inputs = left;
            m.charge = 0;
          }
        }
      }
    }
  }

  /**
   * Eject machine outputs one by one. Machines with handler.outDirs
   * (splitter) try their exits starting at m.outCursor and alternate the
   * cursor after each successful eject, so two open exits share the load.
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

  /** Try to deliver one item through exit `dirOffset` (0-based, + r). */
  _ejectToDir(m, dirOffset, item) {
    const outDir = (m.r + dirOffset) % 4;
    const ox = m.x + DIRS[outDir].dx;
    const oy = m.y + DIRS[outDir].dy;
    const target = this.world.machineAt(ox, oy, 0) || this.world.machineAt(ox, oy, 1);
    if (!target) return false;
    if (target.t !== "belt" && target.t !== "belt_high" && !acceptsFrom(target.t, target.r, (outDir + 2) % 4)) {
      return false; // the next machine has no input port on this side
    }
    if (target.t === "belt" || target.t === "belt_high") {
      const line = this.world.lines.lineForTile(ox, oy, target.z);
      const flowLine = line && this.flowLines.get(line.id);
      if (!flowLine) return false;
      const idx = line.index(tileKey(ox, oy, target.z));
      return idx !== null && flowLine.accept(item, idx);
    }
    if (target.t === "dock") {
      if (this.dock && !this.dock.complete && this.dock.tryAccept(item)) {
        this._creditDock(item);
        return true;
      }
      return false;
    }
    if (target.t in HANDLERS) {
      const tm = this.machines.get(tileKey(ox, oy, 0));
      if (!tm) return false;
      const th = tm.handler;
      if (!th) return false;
      const full = th.buffer
        ? tm.buffer.length >= this.binCapacity()
        : tm.outputs.length > 0 || tm.inputs.length >= (th.needs || 1);
      const dupPair = !th.buffer && th.needs === 2 && tm.inputs.includes(item);
      if (full || dupPair || !th.canTake(item)) return false;
      if (th.buffer) tm.buffer.push(item);
      else tm.inputs.push(item);
      return true;
    }
    return false;
  }

  /**
   * What a machine is doing, for the renderer and the hover card:
   *   "blocked"  it has finished parts it cannot send out (or a full bin)
   *   "working"  it has what it needs and is making something
   *   "waiting"  it needs more parts
   */
  machineState(m) {
    const h = m.handler;
    if (!h) return "waiting";
    if (h.buffer) {
      if (m.buffer.length >= this.binCapacity()) return "blocked";
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

  // ---- jam detection (H key) -------------------------------------------

  findJam() {
    // 1. machine with a blocked output
    for (const m of this.machines.values()) {
      if (m.outputs.length > 0) {
        return {
          key: tileKey(m.x, m.y, 0),
          msg: `${MACHINE_NAMES[m.type] || m.type} is full and waiting. It takes ${this._inText(m)} and makes ${this._outText(m)}. Check what is in front of it.`,
        };
      }
    }
    // 2. bin at capacity
    for (const m of this.machines.values()) {
      const h = m.handler;
      if (h && h.buffer && m.buffer.length >= this.binCapacity()) {
        return {
          key: tileKey(m.x, m.y, 0),
          msg: `The bin is full (${m.buffer.length}/${this.binCapacity()}). Its exit is blocked.`,
        };
      }
    }
    // 3. line with a part parked at the exit
    for (const fl of this.flowLines.values()) {
      if (!fl.items.length) continue;
      const last = fl.items[fl.items.length - 1];
      if (last.d >= fl.length - 1 - 0.01) {
        const name = getItem(last.item)?.name || last.item;
        return {
          key: fl.tail,
          msg: `A ${name} is waiting at the end of this line. See what is in front of it.`,
        };
      }
    }
    // 4. machine with inputs ready but output slot taken (covered by 1) or
    //    inputs full waiting for the other part
    for (const m of this.machines.values()) {
      const h = m.handler;
      if (h && !h.buffer && m.inputs.length >= (h.needs || 1) && m.outputs.length === 0) {
        return {
          key: tileKey(m.x, m.y, 0),
          msg: `${MACHINE_NAMES[m.type] || m.type} has its parts and is working.`,
        };
      }
      if (h && !h.buffer && m.inputs.length > 0 && m.inputs.length < (h.needs || 1)) {
        const have = m.inputs.map((i) => getItem(i)?.name || i).join(", ");
        return {
          key: tileKey(m.x, m.y, 0),
          msg: `${MACHINE_NAMES[m.type] || m.type} has ${have} and is waiting for more. It takes ${this._inText(m)}.`,
        };
      }
    }
    return null;
  }

  _inText(m) {
    const h = m.handler;
    return h && h.inText ? h.inText : "parts";
  }

  _outText(m) {
    const h = m.handler;
    return h && h.outText ? h.outText : "parts";
  }

  // ---- stats ------------------------------------------------------------

  itemCount() {
    let count = 0;
    for (const fl of this.flowLines.values()) count += fl.count();
    for (const m of this.machines.values()) count += m.inputs.length + m.outputs.length + m.buffer.length;
    return count;
  }

  reset() {
    if (this.dock) this.dock.reset();
    for (const fl of this.flowLines.values()) fl.clear();
    for (const m of this.machines.values()) m.reset();
    for (const h of this.hoppers) h.cooldown = 0;
    this.tickCount = 0;
    this.time = 0;
    this.emitted = 0;
    this.delivered = 0;
    this.recycled = 0;
    this.partsRemoved = 0;
    this.coinsEarnedHere = 0;
    this._completed = false;
    this.jam = null;
  }
}
