// Machine processing system (M3).
//
// Each machine instance has:
//   - inputs:  items waiting in input slots
//   - buffer:  bin-style storage (FIFO) for buffer machines
//   - outputs: items ready to eject
//   - charge:  accumulated processing time (fractional, carries over ticks)
//
// Per tick, for each machine (stable order):
//   1. Buffer machines (bin): move one buffered item into the output slot
//      if the output slot is empty, then try to eject.
//   2. Other machines: if all required inputs are present and the output
//      slot is empty, accumulate charge (motor2x upgrade doubles this rate).
//      When charge >= chargeTime, run process().
//   3. process(inputs) returns { outputs, left }:
//        outputs  -> items placed in the output slots (ejected next)
//        left     -> inputs NOT consumed; they stay in the machine (M3 form)
//      Returning a plain array is accepted and treated as { outputs: arr }.
//   4. Eject outputs into downstream (belt line, machine, or dock).
//      A machine's output direction is its rotation r; handlers with
//      outDirs (splitter) send successive outputs to r+outDirs[0],
//      r+outDirs[1], ...
//
// Machines:
//   saw       ingot -> 2 wafers, wafer -> 2 dies
//   press     wire -> coil
//   solder    die + coil -> board
//   mounter   board + cell -> module
//   encap     module + housing -> device
//   merger    any -> any (pass-through)
//   splitter  any -> 2 copies, sent to two different output directions
//   bin       any -> stored (FIFO, capacity 10, upgrade bin20 -> 20)
//   recycler  any -> nothing (sink: the clean way to remove a part)

export const HANDLERS = {
  saw: {
    needs: 1,
    inText: "a silicon ingot or a silicon wafer",
    outText: "2 silicon wafers (or 2 silicon dies)",
    canTake: (item) => item === "silicon_ingot" || item === "silicon_wafer",
    chargeTime: 0.5,
    process: (inputs) => {
      if (inputs.length !== 1) return null;
      const [item] = inputs;
      if (item === "silicon_ingot") return { outputs: ["silicon_wafer", "silicon_wafer"], left: [] };
      if (item === "silicon_wafer") return { outputs: ["silicon_die", "silicon_die"], left: [] };
      return null;
    },
  },
  press: {
    needs: 1,
    inText: "a copper wire",
    outText: "a copper coil",
    canTake: (item) => item === "copper_wire",
    chargeTime: 0.5,
    process: (inputs) => {
      if (inputs.length !== 1 || inputs[0] !== "copper_wire") return null;
      return { outputs: ["copper_coil"], left: [] };
    },
  },
  solder: {
    needs: 2,
    inText: "a silicon die and a copper coil",
    outText: "a circuit board",
    canTake: (item) => item === "silicon_die" || item === "copper_coil",
    chargeTime: 0.8,
    process: (inputs) => {
      if (inputs.length !== 2) return null;
      const sorted = [...inputs].sort();
      if (sorted[0] === "copper_coil" && sorted[1] === "silicon_die") {
        return { outputs: ["solder(copper_coil|silicon_die)"], left: [] };
      }
      return null;
    },
  },
  mounter: {
    needs: 2,
    inText: "a circuit board and a battery cell",
    outText: "a module",
    canTake: (item) =>
      item === "solder(copper_coil|silicon_die)" || item === "battery_cell",
    chargeTime: 0.8,
    process: (inputs) => {
      if (inputs.length !== 2) return null;
      const sorted = [...inputs].sort();
      if (
        sorted[0] === "battery_cell" &&
        sorted[1] === "solder(copper_coil|silicon_die)"
      ) {
        return { outputs: ["mount(battery_cell|solder(copper_coil|silicon_die))"], left: [] };
      }
      return null;
    },
  },
  encap: {
    needs: 2,
    inText: "a module and a housing",
    outText: "a finished device",
    canTake: (item) =>
      item === "mount(battery_cell|solder(copper_coil|silicon_die))" ||
      item === "housing",
    chargeTime: 0.8,
    process: (inputs) => {
      if (inputs.length !== 2) return null;
      const sorted = [...inputs].sort();
      if (
        sorted[0] === "housing" &&
        sorted[1] === "mount(battery_cell|solder(copper_coil|silicon_die))"
      ) {
        return { outputs: ["encap(housing|mount(battery_cell|solder(copper_coil|silicon_die)))"], left: [] };
      }
      return null;
    },
  },
  merger: {
    needs: 1,
    inText: "any part, from two lines",
    outText: "the same part, on one line",
    canTake: () => true,
    chargeTime: 0,
    process: (inputs) => {
      if (inputs.length !== 1) return null;
      return { outputs: [inputs[0]], left: [] };
    },
  },
  splitter: {
    needs: 1,
    inText: "any part",
    outText: "two copies, sent to two directions",
    canTake: () => true,
    chargeTime: 0.2,
    outDirs: [0, 1], // copy 1 to r, copy 2 to r+1
    process: (inputs) => {
      if (inputs.length !== 1) return null;
      return { outputs: [inputs[0], inputs[0]], left: [] };
    },
  },
  bin: {
    needs: 1,
    inText: "any part (stores up to 10)",
    outText: "the same part, in order",
    buffer: true,
    capacity: 10,
    canTake: () => true,
    chargeTime: 0,
    process: null, // buffer machine: handled by the root tick
  },
  recycler: {
    needs: 1,
    inText: "any part or assembly",
    outText: "nothing (it removes the part)",
    canTake: () => true,
    chargeTime: 0.15,
    process: (inputs) => {
      if (inputs.length !== 1) return null;
      return { outputs: [], left: [] }; // consumed, nothing out
    },
  },
};

export const MACHINE_NAMES = {
  belt: "Conveyor",
  belt_high: "Overhead conveyor",
  saw: "Saw",
  press: "Coil press",
  solder: "Solder station",
  mounter: "Assembler",
  encap: "Encapsulation",
  merger: "Merger",
  splitter: "Splitter",
  bin: "Bin",
  recycler: "Recycler",
  dock: "Order dock",
};

export class MachineInstance {
  /**
   * @param {string} type    machine type id (e.g., "saw")
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
    this.buffer = [];      // FIFO storage (bin)
    this.outputs = [];     // item ids ready to eject
    this.charge = 0;       // accumulated charge time
    this.upgrades = [];    // machine-level upgrade ids (unused in v1)
  }

  get handler() {
    return HANDLERS[this.type];
  }

  get output() {
    return this.outputs.length ? this.outputs[0] : null;
  }

  set output(v) {
    if (v === null) this.outputs = [];
    else this.outputs = [v];
  }

  get isBusy() {
    return this.charge > 0 || this.outputs.length > 0;
  }

  /** Full = output blocked, or bin buffer at capacity. */
  get isFull() {
    const h = this.handler;
    if (this.outputs.length > 0) return true;
    if (h && h.buffer && h.capacity && this.buffer.length >= h.capacity) return true;
    return false;
  }

  reset() {
    this.inputs = [];
    this.buffer = [];
    this.outputs = [];
    this.charge = 0;
  }
}
