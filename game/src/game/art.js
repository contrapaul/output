// Item icons built from the recipe tree (Phase 2, roadmap D8).
//
// Any item id can be drawn, so contracts can ask for anything the
// operations can make. Recognition rules:
//   - a material always has the same color and pattern (data/items.json)
//   - a part's shape shows its form: whole = disc, cut once = half disc,
//     twice = quarter, three times = eighth; pressed = flattened with ridges
//   - an assembly is a dark plate holding its two items side by side
//   - a product is framed by its shell's color, with the assembly inside
//
// Two levels of detail: `detail` is how many nesting levels are drawn in
// full. On belts (detail 1) an assembly shows its children as plain shapes;
// on the order panel (detail 4) the whole tree is visible.

import { parseItem, material, cutCount, isPressed, isPart, isAssembly, materialStyle } from "./items.js";

const PLATE = "#3f4a5a";
const PLATE_EDGE = "rgba(0,0,0,0.45)";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} id      canonical item id
 * @param {number} cx      center
 * @param {number} cy
 * @param {number} size    width of the box the icon fits in
 * @param {object} [opts]  { cb: colorblind patterns, detail: levels drawn in full }
 */
export function drawItem(ctx, id, cx, cy, size, opts = {}) {
  const detail = opts.detail ?? 1;
  const n = parseItem(id);
  if (isPart(id)) return drawPart(ctx, id, cx, cy, size, opts);
  if (n.op === "join") return drawAssembly(ctx, n, cx, cy, size, detail, opts);
  if (n.op === "case") return drawProduct(ctx, n, cx, cy, size, detail, opts);
  ctx.fillStyle = "#999";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Main color of any item (for dots when zoomed far out). */
export function itemColor(id) {
  const n = parseItem(id);
  if (isPart(id)) return materialStyle(material(id)).color;
  if (n.op === "case") return materialStyle(material(n.args[1])).color;
  return PLATE;
}

function drawPart(ctx, id, cx, cy, size, opts) {
  const style = materialStyle(material(id));
  const cuts = Math.min(cutCount(id), 3);
  const pressed = isPressed(id);
  const r = size * 0.42;
  // wedge: full disc, half, quarter, eighth; it points up, flat side down
  const sweep = (Math.PI * 2) / 2 ** cuts;
  const mid = -Math.PI / 2;
  const start = mid - sweep / 2;
  // shift down so the wedge sits in the middle of the box
  const ox = cx;
  const oy = cy + (cuts === 0 ? 0 : r * [0, 0.25, 0.45, 0.55][cuts]);
  ctx.save();
  ctx.translate(ox, oy);
  if (pressed) ctx.scale(1.1, 0.62);
  const shape = new Path2D();
  if (cuts === 0) shape.arc(0, 0, r, 0, Math.PI * 2);
  else {
    shape.moveTo(0, 0);
    shape.arc(0, 0, r, start, start + sweep);
    shape.closePath();
  }
  ctx.fillStyle = style.color;
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  drawPattern(ctx, style.pattern, r, opts.cb);
  if (pressed) {
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(1, size * 0.05);
    for (const k of [-0.35, 0, 0.35]) {
      ctx.beginPath();
      ctx.moveTo(-r, k * r);
      ctx.lineTo(r, k * r);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.lineWidth = Math.max(1, size * (pressed ? 0.08 : 0.05));
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke(shape);
  ctx.restore();
}

function drawPattern(ctx, pattern, r, strong) {
  const a = strong ? 0.55 : 0.28;
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = Math.max(1, r * 0.14);
  if (pattern === "stripes") {
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * r * 0.45 - r, -r);
      ctx.lineTo(k * r * 0.45 + r, r);
      ctx.stroke();
    }
  } else if (pattern === "dots") {
    for (const [dx, dy] of [[-0.4, -0.35], [0.35, -0.3], [0, 0.1], [-0.35, 0.45], [0.4, 0.45]]) {
      ctx.beginPath();
      ctx.arc(dx * r, dy * r, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "cross") {
    for (const k of [-0.45, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(-r, k * r);
      ctx.lineTo(r, k * r);
      ctx.moveTo(k * r, -r);
      ctx.lineTo(k * r, r);
      ctx.stroke();
    }
  }
}

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** A child inside an assembly or product: full when detail allows, else a token. */
function drawChild(ctx, id, cx, cy, size, detail, opts) {
  if (detail > 0 || isPart(id)) {
    drawItem(ctx, id, cx, cy, size, { ...opts, detail: detail - 1 });
    return;
  }
  // token: plate square or framed square in the item's main color
  const s = size * 0.36;
  roundRect(ctx, cx - s, cy - s, s * 2, s * 2, s * 0.35);
  ctx.fillStyle = itemColor(id);
  ctx.fill();
  ctx.strokeStyle = PLATE_EDGE;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.stroke();
}

function drawAssembly(ctx, n, cx, cy, size, detail, opts) {
  const w = size * 0.92;
  const h = size * 0.62;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, size * 0.12);
  ctx.fillStyle = PLATE;
  ctx.fill();
  ctx.strokeStyle = PLATE_EDGE;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.stroke();
  // solder dots along the edge read as "joined"
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (const k of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.arc(cx + k * w, cy - h * 0.38, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  const cs = size * 0.46;
  drawChild(ctx, n.args[0], cx - w * 0.24, cy, cs, detail, opts);
  drawChild(ctx, n.args[1], cx + w * 0.24, cy, cs, detail, opts);
}

function drawProduct(ctx, n, cx, cy, size, detail, opts) {
  const [assembly, shell] = n.args;
  const style = materialStyle(material(shell));
  const s = size * 0.9;
  roundRect(ctx, cx - s / 2, cy - s / 2, s, s, size * 0.18);
  ctx.fillStyle = style.color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = Math.max(1, size * (isPressed(shell) ? 0.1 : 0.05));
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.translate(cx, cy);
  drawPattern(ctx, style.pattern, s / 2, opts.cb);
  ctx.restore();
  // window showing the assembly inside
  const inner = s * 0.7;
  roundRect(ctx, cx - inner / 2, cy - inner / 2, inner, inner, size * 0.1);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();
  if (detail > 0) drawItem(ctx, assembly, cx, cy, inner * 0.95, { ...opts, detail: detail - 1 });
  else drawChild(ctx, assembly, cx, cy, inner, 0, opts);
  // shell form badge: how the shell part was cut, when shown in full
  if (detail > 1 && !isAssembly(shell) && (cutCount(shell) > 0 || isPressed(shell))) {
    drawPart(ctx, shell, cx + s * 0.38, cy - s * 0.38, size * 0.28, opts);
  }
}

// ---- cached icons ----------------------------------------------------------
//
// Drawing an assembly from paths every frame is slow with hundreds of parts
// on screen. drawItemCached() draws each (item, pixel size, options) once
// into a small canvas and stamps it after that. Pixel sizes are rounded up
// to steps so zooming does not fill the cache.

const iconCache = new Map();
const CACHE_LIMIT = 600;

function bucket(px) {
  if (px <= 16) return 16;
  if (px <= 24) return 24;
  if (px <= 32) return 32;
  if (px <= 48) return 48;
  if (px <= 64) return 64;
  if (px <= 96) return 96;
  return 128;
}

/**
 * Same as drawItem, but cached. `scale` is screen pixels per world unit
 * (camera zoom x device pixel ratio), so the icon is sharp at any zoom.
 */
export function drawItemCached(ctx, id, cx, cy, size, scale, opts = {}) {
  if (typeof document === "undefined") return drawItem(ctx, id, cx, cy, size, opts);
  const px = bucket(Math.ceil(size * scale));
  const key = `${id}|${px}|${opts.cb ? 1 : 0}|${opts.detail ?? 1}`;
  let icon = iconCache.get(key);
  if (!icon) {
    if (iconCache.size >= CACHE_LIMIT) iconCache.delete(iconCache.keys().next().value);
    icon = document.createElement("canvas");
    icon.width = icon.height = px;
    drawItem(icon.getContext("2d"), id, px / 2, px / 2, px, opts);
    iconCache.set(key, icon);
  }
  ctx.drawImage(icon, cx - size / 2, cy - size / 2, size, size);
}
