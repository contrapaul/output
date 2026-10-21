# Status
Current phase: 2 (One growing factory)
Current task: 2.1 to 2.9 complete - ready for human gate

Built by Claude on 2026-10-21, at Paul's request.

## Automatic checks (Phase 2)
- [x] Placeholder contracts complete headlessly with reference layouts: a campaign is played from a new game through contracts 1 to 6, including the first expansion, using real drag-built layouts and no manual clearing between orders (`test/phase2.test.js`, "campaign: contracts arrive..."); a product (encaser) order is completed separately. All 15 contracts are checked for valid items, known tools, and being makeable with the tools and hoppers available by then. Not every contract has its own built layout yet; they are placeholders Paul will replace.
- [x] Save, reload and continue gives the same state, parts in transit included; both copies run on identically
- [x] Depot conservation and the full ledger (`GameRoot.ledgerOk()`: emitted + injected + made - merged - delivered - recycled - removed)
- [x] Operation rules: Cutter and Press refuse assemblies and pressed parts, Encaser refuses non-shell parts and a second assembly, depth limit enforced, `join(a|b)` equals `join(b|a)`, combiner takes one part per side
- [x] Plot stages only grow; hoppers and the dock sit inside their stage
- [x] Frame time at the largest plot (50 x 34) with about 1,175 parts on belts, timed in the browser pane (tick + render): median 0.3 to 1.8 ms at zoom 0.43 to 2.0; 95th percentile under 5 ms except zoom 0.9 (22 ms); single spikes to about 30 ms. Target is 20 ms (50 fps). Recheck on a Chromebook in Phase 8.
- [x] Full suite: 83 passing. `npm run build` clean (76 KB JS, 26 KB gzip).

## Human gate (Phase 2)
- [ ] Paul plays from a new game through the first expansion without opening a menu, and wants to see the next contract. (only Paul ticks this)

## Last session (2026-10-21, Claude)
- changed:
  - Splitter is a Y (left and right), as Paul asked.
  - Items (2.1): abstract materials m1 to m4 and four open operations: Cutter (two halves), Press, Combiner (`join`), Encaser (`case`, assembly + shell part; shells are m4 parts). Generated labels ("M1 half", "(M1 half + M3) in M4 shell"). Depth limit 4.
  - Operations in data (2.2): `game/data/operations.json`; per-item handlers are gone. An optional `allow` list per machine is the hook for real recipes later.
  - Icons from the recipe tree (2.3): `art.js` draws any item. Material = color + pattern; cuts make a half, quarter, eighth wedge; pressed parts are flattened with ridges; assemblies are a dark plate with both items; products are framed in the shell color. Two levels of detail. `?art=1` shows every part form and every contract item.
  - Contracts (2.4): `game/data/contracts.json`, 15 placeholders with unlocks and 3 milestones.
  - Order dock (2.5): 2x2, three slots (main + 2 side order slots for Phase 4). Takes only what an open slot needs; anything else waits.
  - Plot expansion (2.6): `game/data/plot.json`, 4 stages from 16 x 12 to 50 x 34. A milestone grows the plot, adds hoppers and eases the camera out over 2 seconds.
  - Depots (2.7): small 50, medium 200, large 1000, one kind of part each, feed out the front. `placeFilledDepot` makes a pre-filled one (supply drops, Phase 3).
  - Zoomed-out play (2.8): only visible tiles are drawn; far out, belts are strips and parts are colored squares; item icons are cached as small images.
  - One save (2.9): save v3 stores the whole factory including parts on belts and inside machines. v2 saves become a new factory that keeps its credits. Menu: Continue, New game, Sandbox, Settings, Export, Import. Level select and `levels/*.json` deleted.
  - HUD: order panel (big icon, progress, credits each, reward, "How to make it"), credits and controls top right, toasts for contract done, unlocks and new land. Toolbar is compact and shows only unlocked tools.
  - Removed for now: stars, the shop and the three old upgrades (rebuilt in Phases 3 and 4).
- decisions Claude made (please check):
  - **Pressing is final** for a part: a pressed part cannot be cut or pressed again. Otherwise "cut then press" and "press then cut" are two different items that look and read the same.
  - **A combiner takes one part from each side.** With open combining, two belts into one combiner would otherwise pair two parts from the faster belt and jam the dock. Players see it as "feed it from two sides".
  - Hoppers can push straight into a machine in front of them, not only onto a belt.
- tests added: test/phase2.test.js (18). Old level and machine tests removed with the old content; Phase 0 and 1 tests moved to the new machines.
  - **Leftover parts (Paul chose option 1):** the dock takes parts made for any earlier contract for free (no credits, no progress), so a changeover never blocks a line. Claude widened "the previous contract" to "any earlier contract": with two lines, the test playthrough had parts left from two contracts back (a press still holding an old part). The current order's part always counts toward the order. Parts that were never ordered still stop at the dock.
- problems: a machine placed while old parts are still on its belt will use them (for example a combiner pairing an old quarter). Waiting a few seconds for the belt to drain avoids it; worth a hint in Phase 6.

## Phase 1 (done)
- [x] Automatic checks passed. [x] Human gate: Paul, 2026-10-21 ("Ports on machines is a critical and very well made call. Tools on numbers is far better as well.")

## Phase 0 (done)
- [x] Automatic checks passed. [x] Human gate: Paul, 2026-10-21.

## Questions for Paul
- Before Phase 3: `docs/power-and-rewards.md` section 7 (city power cap moment, perk pool, supply drop items).
