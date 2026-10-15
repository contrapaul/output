// Level JSON validation: every level file must be well-formed,
// reference known items/hoppers/machines, and stay within zone bounds.

import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { getItem } from "../src/game/items.js";

const LEVELS_DIR = path.join(import.meta.dirname, "..", "levels");
const files = fs.readdirSync(LEVELS_DIR).filter((f) => f.endsWith(".json"));

const VALID_HOPPERS = ["hopper_ingot", "hopper_wire", "hopper_cell", "hopper_case"];
const VALID_MACHINES = [
  "belt", "belt_high", "saw", "press", "solder", "mounter", "encap",
  "merger", "splitter", "bin", "recycler",
];

test("level files exist for the whole campaign", () => {
  const ids = files.map((f) => f.replace(".json", ""));
  for (const id of ["t-a", "t-b", "t-c", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "sandbox"]) {
    assert.ok(ids.includes(id), `missing level file: ${id}`);
  }
});

for (const file of files) {
  test(`level ${file} is well-formed`, () => {
    const l = JSON.parse(fs.readFileSync(path.join(LEVELS_DIR, file), "utf8"));

    assert.ok(l.id, "needs an id");
    assert.equal(l.id, file.replace(".json", ""), "id must match the filename");
    assert.ok(l.name, "needs a name");
    assert.ok(l.tier, "needs a tier");
    assert.ok(l.zone && l.zone.w >= 8 && l.zone.w <= 24 && l.zone.h >= 6 && l.zone.h <= 16,
      `zone must be reasonable: ${JSON.stringify(l.zone)}`);

    // fixed tiles inside the zone
    for (const f of l.fixed || []) {
      assert.ok(f.x >= 0 && f.x < l.zone.w && f.y >= 0 && f.y < l.zone.h,
        `fixed tile out of zone: ${JSON.stringify(f)}`);
      if (f.t.startsWith("hopper")) {
        assert.ok(VALID_HOPPERS.includes(f.t), `unknown hopper: ${f.t}`);
      } else if (f.t === "dock") {
        assert.ok(l.target, "a dock needs a target");
        assert.equal(f.target, l.target.item, "dock target must match the contract target");
        assert.equal(f.amount, l.target.amount, "dock amount must match the contract amount");
      } else if (f.t !== "belt" && f.t !== "belt_high") {
        assert.ok(VALID_MACHINES.includes(f.t), `unknown fixed machine: ${f.t}`);
      }
    }

    // unlocked machines are known
    for (const u of l.unlocked || []) {
      assert.ok(VALID_MACHINES.includes(u), `unknown unlocked machine: ${u}`);
    }

    // target item is real and has a recipe
    if (l.target) {
      assert.ok(l.target.item, "target needs an item");
      assert.ok(Number.isInteger(l.target.amount) && l.target.amount > 0, "target needs a positive amount");
      const item = getItem(l.target.item);
      assert.ok(item, `unknown target item: ${l.target.item}`);
      assert.ok(Array.isArray(item.steps), `target item should document steps: ${l.target.item}`);
    } else {
      assert.equal(l.tier, "sandbox", "only the sandbox may have no target");
    }

    // stars (sandbox exempt)
    if (l.tier !== "sandbox") {
      assert.ok(l.stars, "needs star thresholds");
      assert.ok(l.stars.time2 > 0 && Number.isFinite(l.stars.time2), "stars.time2");
      assert.ok(l.stars.machines3 > 0 && Number.isFinite(l.stars.machines3), "stars.machines3");
    }

    // hint + learn (grade-7 copy)
    assert.ok(l.hint && l.hint.length > 10, "needs a hint");
    assert.ok(l.learn, "needs a learn note");
    for (const s of [l.name, l.hint, l.learn]) {
      assert.ok(!s.includes("--"), "no em dashes in player-facing copy");
    }
  });
}
