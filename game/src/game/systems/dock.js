// Order dock: accepts only the contract target item.
// Wrong items bounce back (return to the upstream belt).

export class Dock {
  /**
   * @param {string} targetItem  canonical item id the dock accepts
   * @param {number} amount      how many to accept for contract completion
   */
  constructor(targetItem, amount) {
    this.target = targetItem;
    this.amount = amount;
    this.accepted = 0;
    this.complete = false;
    this.lastReject = null; // item id of last rejected item (for UI feedback)
    this.rejectFlash = 0;  // ticks of flash remaining
  }

  /**
   * Try to accept an item. Returns true if accepted, false if rejected.
   */
  tryAccept(itemId) {
    if (this.complete) return false;
    if (itemId === this.target) {
      this.accepted++;
      if (this.accepted >= this.amount) this.complete = true;
      return true;
    }
    this.lastReject = itemId;
    this.rejectFlash = 30; // 1 second at 30 Hz
    return false;
  }

  get progress() {
    return this.accepted / this.amount;
  }

  tick() {
    if (this.rejectFlash > 0) this.rejectFlash--;
  }

  reset() {
    this.accepted = 0;
    this.complete = false;
    this.lastReject = null;
    this.rejectFlash = 0;
  }
}
