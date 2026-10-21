// Canvas renderer.
// Grid, ground + overhead belts, machines (with ports and state), hoppers,
// dock, items on polyline lines, jam highlight, ghost path preview, delete
// box, wrong-side markers, selection.
//
// Phase 1:
//   - items are drawn between ticks (render alpha) for smooth motion
//   - machine state at a glance: working = gentle pulse, waiting = dim,
//     blocked = amber dashed outline (shape cue, not color only)
//   - ports: input notches and output arrows on each machine edge
//   - the ghost is a whole planned path (build.js plan), invalid tiles red
//
// Settings honored (from game.settings):
//   motion      false -> no pulsing, item positions snap to half tiles
//   colorblind  true  -> stronger item patterns, "!" on blocked machines

import { CONFIG, themeColors } from "../core/config.js";
import { DIRS } from "../core/grid.js";
import { drawItem } from "./art.js";
import { MACHINE_NAMES, PORTS } from "./systems/process.js";

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
    return this.game.world || this.game;
  }

  get settings() {
    return this.game.settings || { motion: true, colorblind: false };
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
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

  render(alpha = 1) {
    this.alpha = alpha;
    const ctx = this.ctx;
    const cam = this.camera;
    const colors = themeColors(this.theme);
    const tile = CONFIG.TILE;
    const zone = this.world.zone;

    this._t += 1;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    this._drawGrid(ctx, colors, zone, tile);
    this._drawBelts(ctx, colors, tile, 0);
    this._drawMachines(ctx, colors, tile);
    this._drawHoppers(ctx, tile);
    this._drawDock(ctx, tile);
    this._drawItems(ctx, tile, 0);
    this._drawBelts(ctx, colors, tile, 1);
    this._drawItems(ctx, tile, 1);
    this._drawWrongSides(ctx, tile);
    this._drawJam(ctx, tile);

    if (this.selected) this._drawSelection(ctx, colors, tile);
    if (this.ghostPlan) this._drawGhostPlan(ctx, colors, tile);
    if (this.area) this._drawArea(ctx, tile);

    ctx.restore();
  }

  _drawGrid(ctx, colors, zone, tile) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    for (let x = 0; x <= zone.w; x++) {
      ctx.moveTo(x * tile, 0);
      ctx.lineTo(x * tile, zone.h * tile);
    }
    for (let y = 0; y <= zone.h; y++) {
      ctx.moveTo(0, y * tile);
      ctx.lineTo(zone.w * tile, y * tile);
    }
    ctx.stroke();
  }

  _drawBelts(ctx, colors, tile, z) {
    for (const m of this.world.machines.values()) {
      if (z === 0 ? m.t !== "belt" : m.t !== "belt_high") continue;
      const px = m.x * tile;
      const py = m.y * tile;
      if (z === 1) {
        // overhead: raised look, distinct hue
        ctx.fillStyle = this.theme === "dark" ? "#3d4a63" : "#9db4d8";
        ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
        ctx.strokeStyle = this.theme === "dark" ? "#7d97c4" : "#5f7ea8";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, tile - 4, tile - 4);
      } else {
        ctx.fillStyle = colors.belt;
        ctx.fillRect(px, py, tile, tile);
        ctx.strokeStyle = colors.beltLine;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
      }
      // direction chevron
      const cx = px + tile / 2;
      const cy = py + tile / 2;
      const s = tile * 0.18;
      const dir = DIRS[m.r];
      ctx.strokeStyle = z === 1 ? "#ffffff" : colors.beltLine;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      const tipX = cx + dir.dx * s;
      const tipY = cy + dir.dy * s;
      const backX = cx - dir.dx * s * 0.9;
      const backY = cy - dir.dy * s * 0.9;
      const perpX = -dir.dy * s * 0.8;
      const perpY = dir.dx * s * 0.8;
      ctx.beginPath();
      ctx.moveTo(backX + perpX, backY + perpY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(backX - perpX, backY - perpY);
      ctx.stroke();
    }
  }

  _machineBase(ctx, px, py, tile, color) {
    const bx = px + tile * 0.1;
    const by = py + tile * 0.1;
    const size = tile * 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, size, size);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, size, size);
    return { cx: px + tile / 2, cy: py + tile / 2 };
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

  _drawMachines(ctx, colors, tile) {
    const machines = this.game.machines;
    if (!machines) return;
    for (const m of machines.values()) {
      const px = m.x * tile;
      const py = m.y * tile;
      const state = this.game.machineState ? this.game.machineState(m) : "waiting";
      const busy = state === "working";
      ctx.save();
      if (state === "waiting") ctx.globalAlpha = 0.6;
      if (busy && this.settings.motion) {
        // gentle pulse: the machine breathes while it works
        const k = 1 + 0.035 * Math.sin(this._t * 0.25 + m.x + m.y);
        ctx.translate(px + tile / 2, py + tile / 2);
        ctx.scale(k, k);
        ctx.translate(-(px + tile / 2), -(py + tile / 2));
      }
      const { cx, cy } = this._machineBase(
        ctx, px, py, tile,
        m.type === "saw" ? (busy ? "#d4a04a" : "#8a8a9a") :
        m.type === "press" ? (busy ? "#c89040" : "#a08050") :
        m.type === "solder" ? (busy ? "#d08040" : "#906050") :
        m.type === "mounter" ? (busy ? "#6090c0" : "#506070") :
        m.type === "encap" ? (busy ? "#c0a050" : "#807040") :
        m.type === "merger" ? (busy ? "#80a080" : "#607060") :
        m.type === "splitter" ? (busy ? "#a080c0" : "#70607a") :
        m.type === "bin" ? (busy ? "#9090a0" : "#707080") :
        m.type === "recycler" ? (busy ? "#50a090" : "#4a6a62") :
        "#888"
      );

      const stroke = (pts) => {
        ctx.strokeStyle = "#ddd";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      };

      switch (m.type) {
        case "saw":
          ctx.fillStyle = "#c0c0c8";
          ctx.beginPath();
          ctx.arc(cx, cy, tile * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        case "press":
          ctx.fillStyle = "#888";
          ctx.fillRect(cx - tile * 0.08, py + tile * 0.15, tile * 0.16, tile * 0.3);
          ctx.fillRect(cx - tile * 0.2, py + tile * 0.45, tile * 0.4, tile * 0.12);
          break;
        case "solder":
          stroke([[cx - tile * 0.1, cy + tile * 0.15], [cx + tile * 0.1, cy - tile * 0.1]]);
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillRect(px + tile * 0.15, py + tile * 0.6, tile * 0.25, tile * 0.2);
          ctx.fillRect(px + tile * 0.6, py + tile * 0.6, tile * 0.25, tile * 0.2);
          break;
        case "mounter":
          stroke([[cx, py + tile * 0.2], [cx, cy], [cx + tile * 0.15, cy]]);
          break;
        case "encap":
          ctx.strokeStyle = "#bbb";
          ctx.lineWidth = 2;
          ctx.strokeRect(cx - tile * 0.2, cy - tile * 0.1, tile * 0.4, tile * 0.25);
          break;
        case "merger":
          stroke([[cx - tile * 0.15, py + tile * 0.2], [cx, cy]]);
          stroke([[cx + tile * 0.15, py + tile * 0.2], [cx, cy]]);
          stroke([[cx, cy], [cx, py + tile * 0.8]]);
          break;
        case "splitter":
          // Y split: one in (bottom), two out (top-left, top-right)
          stroke([[cx, py + tile * 0.8], [cx, cy]]);
          stroke([[cx, cy], [cx - tile * 0.2, py + tile * 0.2]]);
          stroke([[cx, cy], [cx + tile * 0.2, py + tile * 0.2]]);
          break;
        case "bin":
          ctx.strokeStyle = "#aaa";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx - tile * 0.15, py + tile * 0.15, tile * 0.3, tile * 0.1);
          // fill level
          const cap = this.game.binCapacity ? this.game.binCapacity() : 10;
          const frac = Math.min(m.buffer.length / cap, 1);
          if (frac > 0) {
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            const fh = tile * 0.5 * frac;
            ctx.fillRect(px + tile * 0.15, py + tile * 0.8 - fh, tile * 0.7, fh);
          }
          break;
        case "recycler":
          // X mark
          stroke([[cx - tile * 0.15, cy - tile * 0.15], [cx + tile * 0.15, cy + tile * 0.15]]);
          stroke([[cx - tile * 0.15, cy + tile * 0.15], [cx + tile * 0.15, cy - tile * 0.15]]);
          break;
      }

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

  _drawItems(ctx, tile, z) {
    const flowLines = this.game.flowLines;
    if (!flowLines) return;
    const cb = this.settings.colorblind;
    const motion = this.settings.motion;
    for (const fl of flowLines.values()) {
      if (!fl.line.tiles.length) continue;
      for (const it of fl.items) {
        let d = it.pd === undefined ? it.d : it.pd + (it.d - it.pd) * this.alpha;
        if (!motion) d = Math.round(d * 2) / 2; // snap to half tiles
        const p = fl.posAt(d, tile);
        if ((p.z || 0) !== z) continue;
        // overhead items get a small shadow offset for readability
        if (z === 1) {
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.beginPath();
          ctx.ellipse(p.x + 2, p.y + 3, tile * 0.3, tile * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        drawItem(ctx, it.item, p.x, p.y, tile, { cb });
      }
    }
  }

  _drawHoppers(ctx, tile) {
    const hoppers = this.game.hoppers;
    if (!hoppers) return;
    for (const h of hoppers) {
      const px = h.x * tile;
      const py = h.y * tile;
      const cx = px + tile / 2;
      const cy = py + tile / 2;
      ctx.fillStyle = "#7a8a6a";
      ctx.beginPath();
      ctx.moveTo(px + tile * 0.2, py + tile * 0.1);
      ctx.lineTo(px + tile * 0.8, py + tile * 0.1);
      ctx.lineTo(px + tile * 0.65, py + tile * 0.9);
      ctx.lineTo(px + tile * 0.35, py + tile * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawItem(ctx, h.item, cx, cy, tile * 0.6, { cb: this.settings.colorblind });
      const d = DIRS[h.dir];
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      const ax = cx + d.dx * tile * 0.38;
      const ay = cy + d.dy * tile * 0.38;
      const s = tile * 0.08;
      ctx.moveTo(ax + d.dx * s, ay + d.dy * s);
      ctx.lineTo(ax - d.dx * s - d.dy * s * 0.7, ay - d.dy * s + d.dx * s * 0.7);
      ctx.lineTo(ax - d.dx * s + d.dy * s * 0.7, ay - d.dy * s - d.dx * s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawDock(ctx, tile) {
    const dock = this.game.dock;
    const pos = this.game.dockPos;
    if (!dock || !pos) return;
    const px = pos.x * tile;
    const py = pos.y * tile;
    const cx = px + tile / 2;
    const cy = py + tile / 2;

    const glow = dock.rejectFlash > 0 ? "rgba(200,80,60,0.4)" :
                 dock.complete ? "rgba(80,180,100,0.4)" : "rgba(60,100,160,0.3)";
    ctx.fillStyle = glow;
    ctx.fillRect(px - 2, py - 2, tile + 4, tile + 4);
    ctx.fillStyle = dock.complete ? "#5a9e6c" : "#4a6a8a";
    ctx.fillRect(px, py, tile, tile);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, tile, tile);

    drawItem(ctx, dock.target, cx, cy - tile * 0.12, tile * 0.62, { cb: this.settings.colorblind });

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${tile * 0.25}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${dock.accepted}/${dock.amount}`, cx, cy + tile * 0.32);

    // state glyph (never color-only)
    ctx.font = `bold ${tile * 0.3}px system-ui`;
    if (dock.complete) {
      ctx.fillText("OK", cx, py - tile * 0.25);
    } else if (dock.rejectFlash > 0) {
      ctx.fillStyle = "#ffd9d4";
      ctx.fillText("NO", cx, py - tile * 0.25);
    }
  }

  /** A red bar where a belt ends against a machine side with no input. */
  _drawWrongSides(ctx, tile) {
    if (!this.game.wrongSideEnds) return;
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

  _drawJam(ctx, tile) {
    const jam = this.game.jam;
    if (!jam) return;
    const parts = jam.key.split(",").map(Number);
    const [x, y] = parts;
    const a = this.settings.motion ? 0.5 + 0.4 * Math.sin(this._t * 0.2) : 0.8;
    ctx.strokeStyle = `rgba(90,140,220,${a.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(x * tile - 2, y * tile - 2, tile + 4, tile + 4);
    ctx.strokeStyle = `rgba(90,140,220,${(a * 0.7).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * tile - 7, y * tile - 7, tile + 14, tile + 14);
  }

  _drawSelection(ctx, colors, tile) {
    const p = this.selected.split(",").map(Number);
    const [x, y] = p;
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
    // mark what will go
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
