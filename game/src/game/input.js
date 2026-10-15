// Input (M3): mouse/touchpad + keyboard.
//
// Mouse:
//   left-click on empty tile    -> place active tool (ghost preview follows)
//   left-click on placed tile   -> select it (machine card shows details)
//   left-drag on empty space    -> pan camera (when no tool is active)
//   right-click                 -> cancel ghost / deselect
//   wheel                       -> zoom at cursor
//
// Keyboard:
//   Q..A (see TOOL_KEYS)        -> select toolbar tool
//   F                           -> rotate ghost (or rotate selected machine)
//   Delete / Backspace          -> remove selected (overhead first, then ground)
//   Ctrl+Z                      -> undo last placement
//   Space                       -> pause/resume (handled in main.js)
//   H                           -> jam hint (handled in main.js)
//   C                           -> center camera
//   Esc                         -> cancel ghost / deselect
//
// Overhead (belt_high): the tool implicitly targets layer z=1. A tile may hold
// a ground belt and an overhead belt at once; Delete removes overhead first.

import { rotate } from "../core/grid.js";

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Camera} camera
   * @param {GameRoot} game
   * @param {Renderer} renderer
   * @param {object} hooks { onToolChange(id), onStatus(msg), onSelect(m|null) }
   */
  constructor(canvas, camera, game, renderer, hooks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.game = game;
    this.world = game.world;
    this.renderer = renderer;
    this.hooks = hooks;
    this.activeTool = null;
    this.ghostDir = 0;
    this.ghostTile = null;
    this.selected = null; // { x, y, z } | null
    this._panning = false;
    this._lastPointer = null;
    this._moved = false;
    this.undoStack = [];
  }

  attach() {
    const c = this.canvas;
    this._hDown = (e) => this._onDown(e);
    this._hMove = (e) => this._onMove(e);
    this._hUp = (e) => this._onUp(e);
    this._hWheel = (e) => this._onWheel(e);
    this._hCtx = (e) => {
      e.preventDefault();
      this._cancelGhost();
    };
    this._hKey = (e) => this._onKey(e);
    c.addEventListener("pointerdown", this._hDown);
    c.addEventListener("pointermove", this._hMove);
    window.addEventListener("pointerup", this._hUp);
    c.addEventListener("wheel", this._hWheel, { passive: false });
    c.addEventListener("contextmenu", this._hCtx);
    window.addEventListener("keydown", this._hKey);
  }

  detach() {
    const c = this.canvas;
    if (this._hDown) c.removeEventListener("pointerdown", this._hDown);
    if (this._hMove) c.removeEventListener("pointermove", this._hMove);
    if (this._hUp) window.removeEventListener("pointerup", this._hUp);
    if (this._hWheel) c.removeEventListener("wheel", this._hWheel);
    if (this._hCtx) c.removeEventListener("contextmenu", this._hCtx);
    if (this._hKey) window.removeEventListener("keydown", this._hKey);
  }

  get ghostZ() {
    return this.activeTool === "belt_high" ? 1 : 0;
  }

  setTool(id) {
    this.activeTool = id;
    this._cancelGhost();
    this.hooks.onToolChange?.(id);
  }

  _tileFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const t = this.camera.screenToTile(sx, sy);
    return { x: t.x, y: t.y, sx, sy };
  }

  _onDown(e) {
    if (e.button === 2) return;
    this._downPos = this._tileFromEvent(e);
    this._lastPointer = { sx: this._downPos.sx, sy: this._downPos.sy };
    this._moved = false;
    this._panning = !this.activeTool;
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _onMove(e) {
    const t = this._tileFromEvent(e);
    if (this._panning && this._lastPointer) {
      const dx = t.sx - this._lastPointer.sx;
      const dy = t.sy - this._lastPointer.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) this._moved = true;
      this.camera.pan(dx, dy);
      this._lastPointer = { sx: t.sx, sy: t.sy };
    }
    if (this.activeTool) {
      const valid = this.world.canPlace(this.activeTool, t.x, t.y, this.ghostDir, this.ghostZ);
      this.ghostTile = { x: t.x, y: t.y };
      this.renderer.setGhost(this.activeTool, t.x, t.y, this.ghostDir, this.ghostZ, valid);
    }
  }

  _onUp(e) {
    this.canvas.releasePointerCapture?.(e.pointerId);
    const t = this._tileFromEvent(e);
    const wasPanning = this._panning;
    this._panning = false;
    this._lastPointer = null;
    if (wasPanning) return;

    if (this.activeTool) {
      const valid = this.world.canPlace(this.activeTool, t.x, t.y, this.ghostDir, this.ghostZ);
      if (valid) {
        const placed = this.game.placeMachine(this.activeTool, t.x, t.y, this.ghostDir, this.ghostZ);
        if (placed) {
          this.undoStack.push({ kind: "place", t: this.activeTool, x: t.x, y: t.y, r: this.ghostDir, z: this.ghostZ });
          this._status(`placed ${this.activeTool}`);
        }
      } else {
        this._status(this._placeError(t.x, t.y));
      }
    } else {
      const stack = this.world.stackAt(t.x, t.y);
      if (stack.length) {
        const m = stack[0]; // select the ground tile (card shows both)
        this.selected = { x: m.x, y: m.y, z: 0 };
        this.renderer.setSelected(m.x + "," + m.y);
        this.hooks.onSelect?.({ x: m.x, y: m.y });
        this._status(`selected ${m.t} at (${m.x}, ${m.y})`);
      } else {
        this._deselect();
      }
    }
  }

  _placeError(x, y) {
    const z = this.ghostZ;
    if (!this.world.stackAt(x, y).every((m) => m.z !== z)) return "that tile is taken";
    const tool = this.activeTool;
    if (tool === "belt_high") return "overhead goes over empty space or a ground belt";
    if (this.world._countFeeders(x, y, z) > 1) return "two belts cannot feed one belt";
    const dir = this.ghostDir;
    const d = [1, 0, -1, 0][dir];
    const dy = [0, 1, 0, -1][dir];
    const fx = x + d;
    const fy = y + dy;
    if (this.world.beltAt(fx, fy, z)) {
      if (this.world._countFeeders(fx, fy, z) > 0) return "two belts cannot feed one belt";
      return "that would close a loop";
    }
    return "cannot place here";
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  _onKey(e) {
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k === "z" || k === "Z") {
        e.preventDefault();
        this._undo();
      }
      return;
    }
    switch (k) {
      case "f":
      case "F":
        this._rotate();
        break;
      case "Delete":
      case "Backspace":
        this._deleteSelected();
        break;
      case "Escape":
        this._cancelGhost();
        this._deselect();
        break;
      case "c":
      case "C":
        this.camera.center();
        break;
    }
  }

  // ---- actions ----------------------------------------------------------

  _rotate() {
    if (this.ghostTile && this.activeTool) {
      this.ghostDir = rotate(this.ghostDir, 1);
      const valid = this.world.canPlace(this.activeTool, this.ghostTile.x, this.ghostTile.y, this.ghostDir, this.ghostZ);
      this.renderer.setGhost(this.activeTool, this.ghostTile.x, this.ghostTile.y, this.ghostDir, this.ghostZ, valid);
      this._status(`rotated to ${this.ghostDir}`);
    } else if (this.selected && this.activeTool === null) {
      const m = this.world.machineAt(this.selected.x, this.selected.y, 0);
      if (m && this.game.machines.has(m.x + "," + m.y)) {
        // rotate a machine via remove + place
        const nr = rotate(m.r, 1);
        this.game.removeMachine(m.x, m.y, 0);
        const placed = this.game.placeMachine(m.t, m.x, m.y, nr, 0);
        if (placed) {
          this.undoStack.push({ kind: "rotate", t: m.t, x: m.x, y: m.y, r: nr, z: 0 });
          this._status(`rotated ${m.t} at (${m.x}, ${m.y})`);
        }
      }
    }
  }

  _deleteSelected() {
    if (!this.selected) return;
    // overhead first, then ground
    const over = this.world.machineAt(this.selected.x, this.selected.y, 1);
    if (over) {
      this.game.removeMachine(over.x, over.y, 1);
      this._status(`removed ${over.t} (overhead)`);
    } else {
      const m = this.world.machineAt(this.selected.x, this.selected.y, 0);
      if (!m) return;
      this.undoStack.push({ kind: "remove", t: m.t, x: m.x, y: m.y, r: m.r, z: m.z || 0 });
      this.game.removeMachine(m.x, m.y, 0);
      this._deselect();
      this._status(`removed ${m.t}`);
    }
  }

  _undo() {
    const u = this.undoStack.pop();
    if (!u) return;
    if (u.kind === "place") {
      this.game.removeMachine(u.x, u.y, u.z || 0);
      this._status("undid placement");
    } else if (u.kind === "remove") {
      this.game.placeMachine(u.t, u.x, u.y, u.r, u.z || 0);
      this._status("undid removal");
    } else if (u.kind === "rotate") {
      const cur = this.world.machineAt(u.x, u.y, 0);
      if (cur) {
        this.game.removeMachine(cur.x, cur.y, 0);
        this.game.placeMachine(cur.t, cur.x, cur.y, rotate(u.r, 3), 0);
      }
      this._status("undid rotation");
    }
  }

  _cancelGhost() {
    this.ghostTile = null;
    this.renderer.setGhost(null, 0, 0, 0, 0, false);
  }

  _deselect() {
    this.selected = null;
    this.renderer.setSelected(null);
    this.hooks.onSelect?.(null);
  }

  _status(msg) {
    this.hooks.onStatus?.(msg);
  }
}
