// Game data (Phase 2). Content lives in game/data/*.json so it can be edited
// without touching code. This module is the only place that imports it.

import operations from "../../data/operations.json" with { type: "json" };
import items from "../../data/items.json" with { type: "json" };
import contracts from "../../data/contracts.json" with { type: "json" };
import plot from "../../data/plot.json" with { type: "json" };
import power from "../../data/power.json" with { type: "json" };
import perks from "../../data/perks.json" with { type: "json" };
import upgrades from "../../data/upgrades.json" with { type: "json" };

export const DATA = { operations, items, contracts, plot, power, perks, upgrades };
export { operations, items, contracts, plot, power, perks, upgrades };
