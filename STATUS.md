# Status
Current phase: 3 (Power and rewards)
Current task: built - ready for human gate

Built by Claude on 2026-10-21, at Paul's request. Design: `docs/power-and-rewards.md` (marked ready to build; sections 6 and 7 hold every decision).

## Automatic checks (Phase 3)
- [x] Power: use, supply, the city cap, placement blocked over the limit with a reason, a drag adds up its own use, going over later never stops running machines (`test/phase3.test.js`)
- [x] Generators: cost credits, add supply, refund on removal, undo stays fair, free builds used first; wind spacing both ways; calm winds lifts it
- [x] City cap contract: sets the cap, unlocks solar and wind, gives 2 free panels; dead-end guard (free panels plus credits earned cover more machines)
- [x] Every perk changes exactly what it says; bonus cut keeps the ledger exact; supply drop places a full depot
- [x] Offers: 3 cards from different categories, first from the weakest area; no power perks before the cap; fixed perks per milestone; once-only perks do not return
- [x] Save: city cap, perks (re-applied), free builds, pending offer and generator refunds survive a reload
- [x] Full suite: 100 passing. `npm run build` clean.
- [x] Browser: city cap toast, power meter, level-up card (survives reload), perk applied, free solar panel placed and supply rose.

## Human gate (Phase 3)
- [ ] Paul reaches the city cap, runs short of power, and is glad to see a power perk or buys a solar panel; a level-up choice feels like a real choice. (only Paul ticks this)

## Last session (2026-10-21, Claude)
- changed:
  - `game/data/power.json` (machine power use, solar and wind) and `game/data/perks.json` (12 perks).
  - Power budget in `GameRoot`: `powerOf`, `powerUsed`, `powerSupply`, `budgetError`, `windError`. Top bar shows "Power 7 / 14" (amber at 90%), or "Power 7 (city)" before the cap.
  - Solar (+2, 25 credits) and wind (+6, 80 credits) are toolbar tools. Credits are taken when placed and given back when removed. Free builds show on the toolbar ("2 free").
  - The city cap: contract c10 now sets `cityPower: 12`, unlocks solar and wind, and gives 2 free solar panels. A story toast explains it.
  - Level-ups: every milestone shows a card with 3 perks (the game keeps running). Smart offers: one from the weakest area. Perks name the machine type or hopper they affect.
  - Supply drop: a medium depot with 50 of a part used in the current contract, next to the dock.
  - Toolbar: short labels (full names on hover), three more keys (=, [, ]) for 14 tools.
- decisions Claude made (please check; also in the design doc, section 7):
  - Generators are bought by placing them (no separate shop screen yet); full refund on removal.
  - Wind spacing applies both ways (no machine next to a turbine).
  - "One machine type" and "one hopper" perks choose their target when offered.
  - Dropped "lucky combine" (a combiner finishing with one part is confusing) and replaced "free medium depot" (depots are already free) with "large depot early".
- tests added: test/phase3.test.js (17).
- problems: none open. The toolbar fits on one row on a laptop-width screen but wraps to two in a narrow window; icons come in Phase 7.

## Phase 2 (done when Paul passes its gate)
- [x] Automatic checks passed (see git history for details). [ ] Human gate: play from New game through the first expansion without opening a menu.

## Phase 1 (done)
- [x] Automatic checks passed. [x] Human gate: Paul, 2026-10-21 ("Ports on machines is a critical and very well made call. Tools on numbers is far better as well.")

## Phase 0 (done)
- [x] Automatic checks passed. [x] Human gate: Paul, 2026-10-21.

## Questions for Paul
- The city cap (12) and prices (solar 25, wind 80) are guesses for the placeholder contracts. Tune them in `game/data/contracts.json` and `game/data/power.json` when the real progression exists.
- Phase 4 is next: upgrades bought with credits, side orders, standing orders, boosts, stats.
