// Tiny synchronous event emitter.

export class Signals {
  constructor() {
    this.listeners = new Map();
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.listeners.get(name)?.delete(fn);
  }

  emit(name, payload) {
    this.listeners.get(name)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        // Listener errors must not break the tick
        console.error("signal listener failed:", name, err);
      }
    });
  }

  clear() {
    this.listeners.clear();
  }
}
