// Fixed-timestep scheduler.
// Logic runs at a fixed rate (default 30 Hz); render runs on requestAnimationFrame.
// Speed multiplier = number of logic ticks per rAF frame (0 = paused).
//
// Determinism note: tick order is always the same and `now` only affects how
// many ticks run, never their content. Systems must not read wall-clock time.

export class GameLoop {
  constructor({ hz = 30, tick, render } = {}) {
    this.hz = hz;
    this.dt = 1 / hz;
    this.tick = tick || (() => {});
    this.render = render || (() => {});
    this.speed = 1;
    this.accumulator = 0;
    this.last = null;
    this.running = false;
    this.tickCount = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = null;
    this.accumulator = 0;
    const frame = (now) => {
      if (!this.running) return;
      if (this.last === null) this.last = now;
      let delta = (now - this.last) / 1000;
      this.last = now;
      if (delta > 0.25) delta = 0.25; // clamp after tab-away
      this.accumulator += delta;
      const step = this.dt;
      let n = 0;
      while (this.accumulator >= step && n < this.speed * 4) {
        this.accumulator -= step;
        this.tick(this.tickCount, step);
        this.tickCount++;
        n++;
      }
      this.render(delta);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
  }
}
