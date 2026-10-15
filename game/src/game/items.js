// Item registry and canonical encoding.
//
// An item is an immutable recipe tree. Equality is string equality of the
// canonical form. M1 needs 3 silicon items; M2 adds the rest.
//
// Canonical encoding:
//   part:      "silicon_ingot"
//   assembly:  "solder(copper_coil|silicon_die)"   // children sorted
//
// M1 scope: parts only (no assemblies yet). The assembly encoding is in the
// registry so M2's solder/mounter/encap machines can reference them.

export const ITEM_REGISTRY = {
  silicon_ingot: {
    id: "silicon_ingot",
    name: "Silicon ingot",
    icon: { base: "hex", color: "#8899aa", pattern: "none", sub: [] },
    steps: [],
  },
  silicon_wafer: {
    id: "silicon_wafer",
    name: "Silicon wafer",
    icon: { base: "circle", color: "#a0b0c0", pattern: "rings", sub: [] },
    steps: ["cut an ingot with the saw"],
  },
  silicon_die: {
    id: "silicon_die",
    name: "Silicon die",
    icon: { base: "square", color: "#c0cdd8", pattern: "grid", sub: [] },
    steps: ["cut a wafer with the saw"],
  },
  // M2 items (registry entries ready, machines not yet built)
  copper_wire: {
    id: "copper_wire",
    name: "Copper wire",
    icon: { base: "line", color: "#d4884a", pattern: "none", sub: [] },
    steps: [],
  },
  copper_coil: {
    id: "copper_coil",
    name: "Copper coil",
    icon: { base: "circle", color: "#d4884a", pattern: "spiral", sub: [] },
    steps: ["press a wire with the coil press"],
  },
  battery_cell: {
    id: "battery_cell",
    name: "Battery cell",
    icon: { base: "rect", color: "#5a9e6f", pattern: "none", sub: [] },
    steps: [],
  },
  housing: {
    id: "housing",
    name: "Housing",
    icon: { base: "rect", color: "#c8b44a", pattern: "none", sub: [] },
    steps: [],
  },
  // Assemblies (M2)
  "solder(copper_coil|silicon_die)": {
    id: "solder(copper_coil|silicon_die)",
    name: "Circuit board",
    icon: { base: "rect", color: "#4a7a5a", pattern: "none",
            sub: [{ part: "silicon_die", at: [-0.2, -0.2] },
                  { part: "copper_coil", at: [0.2, 0.2] }] },
    steps: ["solder a die with a coil"],
  },
  "mount(battery_cell|solder(copper_coil|silicon_die))": {
    id: "mount(battery_cell|solder(copper_coil|silicon_die))",
    name: "Module",
    icon: { base: "rect", color: "#5a6a7a", pattern: "none",
            sub: [{ part: "solder(copper_coil|silicon_die)", at: [-0.15, -0.15] },
                  { part: "battery_cell", at: [0.2, 0.15] }] },
    steps: ["solder a die with a coil", "mount a battery on the board"],
  },
  "encap(housing|mount(battery_cell|solder(copper_coil|silicon_die)))": {
    id: "encap(housing|mount(battery_cell|solder(copper_coil|silicon_die)))",
    name: "Device",
    icon: { base: "rect", color: "#8a7a5a", pattern: "none",
            sub: [{ part: "mount(battery_cell|solder(copper_coil|silicon_die))", at: [0, 0] }] },
    steps: ["solder a die with a coil", "mount a battery on the board",
            "place the module in a housing"],
  },
};

// ---- canonical encoding helpers ----------------------------------------

/**
 * Canonical form: children sorted, joined with "|", wrapped in func(...).
 * M1: only parts (no nesting). M2: full recursion.
 */
export function canonicalize(item) {
  if (typeof item === "string") return item;
  // { func: "solder", children: ["silicon_die", "copper_coil"] }
  const children = item.children.map(canonicalize).sort();
  return item.func + "(" + children.join("|") + ")";
}

/** Parse a canonical string back into a tree (for save/load). */
export function parseItem(str) {
  if (!str.includes("(")) return str; // plain part
  const func = str.slice(0, str.indexOf("("));
  const inner = str.slice(str.indexOf("(") + 1, str.lastIndexOf(")"));
  // split on "|" but not inside nested parens
  const children = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "(") depth++;
    else if (inner[i] === ")") depth--;
    else if (inner[i] === "|" && depth === 0) {
      children.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  children.push(inner.slice(start));
  return { func, children: children.map(parseItem) };
}

/** Two items are equal iff their canonical strings are equal. */
export function itemsEqual(a, b) {
  return canonicalize(a) === canonicalize(b);
}

export function itemExists(id) {
  return ITEM_REGISTRY.hasOwnProperty(id);
}

export function getItem(id) {
  return ITEM_REGISTRY[id] || null;
}
