// Art review sheet (?art=1): every part form, plus every contract item and
// the items inside it, drawn at belt size and at order-panel size, with
// labels. Add &cb=1 for colorblind patterns, &theme=dark for the dark theme.

import { RAW, make, itemName, parseItem, isPart } from "../game/items.js";
import { drawItem } from "../game/art.js";
import { CONTRACTS } from "../game/campaign.js";
import {
  palette, drawMachineBody, drawMachineTrim, drawMachineGlyph, drawMachinePorts, drawSolar, drawWind, MACHINE_COLORS,
} from "../game/art/style.js";
import { MACHINE_NAMES } from "../game/systems/process.js";

const MACHINE_TYPES = [
  "cutter", "press", "combiner", "encaser", "merger", "splitter",
  "depot_s", "depot_m", "depot_l", "recycler",
];

/** One machine on a tile of its own, with its floor plate under it. */
function drawMachineCard(ctx, type, size, pal, state) {
  const tile = size;
  ctx.fillStyle = pal.floor;
  ctx.fillRect(0, 0, tile, tile);
  ctx.strokeStyle = pal.seam;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, tile - 1, tile - 1);
  const [idle, busy] = MACHINE_COLORS[type] || ["#888", "#999"];
  drawMachineBody(ctx, 0, 0, tile, pal, idle, busy, state);
  ctx.save();
  ctx.translate(tile / 2, tile / 2);
  drawMachineTrim(ctx, tile, pal, state, 0);
  ctx.restore();
  if (type.startsWith("depot_")) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tile * 0.22, tile * 0.22, tile * 0.56, tile * 0.56);
  } else {
    drawMachineGlyph(ctx, 0, 0, tile, type, 0);
  }
  drawMachinePorts(ctx, type, 0, 0, tile);
}

function subItems(id, out) {
  out.add(id);
  for (const a of parseItem(id).args) if (!isPart(a) || a.includes("(")) subItems(a, out);
  return out;
}

export function showArtSheet(root) {
  const params = new URLSearchParams(window.location.search);
  const cb = params.has("cb");
  if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");
  root.innerHTML = "";
  root.style.cssText = "overflow:auto;height:100%;padding:16px;box-sizing:border-box;";

  const parts = [];
  for (const m of RAW) {
    let p = m;
    for (let c = 0; c <= 3; c++) {
      parts.push(p, make.press(p));
      p = make.cut(p);
    }
  }
  const assemblies = new Set();
  for (const c of CONTRACTS) subItems(c.item, assemblies);
  for (const p of parts) assemblies.delete(p);

  const cardFor = (label, code) => {
    const card = document.createElement("div");
    card.style.cssText = "background:var(--panel);border-radius:8px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:4px;font:12px system-ui;text-align:center;";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;";
    card.append(row);
    const text = document.createElement("div");
    text.textContent = label;
    const codeEl = document.createElement("code");
    codeEl.textContent = code;
    codeEl.style.cssText = "color:var(--muted);font-size:10px;word-break:break-all;";
    card.append(text, codeEl);
    return { card, row };
  };

  const canvasAt = (row, size) => {
    const cv = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = size * dpr;
    cv.style.width = cv.style.height = `${size}px`;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    row.appendChild(cv);
    return { cv, ctx };
  };

  const sectionHead = (title) => {
    const h = document.createElement("h2");
    h.textContent = title;
    h.style.cssText = "font:600 1rem system-ui;margin:16px 0 8px;";
    root.appendChild(h);
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;";
    root.appendChild(grid);
    return grid;
  };

  const itemSection = (title, ids) => {
    const grid = sectionHead(title);
    for (const id of ids) {
      const { card, row } = cardFor(itemName(id), id);
      for (const size of [25, 96]) {
        const { ctx } = canvasAt(row, size);
        drawItem(ctx, id, size / 2, size / 2, size, { cb, detail: size > 50 ? 4 : 1 });
      }
      grid.appendChild(card);
    }
  };

  itemSection("Parts: each material, cut 0 to 3 times, plain and pressed", parts);
  itemSection("Assemblies and products used by the contracts", [...assemblies]);

  // P3: every machine on its painted floor plate, idle and working.
  const pal = palette(params.get("theme"));
  const machineGrid = sectionHead("Machines: idle (left) and working (right), facing right");
  for (const type of MACHINE_TYPES) {
    const { card, row } = cardFor(MACHINE_NAMES[type] || type, type);
    drawMachineCard(canvasAt(row, 72).ctx, type, 72, pal, "idle");
    drawMachineCard(canvasAt(row, 72).ctx, type, 72, pal, "working");
    machineGrid.appendChild(card);
  }

  const genGrid = sectionHead("Generators: solar and wind");
  for (const gen of ["solar", "wind"]) {
    const { card, row } = cardFor(gen === "solar" ? "Solar array" : "Wind turbine", gen);
    const g1 = canvasAt(row, 72).ctx;
    g1.fillStyle = pal.floor;
    g1.fillRect(0, 0, 72, 72);
    if (gen === "solar") drawSolar(g1, 0, 0, 72, pal);
    else drawWind(g1, 0, 0, 72, 0);
    genGrid.appendChild(card);
  }
}
