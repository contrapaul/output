// Undo/redo history (Phase 1).
//
// Each entry is a list of ops done by one player action (a whole drag, an
// area delete, a rotation). Undo applies the inverse ops in reverse order;
// redo applies the ops again in order. A new action clears the redo stack.
//
// Ops:
//   { k: "place",  t, x, y, r, z }
//   { k: "remove", t, x, y, r, z }
//   { k: "rotate", x, y, z, from, to }
//
// Parts that were inside removed pieces are not brought back by undo; the
// layout is. This matches what players expect from a building tool.

const LIMIT = 100;

function applyOp(game, op) {
  switch (op.k) {
    case "place": return !!game.placeMachine(op.t, op.x, op.y, op.r, op.z);
    case "remove": return !!game.removeMachine(op.x, op.y, op.z);
    case "rotate": return game.rotateAt(op.x, op.y, op.z, op.to);
  }
  return false;
}

function inverse(op) {
  switch (op.k) {
    case "place": return { k: "remove", t: op.t, x: op.x, y: op.y, r: op.r, z: op.z };
    case "remove": return { k: "place", t: op.t, x: op.x, y: op.y, r: op.r, z: op.z };
    case "rotate": return { k: "rotate", x: op.x, y: op.y, z: op.z, from: op.to, to: op.from };
  }
  return op;
}

export class History {
  constructor(game) {
    this.game = game;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Record one player action. Empty actions are ignored. */
  push(ops) {
    if (!ops || !ops.length) return;
    this.undoStack.push(ops);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const ops = this.undoStack.pop();
    if (!ops) return false;
    for (let i = ops.length - 1; i >= 0; i--) applyOp(this.game, inverse(ops[i]));
    this.redoStack.push(ops);
    return true;
  }

  redo() {
    const ops = this.redoStack.pop();
    if (!ops) return false;
    for (const op of ops) applyOp(this.game, op);
    this.undoStack.push(ops);
    return true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }
}
