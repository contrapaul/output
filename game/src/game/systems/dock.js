// Order dock (Phase 2): a fixed 2x2 building with order slots.
//
// Slot 0 is the main contract. Slots 1 and 2 are for side orders (Phase 4).
// The dock takes an item only when an open slot needs it (main slot first);
// anything else stops at the dock, which is the feedback (D9: the dock
// never stores parts).
//
// Standing orders (Phase 4): a slot with `rate: { perMinute, seconds }`
// takes its item without limit. While deliveries in the last 60 seconds of
// game time reach perMinute, `held` counts up; when held reaches `seconds`
// the order is filled. If the rate drops, held pauses (it never goes back).
//
// Leftovers (Paul, 2026-10-21): parts made for an earlier contract are still
// taken, for free (no credits, no progress), so a line is never stuck on a
// changeover. `leftovers` holds those item ids.

export class OrderDock {
  /**
   * @param {number} x  top-left tile of the 2x2 footprint
   * @param {number} y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.slots = [null, null, null]; // { kind, item, amount, accepted, creditEach }
    this.leftovers = new Set(); // items from earlier contracts, taken for free
    this.leftoversTaken = 0;
    this.lastReject = null;
    this.rejectFlash = 0;
    this.now = 0; // game time, set each tick
  }

  /** The four tiles the dock covers. */
  tiles() {
    return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: this.x + dx, y: this.y + dy }));
  }

  get main() {
    return this.slots[0];
  }

  /** Set (or clear) an order slot. */
  setSlot(i, order) {
    this.slots[i] = order
      ? { kind: i === 0 ? "main" : "side", accepted: 0, creditEach: 0, ...(order.rate ? { amount: Infinity, held: 0, times: [], filled: false } : {}), ...order }
      : null;
  }

  _slotFor(item) {
    for (const s of this.slots) {
      if (!s || s.item !== item) continue;
      if (s.rate ? !s.filled : s.accepted < s.amount) return s;
    }
    return null;
  }

  /** Would an open slot take this item (or is it a leftover)? */
  wants(item) {
    return this._slotFor(item) !== null || this.leftovers.has(item);
  }

  /**
   * Take an item. Returns the slot that took it, a { kind: "leftover" }
   * marker for a free leftover, or null.
   */
  tryAccept(item) {
    const s = this._slotFor(item);
    if (!s && this.leftovers.has(item)) {
      this.leftoversTaken++;
      return { kind: "leftover", item, creditEach: 0 };
    }
    if (!s) {
      this.lastReject = item;
      this.rejectFlash = 30;
      return null;
    }
    s.accepted++;
    if (s.rate) s.times.push(this.now);
    return s;
  }

  /** Deliveries in the last 60 seconds for a standing order. */
  ratePerMinute(s) {
    const since = this.now - 60;
    while (s.times.length && s.times[0] < since) s.times.shift();
    return s.times.length;
  }

  /** The main order is filled. */
  get complete() {
    const m = this.main;
    if (!m) return false;
    return m.rate ? m.filled : m.accepted >= m.amount;
  }

  /** Advance standing orders. Returns slots that just got filled. */
  tick(time = this.now, dt = 0) {
    this.now = time;
    if (this.rejectFlash > 0) this.rejectFlash--;
    const filled = [];
    for (const s of this.slots) {
      if (!s || !s.rate || s.filled) continue;
      if (this.ratePerMinute(s) >= s.rate.perMinute) s.held += dt;
      if (s.held >= s.rate.seconds) {
        s.held = s.rate.seconds;
        s.filled = true;
        filled.push(s);
      }
    }
    return filled;
  }
}
