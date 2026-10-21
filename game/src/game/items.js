// Items (Phase 2): abstract materials and open operations.
//
// An item is an immutable recipe tree written as a canonical string:
//   raw part     "m1"                     (materials m1..m4)
//   cut part     "cut(m1)"                one half of m1 (cut again: a quarter)
//   pressed part "press(cut(m1))"         reshaped
//   assembly     "join(a|b)"              any two items; children sorted, so
//                                         join(a|b) equals join(b|a)
//   product      "case(assembly|shell)"   an assembly inside a shell part;
//                                         order kept: assembly first
//
// Parts are raw materials and anything made from one part by cut or press.
// Only parts can be cut or pressed, and pressing is the last step for a
// part: a pressed part cannot be cut or pressed again. (So every part is
// "material, cut 0 to 3 times, maybe pressed", and no two ids look alike.) A shell is a part whose material is in
// operations.shellMaterials. Depth (raw = 0, each operation + 1) is capped
// by operations.depthLimit so the item space stays testable.
//
// Real names come later from data/items.json "names"; until then every id
// gets a generated label.

import { operations, items as itemData } from "../data/index.js";

export const RAW = Object.keys(itemData.materials);
const SHELLS = new Set(operations.shellMaterials);
export const DEPTH_LIMIT = operations.depthLimit;

const cache = new Map();

/** Parse a canonical id into { op, args } (raw parts: { op: null, id }). */
export function parseItem(id) {
  const hit = cache.get(id);
  if (hit) return hit;
  let node;
  const open = id.indexOf("(");
  if (open === -1) {
    node = { op: null, id, args: [] };
  } else {
    const op = id.slice(0, open);
    const inner = id.slice(open + 1, id.lastIndexOf(")"));
    const args = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "|" && depth === 0) {
        args.push(inner.slice(start, i));
        start = i + 1;
      }
    }
    args.push(inner.slice(start));
    node = { op, id, args };
  }
  cache.set(id, node);
  return node;
}

export function isRaw(id) {
  return RAW.includes(id);
}

/** Raw parts and anything cut or pressed from one part. */
export function isPart(id) {
  const n = parseItem(id);
  if (n.op === null) return isRaw(id);
  if (n.op === "cut") return isPart(n.args[0]) && !isPressed(n.args[0]);
  if (n.op === "press") return isPart(n.args[0]) && !isPressed(n.args[0]);
  return false;
}

export function isPressed(id) {
  return parseItem(id).op === "press";
}

/** How many times a part was cut (0 for raw). */
export function cutCount(id) {
  let n = 0;
  let cur = id;
  for (;;) {
    const c = parseItem(cur);
    if (c.op === "cut") n++;
    else if (c.op !== "press") return n;
    cur = c.args[0];
  }
}

export function isAssembly(id) {
  return parseItem(id).op === "join";
}

export function isProduct(id) {
  return parseItem(id).op === "case";
}

/** Material of a part (m1..m4), or null for assemblies and products. */
export function material(id) {
  const n = parseItem(id);
  if (n.op === null) return isRaw(id) ? id : null;
  if (n.op === "cut" || n.op === "press") return material(n.args[0]);
  return null;
}

export function isShell(id) {
  return isPart(id) && SHELLS.has(material(id));
}

export function depth(id) {
  const n = parseItem(id);
  if (n.op === null) return 0;
  return 1 + Math.max(...n.args.map(depth));
}

/** Is this a valid item id the game can make or hold? */
export function itemExists(id) {
  if (typeof id !== "string" || !id) return false;
  const n = parseItem(id);
  if (n.op === null) return isRaw(id);
  if (depth(id) > DEPTH_LIMIT) return false;
  if (n.op === "cut" || n.op === "press") return n.args.length === 1 && isPart(id);
  if (n.op === "join") {
    return n.args.length === 2 && n.args.every(itemExists) && n.args[0] <= n.args[1];
  }
  if (n.op === "case") {
    return n.args.length === 2 && isAssembly(n.args[0]) && itemExists(n.args[0]) && isShell(n.args[1]);
  }
  return false;
}

// ---- making items (the operations) ----------------------------------------

export const make = {
  cut: (p) => `cut(${p})`,
  press: (p) => `press(${p})`,
  join: (a, b) => (a <= b ? `join(${a}|${b})` : `join(${b}|${a})`),
  case: (assembly, shell) => `case(${assembly}|${shell})`,
};

// ---- names -------------------------------------------------------------------

function partLabel(id) {
  const n = parseItem(id);
  if (n.op === null) return itemData.materials[id]?.label || id;
  let cuts = 0;
  let pressed = false;
  let cur = id;
  // walk down the chain: cut/press wrappers around one raw material
  for (;;) {
    const c = parseItem(cur);
    if (c.op === "cut") cuts++;
    else if (c.op === "press") pressed = true;
    else break;
    cur = c.args[0];
  }
  const piece = ["", " half", " quarter", " eighth", " sixteenth"][cuts] ?? ` piece (cut ${cuts} times)`;
  return `${pressed ? "pressed " : ""}${itemData.materials[cur]?.label || cur}${piece}`;
}

/** Short, readable label for any id. Real names (data/items.json) win. */
export function itemName(id) {
  const named = itemData.names[id];
  if (named) return named;
  const n = parseItem(id);
  if (n.op === "join") return `${group(n.args[0])} + ${group(n.args[1])}`;
  if (n.op === "case") return `${group(n.args[0])} in ${itemName(n.args[1])} shell`;
  return partLabel(id);
}

/** Wrap nested assemblies and products in brackets so labels stay clear. */
function group(id) {
  const op = parseItem(id).op;
  const named = itemData.names[id];
  return !named && (op === "join" || op === "case") ? `(${itemName(id)})` : itemName(id);
}

/** Registry-style lookup kept for older callers: { id, name } or null. */
export function getItem(id) {
  return itemExists(id) ? { id, name: itemName(id) } : null;
}

export function materialStyle(m) {
  return itemData.materials[m] || { label: m, color: "#999", pattern: "none" };
}

/**
 * Steps to make an item from raw materials, in order, as short text. Used
 * by the dock panel ("how to make it").
 */
export function recipeSteps(id, out = []) {
  const n = parseItem(id);
  if (n.op === null) return out;
  for (const a of n.args) recipeSteps(a, out);
  if (out.includes(stepText(n))) return out; // same step needed twice: list once
  out.push(stepText(n));
  return out;
}

function stepText(n) {
  const verb = { cut: "Cut", press: "Press", join: "Combine", case: "Encase" }[n.op];
  if (n.op === "cut" || n.op === "press") return `${verb} ${itemName(n.args[0])}`;
  if (n.op === "join") return `${verb} ${itemName(n.args[0])} with ${itemName(n.args[1])}`;
  return `${verb} ${itemName(n.args[0])} in ${itemName(n.args[1])}`;
}
