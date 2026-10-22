// Canvas renderer.
//
// Draw order: land (the plot, darker outside it), grid, ground belts,
// machines, hoppers, dock, items, overhead belts and their items, markers,
// selection, ghost path, delete box.
//
// Phase 1: smooth motion (render alpha), machine states (working pulse,
// waiting dim, blocked amber dashed outline), ports, ghost path plans.
// Phase 2: the plot has an origin and grows; only visible tiles are drawn;
// when zoomed far out belts become plain strips and items become colored
// dots; new machines (cutter, press, combiner, encaser, depots); 2x2 dock;
// items drawn from their recipe tree (art.js).
//
// Settings honored (from game.settings):
//   motion      false -> no pulsing, item positions snap to half tiles
//   colorblind  true  -> stronger item patterns, "!" on blocked machines

import { CONFIG, themeColors } from "../core/config.js";
import { linePath } from "./beltShape.js";

/** Direction index (0..3) of a stroke segment between two path points. */
function dirOfPoints(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  if (dx > 0) return 0;
  if (dy > 0) return 1;
  if (dx < 0) return 2;
  return 3;
}
import { DIRS } from "../core/grid.js";
import { drawItem, drawItemCached, itemColor } from "./art.js";
import { MACHINE_NAMES, PORTS } from "./systems/process.js";

const FAR = 22; // screen px per tile below which the simple drawing is used

const MACHINE_COLORS = {
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

export class Renderer {
  constructor(canvas, camera, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = camera;
    this.game = game;
    this.theme = "light";
    this.ghostPlan = null;
    this.area = null;
    this.selected = null;
    this.alpha = 1;
    this._t = 0; // render clock for pulses
    this._resize();
    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(canvas);
  }

  get world() {
    return this.game.world;
  }

  get settings() {
    return this.game.settings || { motion: true, colorblind: false };
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.dpr = dpr;
  }

  /** Planned tiles from build.js planPlacement(), or null. */
  setGhostPlan(plan) {
    this.ghostPlan = plan && plan.length ? plan : null;
  }

  /** Right-drag delete box { x0, y0, x1, y1 }, or null. */
  setArea(a) {
    this.area = a ? { ...a } : null;
  }

  setSelected(key) {
    this.selected = key;
  }

  _visible(x, y) {
    const v = this.view;
    return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;
  }

  render(alpha = 1) {
    this.alpha = alpha;
    const ctx = this.ctx;
    const cam = this.camera;
    const colors = themeColors(this.theme);
    const tile = CONFIG.TILE;
    this.view = cam.visibleTiles();
    this.far = tile * cam.zoom < FAR;
    this.scale = cam.zoom * this.dpr;
    this._t += 1;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = colors.outside;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    this._drawLand(ctx, colors, tile);
    this._drawBelts(ctx, colors, tile, 0);
    this._drawMachines(ctx, tile);
    this._drawGenerators(ctx, tile);
    this._drawHoppers(ctx, tile);
    this._drawDock(ctx, tile);
    this._drawItems(ctx, tile, 0);
    this._drawBelts(ctx, colors, tile, 1);
    this._drawItems(ctx, tile, 1);
    this._drawWrongSides(ctx, tile);
    this._drawRefusals(ctx, tile);
    this._drawJam(ctx, tile);
    if (this.selected) this._drawSelection(ctx, colors, tile);
    if (this.ghostPlan) this._drawGhostPlan(ctx, colors, tile);
    if (this.area) this._drawArea(ctx, tile);

    ctx.restore();
  }

  _drawLand(ctx, colors, tile) {
    const z = this.world.zone;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(z.x * tile, z.y * tile, z.w * tile, z.h * tile);
    if (this.far) return; // no grid lines when zoomed far out
    const v = this.view;
    const x0 = Math.max(z.x, v.x0);
    const x1 = Math.min(z.x + z.w, v.x1);
    const y0 = Math.max(z.y, v.y0);
    const y1 = Math.min(z.y + z.h, v.y1);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1 / this.camera.zoom;
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
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.strokeRect(z.x * tile, z.y * tile, z.w * tile, z.h * tile);
  }

  _chevron(ctx, cx, cy, r, s, color, width) {
    const dir = DIRS[r];
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    const backX = cx - dir.dx * s * 0.9;
    const backY = cy - dir.dy * s * 0.9;
    const perpX = -dir.dy * s * 0.8;
    const perpY = dir.dx * s * 0.8;
    ctx.beginPath();
    ctx.moveTo(backX + perpX, backY + perpY);
    ctx.lineTo(cx + dir.dx * s, cy + dir.dy * s);
    ctx.lineTo(backX - perpX, backY - perpY);
    ctx.stroke();
  }

  /**
   * Belts as one snake strip per line (P2): a dark casing, the belt itself
   * at ~70% of the tile (the grid shows beside it), and chevrons that march
   * with the belt so it reads as moving. Corners curve because the whole
   * run is one stroked path with round joins.
   */
  _drawBelts(ctx, colors, tile, z) {
    const motion = this.settings.motion;
    // march in step with the items: one chevron spacing per belt tile,
    // sliding one spacing per second of belt motion
    const march = motion ? ((this._t / 60) % 1) : 0;
    for (const line of this.world.lines.allLines()) {
      if (!line.tiles.length || (line.tiles[0].z || 0) !== z) continue;
      if (!line.tiles.some((t) => this._visible(t.x, t.y))) continue;
      const pts = linePath(line.tiles, tile);
      if (pts.length < 2) continue;
      const wBelt = tile * (z === 1 ? 0.62 : 0.7);
      const casing = z === 1
        ? (this.theme === "dark" ? "#2c3648" : "#6f86a8")
        : colors.beltLine;
      const surface = z === 1
        ? (this.theme === "dark" ? "#3d4a63" : "#9db4d8")
        : colors.belt;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = casing;
      ctx.lineWidth = wBelt + Math.max(2, tile * 0.07);
      ctx.stroke();
      ctx.strokeStyle = surface;
      ctx.lineWidth = wBelt;
      ctx.stroke();
      if (this.far) continue;
      // edge rails on the belt
      ctx.strokeStyle = z === 1
        ? (this.theme === "dark" ? "#7d97c4" : "#5f7ea8")
        : casing;
      ctx.lineWidth = Math.max(1.5, tile * 0.045);
      ctx.stroke();
      // marching chevrons along the run
      const chev = tile * 0.16;
      const stepLen = tile * 0.9;
      const off = (motion ? march * stepLen : stepLen / 2);
      let acc = off;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        while (acc <= segLen) {
          const f = acc / segLen;
          const cx = a.x + (b.x - a.x) * f;
          const cy = a.y + (b.y - a.y) * f;
          const dr = dirOfPoints(a, b);
          this._chevron(ctx, cx, cy, dr, chev, z === 1 ? "#ffffff" : colors.beltLine, 2.5);
          acc += stepLen;
        }
        acc -= segLen;
      }
    }
  }

  /**
   * Ports on the machine edge. Inputs: a light notch pointing in.
   * Outputs: a white arrow pointing out. Local sides follow rotation.
   */
  _drawPorts(ctx, type, r, px, py, tile) {
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

  _drawMachines(ctx, tile) {
    for (const m of this.game.machines.values()) {
      if (!this._visible(m.x, m.y)) continue;
      const px = m.x * tile;
      const py = m.y * tile;
      const [idle, busyColor] = MACHINE_COLORS[m.type] || ["#888", "#999"];
      const state = this.game.machineState(m);
      const busy = state === "working";
      if (this.far) {
        ctx.fillStyle = state === "blocked" ? "#e0a030" : busy ? busyColor : idle;
        ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
        continue;
      }
      ctx.save();
      if (state === "waiting") ctx.globalAlpha = 0.6;
      if (busy && this.settings.motion) {
        const k = 1 + 0.035 * Math.sin(this._t * 0.25 + m.x + m.y);
        ctx.translate(px + tile / 2, py + tile / 2);
        ctx.scale(k, k);
        ctx.translate(-(px + tile / 2), -(py + tile / 2));
      }
      const bx = px + tile * 0.1;
      const by = py + tile * 0.1;
      const size = tile * 0.8;
      ctx.fillStyle = busy ? busyColor : idle;
      ctx.fillRect(bx, by, size, size);
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, size, size);
      this._drawGlyph(ctx, m, px, py, tile);
      this._drawPorts(ctx, m.type, m.r, px, py, tile);
      ctx.restore();

      if (state === "blocked") {
        ctx.save();
        ctx.strokeStyle = "#e0a030";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(px + 2, py + 2, tile - 4, tile - 4);
        ctx.restore();
        if (this.settings.colorblind) {
          ctx.fillStyle = "#e0a030";
          ctx.font = `bold ${tile * 0.28}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("!", px + tile - 8, py + 10);
        }
      }
    }
  }

  /** The symbol on each machine, drawn in the machine's own frame (facing r). */
  _drawGlyph(ctx, m, px, py, tile) {
    const cx = px + tile / 2;
    const cy = py + tile / 2;
    const u = tile / 40; // drawn on a 40 px tile, scaled
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((m.r * Math.PI) / 2);
    ctx.strokeStyle = "#eee";
    ctx.fillStyle = "#eee";
    ctx.lineWidth = 2 * u;
    ctx.lineCap = "round";
    const line = (pts) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u)));
      ctx.stroke();
    };
    switch (m.type) {
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
      case "depot_s":
      case "depot_m":
      case "depot_l":
        ctx.restore();
        this._drawDepot(ctx, m, px, py, tile);
        return;
    }
    ctx.restore();
  }

  _drawGenerators(ctx, tile) {
    for (const m of this.world.machines.values()) {
      if ((m.t !== "solar" && m.t !== "wind") || !this._visible(m.x, m.y)) continue;
      const px = m.x * tile;
      const py = m.y * tile;
      if (m.t === "solar") {
        ctx.fillStyle = "#2f4a78";
        ctx.fillRect(px + tile * 0.08, py + tile * 0.08, tile * 0.84, tile * 0.84);
        if (this.far) continue;
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
        continue;
      }
      // wind turbine: base, mast and turning blades
      const cx = px + tile / 2;
      const cy = py + tile * 0.42;
      ctx.fillStyle = "#cfd6dd";
      if (this.far) {
        ctx.fillRect(px + 4, py + 4, tile - 8, tile - 8);
        continue;
      }
      ctx.beginPath();
      ctx.arc(cx, py + tile * 0.85, tile * 0.14, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "#9aa4ad";
      ctx.lineWidth = tile * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx, py + tile * 0.85);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      const spin = this.settings.motion ? this._t * 0.08 : 0;
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
  }

  _drawDepot(ctx, m, px, py, tile) {
    const cap = this.game.capacityOf(m);
    const n = m.buffer.length + m.outputs.length;
    const frac = Math.min(n / cap, 1);
    const inset = { depot_s: 0.22, depot_m: 0.16, depot_l: 0.12 }[m.type];
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + tile * inset, py + tile * inset, tile * (1 - inset * 2), tile * (1 - inset * 2));
    if (frac > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      const fh = tile * (1 - inset * 2) * frac;
      ctx.fillRect(px + tile * inset, py + tile * (1 - inset) - fh, tile * (1 - inset * 2), fh);
    }
    if (m.stored) drawItemCached(ctx, m.stored, px + tile / 2, py + tile * 0.45, tile * 0.4, this.scale, { cb: this.settings.colorblind, detail: 0 });
    if (n) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${tile * 0.2}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), px + tile / 2, py + tile * 0.78);
    }
  }

  _drawItems(ctx, tile, z) {
    const cb = this.settings.colorblind;
    const motion = this.settings.motion;
    const size = tile * 0.62;
    for (const fl of this.game.flowLines.values()) {
      if (!fl.line.tiles.length) continue;
      for (const it of fl.items) {
        let d = it.pd === undefined ? it.d : it.pd + (it.d - it.pd) * this.alpha;
        if (!motion) d = Math.round(d * 2) / 2;
        const p = fl.posAt(d, tile);
        if ((p.z || 0) !== z) continue;
        if (!this._visible(Math.floor(p.x / tile), Math.floor(p.y / tile))) continue;
        if (this.far) {
          ctx.fillStyle = itemColor(it.item);
          ctx.fillRect(p.x - tile * 0.22, p.y - tile * 0.22, tile * 0.44, tile * 0.44);
          continue;
        }
        if (z === 1) {
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.beginPath();
          ctx.ellipse(p.x + 2, p.y + 3, tile * 0.3, tile * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        drawItemCached(ctx, it.item, p.x, p.y, size, this.scale, { cb, detail: 1 });
      }
    }
  }

  _drawHoppers(ctx, tile) {
    for (const h of this.game.hoppers) {
      if (!this._visible(h.x, h.y)) continue;
      const px = h.x * tile;
      const py = h.y * tile;
      const cx = px + tile / 2;
      const cy = py + tile / 2;
      ctx.fillStyle = "#7a8a6a";
      if (this.far) {
        ctx.fillRect(px, py, tile, tile);
        continue;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((h.dir + 3) * Math.PI) / 2); // funnel narrows toward the output side
      ctx.beginPath();
      ctx.moveTo(-tile * 0.32, -tile * 0.4);
      ctx.lineTo(tile * 0.32, -tile * 0.4);
      ctx.lineTo(tile * 0.17, tile * 0.4);
      ctx.lineTo(-tile * 0.17, tile * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      drawItemCached(ctx, h.item, cx, cy, tile * 0.5, this.scale, { cb: this.settings.colorblind });
      this._drawPorts(ctx, "hopper", h.dir, px, py, tile);
    }
  }

  _drawDock(ctx, tile) {
    const dock = this.game.dock;
    if (!dock) return;
    const px = dock.x * tile;
    const py = dock.y * tile;
    const s = tile * 2;
    const main = dock.main;
    const done = !main;
    ctx.fillStyle = dock.rejectFlash > 0 ? "rgba(200,80,60,0.35)" : "rgba(60,100,160,0.3)";
    ctx.fillRect(px - 3, py - 3, s + 6, s + 6);
    ctx.fillStyle = done ? "#5a7a6c" : "#4a6a8a";
    ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, s, s);
    if (this.far) return;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (main) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(px + s * 0.18, py + s * 0.1, s * 0.64, s * 0.55);
      drawItem(ctx, main.item, px + s / 2, py + s * 0.375, s * 0.5, { cb: this.settings.colorblind, detail: 2 });
      // progress bar
      const bw = s * 0.76;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(px + s * 0.12, py + s * 0.74, bw, s * 0.08);
      const frac = main.rate ? main.held / main.rate.seconds : main.accepted / main.amount;
      ctx.fillStyle = "#7fd39a";
      ctx.fillRect(px + s * 0.12, py + s * 0.74, bw * Math.min(frac, 1), s * 0.08);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${tile * 0.28}px system-ui`;
      const label = main.rate ? `${dock.ratePerMinute(main)}/${main.rate.perMinute} a min` : `${main.accepted}/${main.amount}`;
      ctx.fillText(label, px + s / 2, py + s * 0.9);
    } else {
      ctx.font = `bold ${tile * 0.3}px system-ui`;
      ctx.fillText("Dock", px + s / 2, py + s / 2);
    }
    // side order slots: small icons along the top edge
    dock.slots.slice(1).forEach((slot, i) => {
      if (!slot) return;
      const sx = px + s * (0.25 + i * 0.5);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(sx - tile * 0.25, py - tile * 0.55, tile * 0.5, tile * 0.5);
      drawItem(ctx, slot.item, sx, py - tile * 0.3, tile * 0.42, { cb: this.settings.colorblind });
    });
  }

  /** A red X where a belt ends against a machine side with no input. */  _drawWrongSides(ctx, tile) {
    for (const w of this.game.wrongSideEnds()) {
      const d = DIRS[w.dir];
      const cx = (w.x + 0.5 + d.dx * 0.5) * tile;
      const cy = (w.y + 0.5 + d.dy * 0.5) * tile;
      const s = tile * 0.22;
      ctx.strokeStyle = "#d0453a";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s);
      ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx - s, cy + s);
      ctx.lineTo(cx + s, cy - s);
      ctx.stroke();
    }
  }

  /**
   * P2 (Q4): a machine that will not take a part shows a red "!" badge while
   * the refusal stands. The words go to a toast and the hover card.
   */
  _drawRefusals(ctx, tile) {
    if (this.far) return;
    for (const [key] of this.game.refusals) {
      if (key === "dock") continue;
      const [x, y] = key.split(",").map(Number);
      const r = this.game.refusalAt(x, y);
      if (!r) continue;
      const cx = (x + 0.82) * tile;
      const cy = (y + 0.18) * tile;
      const rad = tile * 0.16;
      ctx.fillStyle = "#d0453a";
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(tile * 0.24)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy + tile * 0.01);
    }
  }

  _drawJam(ctx, tile) {
    const jam = this.game.jam;
    if (!jam) return;
    const [x, y] = jam.key.split(",").map(Number);
    const a = this.settings.motion ? 0.5 + 0.4 * Math.sin(this._t * 0.2) : 0.8;
    ctx.strokeStyle = `rgba(90,140,220,${a.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(x * tile - 2, y * tile - 2, tile + 4, tile + 4);
    ctx.strokeStyle = `rgba(90,140,220,${(a * 0.7).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * tile - 7, y * tile - 7, tile + 14, tile + 14);
  }

  _drawSelection(ctx, colors, tile) {
    const [x, y] = this.selected.split(",").map(Number);
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 3;
    ctx.strokeRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
  }

  _drawGhostPlan(ctx, colors, tile) {
    for (const g of this.ghostPlan) {
      const px = g.x * tile;
      const py = g.y * tile;
      const inset = g.z === 1 ? 2 : 0;
      if (g.action === "invalid") {
        ctx.fillStyle = colors.ghostBad;
        ctx.fillRect(px + inset, py + inset, tile - inset * 2, tile - inset * 2);
        continue;
      }
      if (g.action === "keep") {
        ctx.strokeStyle = colors.ghostOk;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 3, py + 3, tile - 6, tile - 6);
        continue;
      }
      const belt = g.t === "belt" || g.t === "belt_high";
      ctx.fillStyle = belt ? colors.ghostOk : "rgba(138,138,154,0.5)";
      ctx.fillRect(px + inset, py + inset, tile - inset * 2, tile - inset * 2);
      if (belt) {
        this._chevron(ctx, px + tile / 2, py + tile / 2, g.r, tile * 0.18, "#fff", 3);
      } else {
        this._drawPorts(ctx, g.t, g.r, px, py, tile);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.font = `bold ${tile * 0.2}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(MACHINE_NAMES[g.t] || g.t, px + tile / 2, py + tile / 2);
      }
    }
  }

  _drawArea(ctx, tile) {
    const a = this.area;
    const x0 = Math.min(a.x0, a.x1);
    const y0 = Math.min(a.y0, a.y1);
    const w = Math.abs(a.x1 - a.x0) + 1;
    const h = Math.abs(a.y1 - a.y0) + 1;
    ctx.fillStyle = "rgba(208,69,58,0.15)";
    ctx.fillRect(x0 * tile, y0 * tile, w * tile, h * tile);
    ctx.strokeStyle = "#d0453a";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x0 * tile, y0 * tile, w * tile, h * tile);
    ctx.setLineDash([]);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (this.world.stackAt(x, y).some((m) => !m.fixed)) {
          ctx.fillStyle = "rgba(208,69,58,0.35)";
          ctx.fillRect(x * tile + 4, y * tile + 4, tile - 8, tile - 8);
        }
      }
    }
  }
}
