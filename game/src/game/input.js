// Input (Phase 1): mouse/touchpad + keyboard.
//
// Mouse:
//   left-drag with a tool       -> draw a path; release to build it all
//                                  (belts follow the path, machines repeat)
//   left-click, no tool         -> select a piece (machine card)
//   left-drag, no tool          -> pan the camera
//   right-click with a tool     -> put the tool away
//   right-click on a piece      -> remove it
//   right-drag                  -> remove everything in a box
//   middle-click                -> pipette: pick up that piece's tool and rotation
//   wheel                       -> zoom at cursor
//
// Keyboard:
//   1..9, 0, - (toolbar.js)     -> select toolbar tool
//   F or R                      -> rotate the ghost or the selected piece
//   Shift+F / Shift+R           -> rotate the other way
//   Q                           -> pipette at the cursor
//   Delete / Backspace          -> remove selected (overhead first, then ground)
//   Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y -> undo, redo (a whole drag is one step)
//   C                           -> center camera
//   Esc                         -> cancel tool / deselect
//   Space, H, "." (main.js)     -> pause, hint, speed
//
// Overhead (belt_high): the tool targets layer z=1. A tile may hold a ground
// belt and an overhead belt at once; Delete removes overhead first.

import { rotate } from "../core/grid.js";
import { DragPath } from "./dragpath.js";
import { planPlacement, applyPlan, piecesInArea, removePieces, isBelt } from "./build.js";
import { History } from "./history.js";
import { MACHINE_NAMES } from "./systems/process.js";

const name = (t) => MACHINE_NAMES[t] || t;

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Camera} camera
   * @param {GameRoot} game
   * @param {Renderer} renderer
   * @param {object} hooks { onToolChange(id), onStatus(msg), onSelect(m|null), onHover(tile|null, sx, sy), onChange() }
   */
  constructor(canvas, camera, game, renderer, hooks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.game = game;
    this.world = game.world;
    this.renderer = renderer;
    this.hooks = hooks;
    this.history = new History(game);
    this.activeTool = null;
    this.ghostDir = 0;
    this.hoverTile = null;
    this.selected = null; // { x, y, z } | null
    this.drag = null; // { path: DragPath } while building
    this.area = null; // { x0, y0, x1, y1, moved } while right-dragging
    this._panning = false;
    this._lastPointer = null;
    this._moved = false;
  }

  attach() {
    const c = this.canvas;
    this._hDown = (e) => this._onDown(e);
    this._hMove = (e) => this._onMove(e);
    this._hUp = (e) => this._onUp(e);
    this._hWheel = (e) => this._onWheel(e);
    this._hCtx = (e) => e.preventDefault();
    this._hLeave = () => { this.hoverTile = null; this.hooks.onHover?.(null); };
    this._hKey = (e) => this._onKey(e);
    this._hMid = (e) => { if (e.button === 1) e.preventDefault(); }; // no autoscroll
    c.addEventListener("mousedown", this._hMid);
    c.addEventListener("pointerdown", this._hDown);
    c.addEventListener("pointermove", this._hMove);
    c.addEventListener("pointerleave", this._hLeave);
    window.addEventListener("pointerup", this._hUp);
    c.addEventListener("wheel", this._hWheel, { passive: false });
    c.addEventListener("contextmenu", this._hCtx);
    window.addEventListener("keydown", this._hKey);
  }

  detach() {
    const c = this.canvas;
    c.removeEventListener("mousedown", this._hMid);
    c.removeEventListener("pointerdown", this._hDown);
    c.removeEventListener("pointermove", this._hMove);
    c.removeEventListener("pointerleave", this._hLeave);
    window.removeEventListener("pointerup", this._hUp);
    c.removeEventListener("wheel", this._hWheel);
    c.removeEventListener("contextmenu", this._hCtx);
    window.removeEventListener("keydown", this._hKey);
  }

  get ghostZ() {
    return this.activeTool === "belt_high" ? 1 : 0;
  }

  /** Called by the toolbar (and the pipette). */
  setTool(id) {
    this.activeTool = id;
    this.drag = null;
    if (id) this._deselect();
    this._refreshGhost();
    this.hooks.onToolChange?.(id);
  }

  _tileFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const t = this.camera.screenToTile(sx, sy);
    return { x: t.x, y: t.y, sx, sy };
  }

  // ---- pointer ------------------------------------------------------------

  _onDown(e) {
    const t = this._tileFromEvent(e);
    this._lastPointer = { sx: t.sx, sy: t.sy };
    this._moved = false;
    this.canvas.setPointerCapture?.(e.pointerId);

    if (e.button === 1) {
      e.preventDefault();
      this._pipette(t.x, t.y);
      return;
    }
    if (e.button === 2) {
      this.area = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, moved: false };
      return;
    }
    if (this.activeTool) {
      this.drag = { path: new DragPath(t.x, t.y, this.ghostDir) };
      this._refreshGhost();
    } else {
      this._panning = true;
    }
  }

  _onMove(e) {
    const t = this._tileFromEvent(e);
    const tileChanged = !this.hoverTile || this.hoverTile.x !== t.x || this.hoverTile.y !== t.y;
    this.hoverTile = { x: t.x, y: t.y };

    if (this._panning && this._lastPointer) {
      const dx = t.sx - this._lastPointer.sx;
      const dy = t.sy - this._lastPointer.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) this._moved = true;
      this.camera.pan(dx, dy);
      this._lastPointer = { sx: t.sx, sy: t.sy };
    }
    if (this.area) {
      if (t.x !== this.area.x1 || t.y !== this.area.y1) {
        this.area.x1 = t.x;
        this.area.y1 = t.y;
        this.area.moved = true;
      }
      this.renderer.setArea(this.area.moved ? this.area : null);
    }
    if (this.drag && tileChanged) this.drag.path.moveTo(t.x, t.y);
    if (tileChanged) this._refreshGhost();
    this.hooks.onHover?.(this.drag || this.area ? null : this.hoverTile, t.sx, t.sy);
  }

  _onUp(e) {
    this.canvas.releasePointerCapture?.(e.pointerId);
    const t = this._tileFromEvent(e);

    if (this.area && e.button === 2) {
      const a = this.area;
      this.area = null;
      this.renderer.setArea(null);
      if (a.moved) this._removeArea(a);
      else if (this.activeTool) this.setTool(null);
      else this._removeAt(t.x, t.y);
      return;
    }

    if (this.drag) {
      const path = this.drag.path;
      this.drag = null;
      this._build(path);
      this._refreshGhost();
      return;
    }

    const wasPanning = this._panning;
    this._panning = false;
    this._lastPointer = null;
    if (wasPanning && this._moved) return;
    if (e.button !== 0) return;

    const stack = this.world.stackAt(t.x, t.y);
    if (stack.length) {
      const m = stack[0]; // select the ground tile (card shows both)
      this.selected = { x: m.x, y: m.y, z: 0 };
      this.renderer.setSelected(m.x + "," + m.y);
      this.hooks.onSelect?.({ x: m.x, y: m.y });
      this._status(`${name(m.t)} selected. F rotates, Delete removes.`);
    } else {
      this._deselect();
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  // ---- keyboard -----------------------------------------------------------

  _onKey(e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); this.redo(); }
      return;
    }
    switch (k) {
      case "f":
      case "r":
        this._rotate(e.shiftKey ? 3 : 1);
        break;
      case "q":
        if (this.hoverTile) this._pipette(this.hoverTile.x, this.hoverTile.y);
        break;
      case "delete":
      case "backspace":
        this._deleteSelected();
        break;
      case "escape":
        if (this.drag) { this.drag = null; this._refreshGhost(); }
        else if (this.activeTool) this.setTool(null);
        else this._deselect();
        break;
      case "c":
        this.camera.center();
        break;
    }
  }

  // ---- actions ------------------------------------------------------------

  _toolTiles(path) {
    const tiles = path.withDirs();
    // machines all face the ghost rotation; belts follow the path
    return isBelt(this.activeTool) ? tiles : tiles.map((t) => ({ ...t, r: this.ghostDir }));
  }

  _plan() {
    if (!this.activeTool) return null;
    const path = this.drag ? this.drag.path : this.hoverTile ? new DragPath(this.hoverTile.x, this.hoverTile.y, this.ghostDir) : null;
    if (!path) return null;
    return planPlacement(this.world, this.activeTool, this._toolTiles(path), this.ghostZ, this.game);
  }

  _refreshGhost() {
    const plan = this._plan();
    this.renderer.setGhostPlan(plan);
    if (this.drag && plan) {
      const bad = plan.find((p) => p.action === "invalid");
      const n = plan.filter((p) => p.action === "place" || p.action === "replace").length;
      this._status(bad ? `${n} to build. Red tile: ${bad.reason}.` : `${n} to build. Release to place.`);
    }
  }

  _build(path) {
    const tiles = this._toolTiles(path);
    const plan = planPlacement(this.world, this.activeTool, tiles, this.ghostZ, this.game);
    const ops = applyPlan(this.game, plan);
    this.history.push(ops);
    // the next belt starts facing the way this drag ended
    if (isBelt(this.activeTool) && tiles.length > 1) this.ghostDir = tiles[tiles.length - 1].r;
    const bad = plan.find((p) => p.action === "invalid");
    if (ops.length) this._changed();
    if (bad && !ops.length) this._status(`Cannot build here: ${bad.reason}.`);
    else if (bad) this._status(`Built ${ops.length}. Some tiles were skipped: ${bad.reason}.`);
    else if (ops.length) this._status(`Built ${ops.length} ${ops.length === 1 ? "piece" : "pieces"}. Ctrl+Z to undo.`);
  }

  _removeAt(x, y) {
    const pieces = this.world.stackAt(x, y).filter((m) => !m.fixed).reverse(); // overhead first
    const top = pieces.slice(0, 1);
    const ops = removePieces(this.game, top);
    this.history.push(ops);
    if (ops.length) {
      this._status(`Removed ${name(ops[0].t)}. Ctrl+Z to undo.`);
      if (this.selected && this.selected.x === x && this.selected.y === y) this._deselect();
      this._changed();
    }
    this._refreshGhost();
  }

  _removeArea(a) {
    const ops = removePieces(this.game, piecesInArea(this.world, a.x0, a.y0, a.x1, a.y1));
    this.history.push(ops);
    this._deselect();
    if (ops.length) {
      this._status(`Removed ${ops.length} ${ops.length === 1 ? "piece" : "pieces"}. Ctrl+Z to undo.`);
      this._changed();
    }
    this._refreshGhost();
  }

  _pipette(x, y) {
    const stack = this.world.stackAt(x, y).filter((m) => !m.fixed);
    const m = stack[stack.length - 1]; // overhead if there is one
    if (!m) return;
    if (this.hooks.canUseTool && !this.hooks.canUseTool(m.t)) {
      this._status(`${name(m.t)} is not available here.`);
      return;
    }
    this.ghostDir = m.r;
    this.setTool(m.t);
    this._status(`Picked up ${name(m.t)}.`);
  }

  _rotate(times) {
    if (this.activeTool) {
      this.ghostDir = rotate(this.ghostDir, times);
      if (this.drag && this.drag.path.length === 1) this.drag.path.startDir = this.ghostDir;
      this._refreshGhost();
      return;
    }
    if (!this.selected) return;
    const { x, y } = this.selected;
    const m = this.world.machineAt(x, y, 1) || this.world.machineAt(x, y, 0);
    if (!m || m.fixed) return;
    const from = m.r;
    const to = rotate(from, times);
    const z = m.z || 0;
    if (this.game.rotateAt(x, y, z, to)) {
      this.history.push([{ k: "rotate", x, y, z, from, to }]);
      this._changed();
    } else {
      this._status(`${name(m.t)} cannot turn that way here.`);
    }
  }

  _deleteSelected() {
    if (!this.selected) return;
    this._removeAt(this.selected.x, this.selected.y);
  }

  undo() {
    if (this.history.undo()) { this._status("Undone. Ctrl+Shift+Z to redo."); this._changed(); }
    else this._status("Nothing to undo.");
    this._refreshGhost();
  }

  redo() {
    if (this.history.redo()) { this._status("Redone."); this._changed(); }
    else this._status("Nothing to redo.");
    this._refreshGhost();
  }

  _deselect() {
    this.selected = null;
    this.renderer.setSelected(null);
    this.hooks.onSelect?.(null);
  }

  _changed() {
    this.hooks.onChange?.();
  }

  _status(msg) {
    this.hooks.onStatus?.(msg);
  }
}
