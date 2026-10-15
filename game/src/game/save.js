// Save system (M3): versioned JSON schema, localStorage, export/import.
//
// Save format v2:
// {
//   "format": "output.save",
//   "version": 2,
//   "profile": {
//     "coins": 120,
//     "upgrades": ["motor2x"],
//     "contracts": { "u2": { "stars": 3, "bestTime": 95.2 } }
//   },
//   "active": {
//     "level": "u2",
//     "machines": [{ "t": "belt", "x": 2, "y": 3, "r": 0, "z": 0 }],
//     "accepted": 4,
//     "time": 80.5,
//     "placedCount": 12
//   },
//   "settings": { "sound": false, "theme": "light", "motion": true, "colorblind": false },
//   "stats": { "timePlayedSec": 300, "machinesBuilt": 40 }
// }
//
// In-flight items are NOT saved (documented decision from development-plan.md
// §4.4). Saves capture machines + accepted count + coins + upgrades.
//
// M3: machines carry a layer z (0 ground, 1 overhead). v1 saves (no z, no
// upgrades) are migrated in _migrate_1_to_2.

const STORAGE_KEY = "output.save";
const CURRENT_VERSION = 2;

export class SaveSystem {
  constructor() {
    this.version = CURRENT_VERSION;
  }

  /** Build a save object from the current game state. */
  serialize(game) {
    const machines = [];
    for (const m of game.world.machinesList()) {
      if (m.t === "dock") continue; // dock comes from the level file
      machines.push({ t: m.t, x: m.x, y: m.y, r: m.r, z: m.z || 0 });
    }
    return {
      format: "output.save",
      version: this.version,
      profile: {
        coins: game.coins || 0,
        upgrades: [...(game.upgrades || [])],
        contracts: game.contracts || {},
      },
      active: {
        level: game.contract?.id || null,
        machines,
        accepted: game.dock?.accepted || 0,
        time: game.time || 0,
        placedCount: game.placedCount || 0,
      },
      settings: game.settings || { sound: false, theme: "light", motion: true, colorblind: false },
      stats: game.stats || { timePlayedSec: 0, machinesBuilt: 0 },
    };
  }

  /** Save to localStorage. */
  save(game) {
    const data = this.serialize(game);
    if (!data.active.level) return true; // nothing to resume
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error("save failed:", err);
      return false;
    }
  }

  /** Load from localStorage. Returns the save object or null. */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.format !== "output.save") return null;
      return this.migrate(data);
    } catch (err) {
      console.error("load failed:", err);
      return null;
    }
  }

  /** Apply migrations from older versions to current. */
  migrate(data) {
    let v = data.version || 0;
    while (v < CURRENT_VERSION) {
      const next = v + 1;
      const fn = this[`_migrate_${v}_to_${next}`];
      if (fn) data = fn(data);
      v = next;
    }
    data.version = CURRENT_VERSION;
    return data;
  }

  // ---- migrations -------------------------------------------------------

  /** v1 -> v2: add upgrades, settings.motion/colorblind, active.time, machine z. */
  _migrate_1_to_2(data) {
    data.profile = data.profile || { coins: 0 };
    if (!Array.isArray(data.profile.upgrades)) data.profile.upgrades = [];
    data.profile.contracts = data.profile.contracts || {};
    for (const [id, c] of Object.entries(data.profile.contracts)) {
      const entry = typeof c === "object" && c !== null ? c : { stars: c || 0 };
      data.profile.contracts[id] = {
        stars: entry.stars || 0,
        bestTime: entry.bestTime || 0,
      };
    }
    data.settings = data.settings || {};
    if (typeof data.settings.motion !== "boolean") data.settings.motion = true;
    if (typeof data.settings.colorblind !== "boolean") data.settings.colorblind = false;
    data.active = data.active || { level: null, machines: [] };
    if (typeof data.active.time !== "number") data.active.time = 0;
    if (typeof data.active.placedCount !== "number") data.active.placedCount = 0;
    for (const m of data.active.machines || []) {
      if (typeof m.z !== "number") m.z = 0;
    }
    data.stats = data.stats || { timePlayedSec: 0, machinesBuilt: 0 };
    return data;
  }

  // (add migration functions here as the schema evolves)
  // _migrate_2_to_3(data) { ... }

  /** Export save as a downloadable JSON string. */
  exportString(game) {
    return JSON.stringify(this.serialize(game), null, 2);
  }

  /** Import save from a JSON string. Returns the save object or null. */
  import(json) {
    try {
      const data = JSON.parse(json);
      if (data.format !== "output.save") return null;
      const migrated = this.migrate(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (err) {
      console.error("import failed:", err);
      return null;
    }
  }

  /** Clear the save. */
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* headless */
    }
  }
}
