// Perks (Phase 3): level-up choices from data/perks.json.
//
// makeOffer() builds the 3 cards for a milestone:
//   - one card from the player's weakest area (power, storage, supply or
//     speed), judged from the factory right now
//   - two cards from other categories, all different
//   - a milestone may list its own perks instead (contract.perks)
// Perks that name "one machine type" or "one hopper material" pick it when
// offered (what the player has built or needs most), so the card says
// exactly what it does.
//
// applyPerk() changes game.mods, game.freeBuilds, or the factory itself.
// Lasting perks are re-applied from the save; one-time perks (free solar
// panels, supply drops, early unlocks) are not, because their result is
// already saved.

import { perks as perkData } from "../data/index.js";
import { OPERATION_MACHINES } from "./systems/process.js";
import { itemName, parseItem, isRaw, material, materialStyle } from "./items.js";

export const PERKS = perkData.list;
const BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));
export const ONE_TIME = new Set(["solar_free", "supply_drop", "free_depot"]);
const SUPPLY_DROP_AMOUNT = 50;

/** Small seeded generator so offers repeat for the same save. */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which area is the player shortest of right now? */
export function weakestArea(game) {
  if (game.cityPower !== null && game.powerUsed() >= 0.85 * game.powerSupply()) return "power";
  for (const m of game.machines.values()) {
    if (m.handler.buffer && m.buffer.length >= 0.9 * game.capacityOf(m)) return "storage";
  }
  let waiting = 0;
  let working = 0;
  for (const m of game.machines.values()) {
    if (m.handler.buffer || !OPERATION_MACHINES.includes(m.type)) continue;
    const s = game.machineState(m);
    if (s === "waiting") waiting++;
    else if (s === "working") working++;
  }
  if (waiting > working) return "supply";
  return "speed";
}

const typeName = (t, names) => names[t] || t;

/** Fill in a perk's parameter; null when it cannot be offered now. */
function resolve(perk, campaign, taken, names) {
  const game = campaign.game;
  const card = { id: perk.id, category: perk.category };
  const placed = {};
  for (const m of game.machines.values()) placed[m.type] = (placed[m.type] || 0) + 1;
  if (perk.needsCap && game.cityPower === null) return null;
  if (perk.once && taken.some((t) => t.id === perk.id)) return null;

  if (perk.id === "efficient_motors" || perk.id === "free_power") {
    // the type using the most power in total
    let best = null;
    for (const [t, n] of Object.entries(placed)) {
      const use = game.powerOf(t) * n;
      if (use > 0 && (!best || use > best.use)) best = { t, use };
    }
    if (!best) return null;
    card.type = best.t;
  } else if (perk.id === "fast_machines") {
    const ops = Object.entries(placed).filter(([t]) => OPERATION_MACHINES.includes(t)).sort((a, b) => b[1] - a[1]);
    if (!ops.length) return null;
    card.type = ops[0][0];
  } else if (perk.id === "rich_hopper") {
    const needed = rawNeeds(campaign.current?.item);
    const have = [...new Set(game.hoppers.map((h) => material(h.item)))];
    card.material = have.find((m) => needed.has(m)) || have[0];
    if (!card.material) return null;
  } else if (perk.id === "supply_drop") {
    card.item = supplyItem(campaign);
    card.amount = SUPPLY_DROP_AMOUNT;
    if (!card.item) return null;
  } else if (perk.id === "free_depot") {
    if (campaign.unlocked.has("depot_l")) return null;
  }
  const fill = (s) =>
    s.replace("{type}", typeName(card.type, names))
      .replace("{material}", card.material ? materialStyle(card.material).label : "")
      .replace("{item}", card.item ? itemName(card.item) : "")
      .replace("{amount}", String(card.amount || ""));
  card.name = fill(perk.name);
  card.text = fill(perk.id === "free_depot" ? "Unlock the large depot now (holds 1000)." : perk.text);
  if (perk.id === "free_depot") card.name = "Large depot early";
  return card;
}

function rawNeeds(id, out = new Set()) {
  if (!id) return out;
  if (isRaw(id)) out.add(id);
  for (const a of parseItem(id).args) rawNeeds(a, out);
  return out;
}

/** A part used in the current contract: its biggest ingredient that is not raw. */
function supplyItem(campaign) {
  const c = campaign.current;
  if (c?.supplyDrop?.item) return c.supplyDrop.item;
  if (!c) return null;
  const args = parseItem(c.item).args;
  const made = args.filter((a) => !isRaw(a)).sort((a, b) => b.length - a.length);
  if (made.length) return made[0];
  if (args.length) return args[0];
  return isRaw(c.item) ? null : c.item;
}

/**
 * Build the 3 cards for a milestone.
 * @param {Campaign} campaign
 * @param {object} names     machine id -> display name
 * @param {string[]} [fixed] perk ids the milestone lists (contract.perks)
 */
export function makeOffer(campaign, names, fixed = null) {
  const taken = campaign.perks;
  const pick = rng(campaign.index * 7919 + campaign.stage * 31 + taken.length);
  if (fixed?.length) {
    return fixed.map((id) => BY_ID[id] && resolve(BY_ID[id], campaign, taken, names)).filter(Boolean).slice(0, 3);
  }
  const cards = [];
  const used = new Set();
  const tryCategory = (cat) => {
    const pool = PERKS.filter((p) => p.category === cat && (!p.rare || pick() < 0.35));
    while (pool.length) {
      const p = pool.splice(Math.floor(pick() * pool.length), 1)[0];
      const card = resolve(p, campaign, taken, names);
      if (card) {
        cards.push(card);
        used.add(cat);
        return true;
      }
    }
    return false;
  };
  tryCategory(weakestArea(campaign.game));
  const cats = [...new Set(PERKS.map((p) => p.category))];
  while (cards.length < 3) {
    const left = cats.filter((c) => !used.has(c));
    if (!left.length) break;
    const cat = left[Math.floor(pick() * left.length)];
    if (!tryCategory(cat)) used.add(cat);
  }
  return cards;
}

/** Apply a lasting perk's effect to game.mods (also used when loading). */
export function applyLasting(game, card) {
  const m = game.mods;
  switch (card.id) {
    case "efficient_motors": m.powerDelta[card.type] = (m.powerDelta[card.type] || 0) - 1; break;
    case "calm_winds": m.calmWinds = true; break;
    case "free_power": m.freePower.add(card.type); break;
    case "fast_machines": m.typeSpeed[card.type] = (m.typeSpeed[card.type] || 1) * 1.25; break;
    case "belt_speed": m.beltMult *= 1.1; break;
    case "rich_hopper": m.hopperMult[card.material] = (m.hopperMult[card.material] || 1) * 1.5; break;
    case "bigger_depots": m.depotMult *= 1.5; break;
    case "bonus_cut": m.bonusCutEvery = 10; break;
    case "credit_bonus": m.creditMult *= 1.1; break;
    case "discount": m.priceMult *= 0.85; break;
  }
}

/** Apply a chosen perk: lasting mods, or a one-time gift. */
export function applyPerk(campaign, card) {
  const game = campaign.game;
  if (card.id === "solar_free") game.freeBuilds.solar = (game.freeBuilds.solar || 0) + 2;
  else if (card.id === "free_depot") campaign.unlocked.add("depot_l");
  else if (card.id === "supply_drop") {
    const spot = openTileNear(game, game.dock ? { x: game.dock.x - 2, y: game.dock.y } : { x: 0, y: 0 });
    if (spot) {
      game.placeFilledDepot("depot_m", spot.x, spot.y, 0, card.item, card.amount);
      card.at = spot;
    }
  } else applyLasting(game, card);
}

/** Nearest free ground tile (with a free tile in front) inside the plot. */
export function openTileNear(game, from) {
  const z = game.world.zone;
  const free = (x, y) =>
    x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h &&
    !game.world.machineAt(x, y, 0) && !game.world.machineAt(x, y, 1);
  for (let r = 0; r < Math.max(z.w, z.h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = from.x + dx;
        const y = from.y + dy;
        if (free(x, y) && free(x + 1, y)) return { x, y };
      }
    }
  }
  return null;
}
