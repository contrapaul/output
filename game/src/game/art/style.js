// Factory atmosphere (Polish pass P3, Paul's playtest 2026-10-22): the
// visual language. The plot is a painted factory floor, not open space:
// concrete plates with painted seams and a hazard-striped boundary, copper
// belts on steel, machine bodies with bolts, grilles and a status light —
// an electronics plant read (steel, copper, PCB green, safety yellow).
//
// Every colour lives here or in themeColors() (core/config.js). Canvas
// drawing only: this module is safe to import from the ?art=1 review sheet,
// which draws every machine without a game.

import { DIRS } from "../../core/grid.js";
import { PORTS } from "../systems/process.js";

/** One place for the industrial palette, both themes. */
export const PALETTE = {
  light: {
    floor: "#cfcbc0", // concrete
    floorAlt: "#c9c5ba", // second plate tone (checker)
    seam: "#b9b4a7", // painted plate seams
    hazard: "#e8b420", // safety yellow
    hazardDark: "#2a2a2a",
    beltSurface: "#b07a4a", // copper
    beltCasing: "#6e4a2a",
    beltRail: "#5b3d22",
    beltSurfaceHigh: "#9db4d8", // overhead stays clean-room steel blue
    beltCasingHigh: "#6f86a8",
    bolt: "#d9d5cc",
    boltEdge: "rgba(0,0,0,0.35)",
    lampOn: "#43c463",
    lampIdle: "#9a958a",
    lampWait: "#d8a22e",
    lampBlocked: "#d0453a",
    panel: "rgba(255,255,255,0.22)",
    vent: "rgba(0,0,0,0.28)",
  },
  dark: {
    floor: "#262930",
    floorAlt: "#22252b",
    seam: "#343841",
    hazard: "#c9971c",
    hazardDark: "#131313",
    beltSurface: "#7d5433",
    beltCasing: "#4a3324",
    beltRail: "#38260f",
    beltSurfaceHigh: "#3d4a63",
    beltCasingHigh: "#2c3648",
    bolt: "#4a4f5a",
    boltEdge: "rgba(0,0,0,0.55)",
    lampOn: "#37b355",
    lampIdle: "#5a5f6a",
    lampWait: "#c08e22",
    lampBlocked: "#c03a30",
    panel: "rgba(255,255,255,0.08)",
    vent: "rgba(0,0,0,0.45)",
  },
};

export function palette(theme) {
  return PALETTE[theme === "dark" ? "dark" : "light"];
}

/** Idle and busy body colour per machine type. */
export const MACHINE_COLORS = {
  cutter: ["#8a8a9a", "#c79a48"],
  press: ["#a08050", "#c89040"],
  combiner: ["#506070", "#6090c0"],
  encaser: ["#807040", "#c0a050"],
  merger: ["#607060", "#80a080"],
  splitter: ["#70607a", "#a080c0"],
  recycler: ["#4a6a62", "#50a090"],
  depot_s: ["#6f6a60", "#8a8478"],
  depot_m: ["#6f6a60", "#8a8478"],
  depot_l: ["#6f6a60", "#8a8478"],
};

/** Two concrete tones alternate like poured plates. */
export function plateTone(pal, x, y) {
  return (x + y) % 2 === 0 ? pal.floor : pal.floorAlt;
}

/** The light on a machine body for its state. */
export function lampColor(pal, state) {
  if (state === "working") return pal.lampOn;
  if (state === "waiting") return pal.lampWait;
  if (state === "blocked") return pal.lampBlocked;
  return pal.lampIdle;
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

/**
 * The painted floor inside the zone: checker plates, painted seams, and a
 * hazard-striped safety boundary just inside the wall. Call before belts.
 */
export function drawFactoryFloor(ctx, zone, tile, pal, view, far) {
  const x0 = Math.max(zone.x || 0, view.x0);
  const x1 = Math.min((zone.x || 0) + zone.w, view.x1);
  const y0 = Math.max(zone.y || 0, view.y0);
  const y1 = Math.min((zone.y || 0) + zone.h, view.y1);
  if (x1 < x0 || y1 < y0) return;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      ctx.fillStyle = plateTone(pal, x, y);
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }
  if (far) return;
  // painted seams on the plate joints
  ctx.strokeStyle = pal.seam;
  ctx.lineWidth = 1.5 / (tile / 40);
  ctx.beginPath();
  for (let x = x0; x <= x1; x++) {
    ctx.moveTo(x * tile, y0 * tile);
    ctx.lineTo(x * tile, y1 * tile);
  }
  for (let y = y0; y <= y1; y++) {
    ctx.moveTo(x0 * tile, y * tile);
    ctx.lineTo(x1 * tile, y * tile);
  }
  ctx.stroke();
  drawHazardBorder(ctx, zone, tile, pal);
}

/** Diagonal safety stripes along the inside edge of the zone wall. */
export function drawHazardBorder(ctx, zone, tile, pal) {
  const zx = (zone.x || 0) * tile;
  const zy = (zone.y || 0) * tile;
  const w = zone.w * tile;
  const h = zone.h * tile;
  const band = tile * 0.16;
  const edges = [
    [zx, zy, w, band],
    [zx, zy + h - band, w, band],
    [zx, zy + band, band, h - band * 2],
    [zx + w - band, zy + band, band, h - band * 2],
  ];
  ctx.save();
  for (const [ex, ey, ew, eh] of edges) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex, ey, ew, eh);
    ctx.clip();
    ctx.fillStyle = pal.hazard;
    ctx.fillRect(ex, ey, ew, eh);
    ctx.fillStyle = pal.hazardDark;
    const step = band * 1.6;
    for (let k = -eh; k < ew + eh; k += step) {
      ctx.beginPath();
      ctx.moveTo(ex + k, ey);
      ctx.lineTo(ex + k + band * 0.8, ey);
      ctx.lineTo(ex + k + band * 0.8 - eh, ey + eh);
      ctx.lineTo(ex + k - eh, ey + eh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * An industrial machine body: rounded steel panel with corner bolts, a
 * vent grille on the back and a status light on the front-right. Drawn in
 * the machine's own frame (facing r); the glyph goes on top afterwards.
 */
export function drawMachineBody(ctx, px, py, tile, pal, idleColor, busyColor, state) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;
  const size = tile * 0.82;
  const bx = cx - size / 2;
  const by = cy - size / 2;
  const busy = state === "working";
  const grad = ctx.createLinearGradient(0, by, 0, by + size);
  const base = busy ? busyColor : idleColor;
  grad.addColorStop(0, shade(base, 0.18));
  grad.addColorStop(1, shade(base, -0.14));
  ctx.fillStyle = grad;
  roundRect(ctx, bx, by, size, size, tile * 0.12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = Math.max(1, tile * 0.035);
  ctx.stroke();
  // painted panel seam
  ctx.strokeStyle = pal.panel;
  ctx.lineWidth = Math.max(1, tile * 0.02);
  ctx.beginPath();
  ctx.moveTo(bx + size * 0.12, by + size * 0.3);
  ctx.lineTo(bx + size * 0.88, by + size * 0.3);
  ctx.stroke();
  // corner bolts
  ctx.fillStyle = pal.bolt;
  ctx.strokeStyle = pal.boltEdge;
  ctx.lineWidth = 1;
  const off = size * 0.14;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * (size / 2 - off), cy + dy * (size / 2 - off), tile * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // machine-local decorations (vents, lamp) are drawn by drawMachineTrim
  // in the machine's own frame; the caller rotates by r
  return { cx, cy, size };
}

/** The symbol on each machine, in the machine's own frame (facing r). */
export function drawMachineGlyph(ctx, px, py, tile, type, r) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;
  const u = tile / 40; // drawn on a 40 px tile, scaled
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((r * Math.PI) / 2);
  ctx.strokeStyle = "#eee";
  ctx.fillStyle = "#eee";
  ctx.lineWidth = 2 * u;
  ctx.lineCap = "round";
  const line = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u)));
    ctx.stroke();
  };
  switch (type) {
    case "cutter":
      ctx.beginPath();
      ctx.arc(0, 0, 8 * u, 0, Math.PI * 2);
      ctx.fillStyle = "#d8d8e0";
      ctx.fill();
      line([[0, -8], [0, 8]]);
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      line([[0, -8], [0, 8]]);
      break;
    case "press":
      ctx.fillRect(-7 * u, -9 * u, 14 * u, 5 * u);
      line([[0, -4], [0, 2]]);
      ctx.fillRect(-9 * u, 4 * u, 18 * u, 4 * u);
      break;
    case "combiner":
      line([[-9, -8], [-2, 0]]);
      line([[-9, 8], [-2, 0]]);
      ctx.fillRect(-2 * u, -4 * u, 10 * u, 8 * u);
      break;
    case "encaser":
      ctx.strokeRect(-8 * u, -8 * u, 16 * u, 16 * u);
      ctx.fillRect(-4 * u, -4 * u, 8 * u, 8 * u);
      break;
    case "merger":
      line([[-8, -8], [0, 0]]);
      line([[-8, 8], [0, 0]]);
      line([[-9, 0], [8, 0]]);
      break;
    case "splitter":
      // a Y: in from the back, out left and right
      line([[-9, 0], [0, 0]]);
      line([[0, 0], [0, -9]]);
      line([[0, 0], [0, 9]]);
      break;
    case "recycler":
      line([[-6, -6], [6, 6]]);
      line([[-6, 6], [6, -6]]);
      break;
  }
  ctx.restore();
}

/**
 * Ports on the machine edge. Inputs: a light notch pointing in.
 * Outputs: a white arrow pointing out. Local sides follow rotation.
 */
export function drawMachinePorts(ctx, type, r, px, py, tile) {
  const ports = PORTS[type];
  if (!ports) return;
  const cx = px + tile / 2;
  const cy = py + tile / 2;
  const tri = (side, outward, fill) => {
    const d = DIRS[(r + side) % 4];
    const edge = tile * 0.4;
    const s = tile * 0.1;
    const ex = cx + d.dx * edge;
    const ey = cy + d.dy * edge;
    const sign = outward ? 1 : -1;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(ex + d.dx * s * sign, ey + d.dy * s * sign);
    ctx.lineTo(ex - d.dy * s, ey + d.dx * s);
    ctx.lineTo(ex + d.dy * s, ey - d.dx * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  if (type !== "recycler" && type !== "dock") {
    for (const side of ports.in) tri(side, false, "rgba(255,255,255,0.55)");
  }
  for (const side of ports.out) tri(side, true, "#ffffff");
}

/** Vents and status lamp, drawn in the machine's own frame (rotate by r first). */
export function drawMachineTrim(ctx, tile, pal, state, r) {
  ctx.save();
  ctx.rotate((r * Math.PI) / 2);
  const u = tile / 40;
  // vent grille on the back panel (local side 2 = up in this frame)
  ctx.strokeStyle = pal.vent;
  ctx.lineWidth = 1.6 * u;
  ctx.lineCap = "round";
  for (const k of [-4, 0, 4]) {
    ctx.beginPath();
    ctx.moveTo(k * u, -14 * u);
    ctx.lineTo(k * u, -11 * u);
    ctx.stroke();
  }
  // status light, front-right corner
  const lx = 11 * u;
  const ly = -11 * u;
  ctx.fillStyle = lampColor(pal, state);
  ctx.beginPath();
  ctx.arc(lx, ly, 2.6 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (state === "working") {
    ctx.strokeStyle = lampColor(pal, "working");
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(lx, ly, 4.2 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Solar array: framed blue panel with cell lines and corner bolts. */
export function drawSolar(ctx, px, py, tile, pal) {
  ctx.fillStyle = "#2f4a78";
  ctx.fillRect(px + tile * 0.08, py + tile * 0.08, tile * 0.84, tile * 0.84);
  ctx.strokeStyle = "rgba(200,220,255,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [0.36, 0.64]) {
    ctx.moveTo(px + tile * k, py + tile * 0.08);
    ctx.lineTo(px + tile * k, py + tile * 0.92);
    ctx.moveTo(px + tile * 0.08, py + tile * k);
    ctx.lineTo(px + tile * 0.92, py + tile * k);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.strokeRect(px + tile * 0.08, py + tile * 0.08, tile * 0.84, tile * 0.84);
  ctx.fillStyle = pal.bolt;
  for (const [dx, dy] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
    ctx.beginPath();
    ctx.arc(px + tile * dx, py + tile * dy, tile * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Wind turbine: base, mast and turning blades (spin from the caller's clock). */
export function drawWind(ctx, px, py, tile, spin) {
  const cx = px + tile / 2;
  const cy = py + tile * 0.42;
  ctx.fillStyle = "#cfd6dd";
  ctx.beginPath();
  ctx.arc(cx, py + tile * 0.85, tile * 0.14, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "#9aa4ad";
  ctx.lineWidth = tile * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx, py + tile * 0.85);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.fillStyle = "#eef2f5";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const a = spin + (k * Math.PI * 2) / 3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -tile * 0.18, tile * 0.05, tile * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#7d8790";
  ctx.beginPath();
  ctx.arc(cx, cy, tile * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** Belt colours for a layer: copper on the ground, steel overhead. */
export function beltColors(pal, z) {
  return z === 1
    ? { surface: pal.beltSurfaceHigh, casing: pal.beltCasingHigh, rail: pal.beltCasingHigh }
    : { surface: pal.beltSurface, casing: pal.beltCasing, rail: pal.beltRail };
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
