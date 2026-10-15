// Canvas renderer (M3).
// Grid, ground + overhead belts, machines, hoppers, dock, items on polyline
// lines, full-state markers, jam highlight, ghost preview, selection.
//
// Settings honored (from game.settings):
//   motion      false -> no pulsing highlights, item positions snap to half tiles
//   colorblind  true  -> stronger item patterns, "!" text marker on full machines

import { CONFIG, themeColors } from "../core/config.js";
import { DIRS } from "../core/grid.js";
import { drawItem } from "./art.js";
import { MACHINE_NAMES } from "./systems/process.js";

export class Renderer {
  constructor(canvas, camera, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = camera;
    this.game = game;
    this.theme = "light";
    this.ghost = null;
    this.selected = null;
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

  setGhost(t, x, y, r, z, valid) {
    this.ghost = t ? { t, x, y, r, z: z || 0, valid } : null;
  }

  setSelected(key) {
    this.selected = key;
  }

  render() {
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
    this._drawFullMarkers(ctx, tile);
    this._drawJam(ctx, tile);

    if (this.selected) this._drawSelection(ctx, colors, tile);
    if (this.ghost) this._drawGhost(ctx, colors, tile);

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

  _machineBase(ctx, px, py, tile, color, busy) {
    const base = px + tile * 0.1;
    const size = tile * 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(base, base, size, size);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(base, base, size, size);
    return { cx: px + tile / 2, cy: py + tile / 2 };
  }

  _drawMachines(ctx, colors, tile) {
    const machines = this.game.machines;
    if (!machines) return;
    for (const m of machines.values()) {
      const px = m.x * tile;
      const py = m.y * tile;
      const busy = m.isBusy;
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
        "#888",
        busy
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

      // output direction arrow
      if (m.handler && !(m.handler.buffer)) {
        const d = DIRS[m.r];
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        const ax = cx + d.dx * tile * 0.38;
        const ay = cy + d.dy * tile * 0.38;
        const s = tile * 0.09;
        ctx.moveTo(ax + d.dx * s, ay + d.dy * s);
        ctx.lineTo(ax - d.dx * s - d.dy * s * 0.8, ay - d.dy * s + d.dx * s * 0.8);
        ctx.lineTo(ax - d.dx * s + d.dy * s * 0.8, ay - d.dy * s - d.dx * s * 0.8);
        ctx.closePath();
        ctx.fill();
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
        let d = it.d;
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

  _drawFullMarkers(ctx, tile) {
    const machines = this.game.machines;
    if (!machines) return;
    for (const m of machines.values()) {
      if (!m.isFull) continue;
      const cx = m.x * tile + tile / 2;
      const cy = m.y * tile - tile * 0.18;
      // "!" badge: shape + text, colorblind safe
      ctx.fillStyle = "#f2c14e";
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#222";
      ctx.font = `bold ${tile * 0.28}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy + 1);
      // glow ring (pulses if motion allowed)
      const a = this.settings.motion ? 0.45 + 0.3 * Math.sin(this._t * 0.15) : 0.6;
      ctx.strokeStyle = `rgba(242,193,78,${a.toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(m.x * tile + 1, m.y * tile + 1, tile - 2, tile - 2);
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

  _drawGhost(ctx, colors, tile) {
    const g = this.ghost;
    const base = g.t === "belt" || g.t === "belt_high" ? colors.ghostOk : g.valid ? "rgba(138,138,154,0.5)" : colors.ghostBad;
    const bad = !g.valid ? colors.ghostBad : base;
    ctx.fillStyle = bad;
    if (g.z === 1) {
      ctx.fillRect(g.x * tile + 2, g.y * tile + 2, tile - 4, tile - 4);
    } else {
      ctx.fillRect(g.x * tile, g.y * tile, tile, tile);
    }
    if (g.t === "belt" || g.t === "belt_high") {
      const cx = g.x * tile + tile / 2;
      const cy = g.y * tile + tile / 2;
      const s = tile * 0.18;
      const dir = DIRS[g.r];
      ctx.strokeStyle = g.valid ? "#fff" : bad;
      ctx.lineWidth = 3;
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
    } else if (g.valid) {
      // generic machine ghost: label the machine name so the palette and
      // the field always agree
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = `bold ${tile * 0.22}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(MACHINE_NAMES[g.t] || g.t, g.x * tile + tile / 2, g.y * tile + tile / 2);
    }
  }
}
