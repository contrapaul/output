// Machine processing (Phase 2).
//
// Operation machines are built from data/operations.json (open operations,
// no per-item recipes):
//   cutter    one part in, two halves out          cut(p)
//   press     one part in, one pressed part out    press(p)
//   combiner  any two items in, one assembly out   join(a|b)
//   encaser   one assembly + one shell part in     case(assembly|shell)
//
// Logistics machines are code:
//   merger    any part, passes it on (several belts in, one out)
//   splitter  one in, sends each part left or right (a Y), alternating
//   recycler  removes any part (sink)
//   depot_s/m/l  storage: stacks one kind of part (50/200/1000) and feeds it
//                out the front, so a full depot works like a hopper
//
// Each machine instance has:
//   inputs   items waiting in input slots
//   buffer   storage (depots)
//   outputs  items ready to eject
//   charge   processing time so far (fractional, carries over ticks)
//
// Handler interface used by GameRoot:
//   needs                 inputs needed to start a job
//   canTake(item, held)   may this item join the items already held?
//   oneEachSide           takes at most one part per input side (combiner),
//                         so two belts make a pair and one belt cannot
//                         pair with itself
//   process(inputs)       -> { outputs, left }
//   chargeTime            seconds per job
//   buffer, capacity      storage machines
//   outDirs               exit sides (local), alternated (splitter)
//   sink                  consumes parts (counts as recycled)
//   inText / outText      plain words for the hover card

import { operations, power as powerData } from "../../data/index.js";
import { isPart, isPressed, isAssembly, isShell, depth, make, DEPTH_LIMIT } from "../items.js";

const OPS = {
  cut: {
    needs: 1,
    inText: "one part that is not pressed",
    outText: "two halves of it",
    canTake: (item, held) => held.length === 0 && isPart(item) && !isPressed(item) && depth(item) < DEPTH_LIMIT,
    output: ([p]) => [make.cut(p), make.cut(p)],
  },
  press: {
    needs: 1,
    inText: "one part that is not pressed",
    outText: "a pressed part",
    canTake: (item, held) => held.length === 0 && isPart(item) && !isPressed(item) && depth(item) < DEPTH_LIMIT,
    output: ([p]) => [make.press(p)],
  },
  join: {
    needs: 2,
    inText: "any two items, one from each side",
    outText: "one assembly made of both",
    oneEachSide: true,
    canTake: (item, held) => held.length < 2 && depth(item) < DEPTH_LIMIT,
    output: ([a, b]) => [make.join(a, b)],
  },
  case: {
    needs: 2,
    inText: "an assembly and a shell part",
    outText: "a finished product",
    canTake: (item, held) => {
      if (held.length >= 2 || depth(item) >= DEPTH_LIMIT) return false;
      if (isAssembly(item)) return !held.some(isAssembly);
      if (isShell(item)) return !held.some(isShell);
      return false;
    },
    output: (inputs) => {
      const a = inputs.find(isAssembly);
      const s = inputs.find(isShell);
      return a && s ? [make.case(a, s)] : null;
    },
  },
};

function operationHandler(def) {
  const op = OPS[def.op];
  const allow = def.allow ? new Set(def.allow) : null;
  return {
    needs: op.needs,
    inText: op.inText,
    outText: op.outText,
    chargeTime: def.time,
    power: def.power || 0,
    oneEachSide: !!op.oneEachSide,
    canTake: op.canTake,
    process: (inputs) => {
      if (inputs.length !== op.needs) return null;
      const outputs = op.output(inputs);
      if (!outputs) return null;
      if (allow && !outputs.every((o) => allow.has(o))) return null; // recipe hook
      return { outputs, left: [] };
    },
  };
}

function depotHandler(capacity) {
  return {
    needs: 1,
    inText: `one kind of part (stores up to ${capacity})`,
    outText: "the same part, sent out the front",
    buffer: true,
    capacity,
    chargeTime: 0,
    canTake: () => true, // type lock and room are checked by GameRoot
    process: null,
  };
}

export const HANDLERS = {
  merger: {
    needs: 1,
    inText: "any part, from up to three belts",
    outText: "the same part, on one belt",
    canTake: (item, held) => held.length === 0,
    chargeTime: 0,
    process: (inputs) => (inputs.length === 1 ? { outputs: [inputs[0]], left: [] } : null),
  },
  splitter: {
    needs: 1,
    inText: "any part",
    outText: "the same part, sent left or right",
    canTake: (item, held) => held.length === 0,
    chargeTime: 0.2,
    outDirs: [3, 1], // a Y: left exit, then right exit; alternates when both have room
    process: (inputs) => (inputs.length === 1 ? { outputs: [inputs[0]], left: [] } : null),
  },
  recycler: {
    needs: 1,
    inText: "any part or assembly",
    outText: "nothing (it removes the part)",
    canTake: (item, held) => held.length === 0,
    chargeTime: 0.15,
    sink: true,
    process: (inputs) => (inputs.length === 1 ? { outputs: [], left: [] } : null),
  },
  depot_s: depotHandler(50),
  depot_m: depotHandler(200),
  depot_l: depotHandler(1000),
};

export const OPERATION_MACHINES = Object.keys(operations.machines);
for (const [id, def] of Object.entries(operations.machines)) HANDLERS[id] = operationHandler(def);

export const DEPOTS = ["depot_s", "depot_m", "depot_l"];

// Ports. Sides are local to the machine's rotation:
//   0 = front (the way it faces), 1 = right, 2 = back, 3 = left.
// Parts only enter through `in` sides and leave through `out` sides.
// The splitter is a Y: in at the back, out left and right.
export const PORTS = {
  cutter: { in: [2], out: [0] },
  press: { in: [2], out: [0] },
  combiner: { in: [1, 2, 3], out: [0] },
  encaser: { in: [1, 2, 3], out: [0] },
  merger: { in: [1, 2, 3], out: [0] },
  splitter: { in: [2], out: [3, 1] },
  recycler: { in: [0, 1, 2, 3], out: [] },
  depot_s: { in: [1, 2, 3], out: [0] },
  depot_m: { in: [1, 2, 3], out: [0] },
  depot_l: { in: [1, 2, 3], out: [0] },
  dock: { in: [0, 1, 2, 3], out: [] },
  hopper: { in: [], out: [0] },
  solar: { in: [], out: [] },
  wind: { in: [], out: [] },
};

/** Local side (0..3) of a machine facing r, for an absolute direction. */
export function localSide(r, absDir) {
  return (absDir - r + 4) % 4;
}

/**
 * Can a machine of `type` facing r take parts arriving from the neighbour in
 * absolute direction `fromDir` (the direction from the machine to the source)?
 */
export function acceptsFrom(type, r, fromDir) {
  const p = PORTS[type];
  if (!p) return true;
  return p.in.includes(localSide(r, fromDir));
}

export const MACHINE_NAMES = {
  belt: "Conveyor",
  belt_high: "Overhead conveyor",
  merger: "Merger",
  splitter: "Splitter",
  recycler: "Recycler",
  depot_s: "Small depot",
  depot_m: "Depot",
  depot_l: "Large depot",
  dock: "Order dock",
  hopper: "Hopper",
};
for (const [id, def] of Object.entries(powerData.generators)) MACHINE_NAMES[id] = def.name;
for (const [id, def] of Object.entries(operations.machines)) MACHINE_NAMES[id] = def.name;

export class MachineInstance {
  /**
   * @param {string} type    machine type id (e.g., "cutter")
   * @param {number} x       tile x
   * @param {number} y       tile y
   * @param {number} r       rotation (0-3)
   */
  constructor(type, x, y, r) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.r = r;
    this.inputs = [];      // item ids in input slots
    this.inputSides = [];  // local side each input came in from
    this.buffer = [];      // FIFO storage (depots)
    this.outputs = [];     // item ids ready to eject
    this.charge = 0;       // accumulated charge time
    this.outCursor = 0;    // next preferred outDirs slot (splitter alternation)
  }

  get handler() {
    return HANDLERS[this.type];
  }

  /** What a depot holds (its locked part type), or null when empty. */
  get stored() {
    return this.buffer[0] || this.outputs[0] || null;
  }

  get isBusy() {
    return this.charge > 0 || this.outputs.length > 0;
  }

  reset() {
    this.inputs = [];
    this.inputSides = [];
    this.buffer = [];
    this.outputs = [];
    this.charge = 0;
  }
}
