// Rate tracking (Phase 4): how many of something happened per minute.
//
// Counts go into 10-second buckets of game time and are kept for 5 minutes,
// so the stats panel can show "per minute over the last minute" and "over
// the last 5 minutes" without storing every event.

const BUCKET = 10; // seconds
const KEEP = 30; // buckets (5 minutes)

export class RateTracker {
  constructor() {
    this.buckets = new Map(); // key -> Map(bucketIndex -> count)
  }

  add(key, time, n = 1) {
    const b = Math.floor(time / BUCKET);
    let m = this.buckets.get(key);
    if (!m) this.buckets.set(key, (m = new Map()));
    m.set(b, (m.get(b) || 0) + n);
    if (m.size > KEEP + 2) {
      for (const k of m.keys()) if (k < b - KEEP) m.delete(k);
    }
  }

  /**
   * Per-minute rate over the last `seconds` (60 to 300) of game time.
   * Early in a game the window is shorter, so it uses the time so far.
   */
  perMinute(key, time, seconds = 60) {
    const m = this.buckets.get(key);
    if (!m) return 0;
    const now = Math.floor(time / BUCKET);
    const n = Math.max(1, Math.round(seconds / BUCKET));
    let total = 0;
    for (let b = now - n + 1; b <= now; b++) total += m.get(b) || 0;
    // time the counted buckets cover: full older buckets plus the part of
    // the current one, never more than the game has run
    const span = Math.min(time, (n - 1) * BUCKET + (time - now * BUCKET));
    return (total * 60) / Math.max(1, span);
  }

  /** Keys with any activity in the last 5 minutes. */
  keys() {
    return [...this.buckets.keys()];
  }
}
