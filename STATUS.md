# Status
Current phase: 4 (Scale) - human gate FAILED 2026-10-22; polish interlude (roadmap section 3b) comes before Phase 5
Current task: P1/P2/P3 all built 2026-10-22, ready for one joint human gate review (Paul)

Built by Claude on 2026-10-21, at Paul's request.

## Automatic checks (Phase 4)
- [x] Each upgrade changes exactly what it says, level by level; costs credits, refuses when short, stops at the top level; faster belts and hoppers really deliver more (`test/phase4.test.js`)
- [x] Boosts: Overdrive doubles machine speed and Rush doubles hopper rate for 60 s; using one again adds 60 s
- [x] Rate meter accuracy against a known layout (the dock's standing-order meter and the stats panel both read about 60 a minute on a line that makes 60)
- [x] Standing orders fill after the rate is held long enough; below the rate, held time pauses and does not go back; the two standing-order contracts advance the campaign
- [x] Side orders: only parts from earlier contracts, extra credits, expire gently, never move the contracts on, none before the first contract
- [x] Economy: the first upgrade is affordable within 2 contracts (30 credits after 2 contracts; cheapest upgrade 30)
- [x] Save: upgrades, boosts, game time, hopper timers, standing-order progress and side orders survive a reload
- [x] Full suite: 117 passing. `npm run build` clean.

## Human gate (Phase 4)
- [ ] Paul upgrades belts and feels the factory speed up. A standing order makes him rebuild a line for more throughput. (only Paul ticks this)
  - Not passed on 2026-10-22. Paul's playtest found build-feel and visual problems; see roadmap section 3b for his full report and the draft P1/P2/P3 polish passes. Phase 5 (his story and sequence) waits until the polish passes are done.

## Polish interlude (added 2026-10-22, Paul's playtest)
- **P1 (build feel): built 2026-10-22, ready for human gate.**
  - New `src/game/autoDir.js`: `suggestBeltDir(world, x, y, z)` continues the one belt feeding the tile (null when ambiguous/blocked); `suggestMachineDir(world, type, x, y)` scores each facing by port fit against feeders (belts/hoppers pointing at the tile, weight 2) and followers (belts/machines that can take from it, weight 1); best effort, lowest rotation on a tie; null on an empty neighbourhood or portless type.
  - `src/game/input.js`: `_toolTiles` uses the suggestions unless the player pressed F/R (`_ghostRotated`, set in `_rotate`, reset after a successful build); a hand rotation applies to this ghost only. `ghostDir` now also carries over after a single tap (was drags only, the stale-direction bug). DRAG_SLOP = 8 px: the path only grows once the pointer leaves the start tile, so a tap that jitters places one machine, not a row.
  - Machine drag-to-place was already one undo step per drag (verified by test); the reported "places multiple machines" came from tap jitter, fixed by DRAG_SLOP. "Tap-drag to rotate does nothing" is fixed by F/R now driving machine facing (and beating the smart direction).
  - Deferred by design: P1 does not touch belt corner rendering, belt size/animation, or the pressed-part alert (P2), or visuals (P3).
- **P2 (belt and item look): built 2026-10-22, ready for human gate.**
  - Snake corners: `game/src/game/beltShape.js` `linePath(tiles, tile)` builds one stroke path per flow line (head back-edge centre, tile centres at the ends and at every direction change, tail front-edge centre); `renderer._drawBelts` strokes casing + surface + rails with round joins so corners curve.
  - Belts are narrower than the tile (0.7 tile, 0.62 overhead) so the grid shows beside them, and chevrons march with the belt when `settings.motion` is on.
  - Q4 alert: `GameRoot.refusalReason(m, item, fromDir)` names the rule (pressed part is finished / single parts not assemblies / wrong side - turn with F / depot holds one kind / dock takes only what an open order asks for). `_checkStuckTail` fires it when the front item sits at the tail and the acceptor will never take it; `refusals` Map holds it (`refusalAt(x,y)`) for the red "!" badge (`renderer._drawRefusals`), the hover card (`main.js hoverLines`) and one toast per machine+part per 20 s (`main.js`, `machineRefusal` signal). Re-noting while the part stays stuck keeps the badge lit but does not re-toast (`said` timestamp vs `REFUSAL_QUIET` = 20 s, `REFUSAL_SHOWN` = 8 s).
  - Tests: `test/polish-p2.test.js` (13). Full suite 147/147, `npm run build` clean.
- P1 gate feedback from Paul (2026-10-22, to review together after P2):
  1. "Belt behavior is not correct" (unspecified; re-test after P2).
  2. Machines do not snap to a belt placed alongside them (machine placed after the belt: smart direction should have faced it; or the belt added next to a machine does not feed it). Carry into P1 re-review.
- **P3 (factory atmosphere): built 2026-10-22, ready for human gate.**
  - `src/game/art/style.js` is now the single source of every visual: `drawFactoryFloor`, `drawMachineBody/Trim/Glyph/Ports`, `drawSolar`, `drawWind`, `MACHINE_COLORS`. The renderer calls these and draws no machine/hopper/dock/floor pixels itself.
  - Floor: painted concrete, sawcut seams, poured work area, dirt in corners/perimeter, specks and oil stains, per-lot marks (barcode stencil, bay letter, painted stall box).
  - Machines: plate shadow, highlight/shade, rivets, item-shaped side ports with fill wedges, stall box, feet; working machines get spinning rotor, blinking lamp, work light (kept at far zoom). Hoppers: funnel + stacked item column + level window + lamp. Dock: hazard-striped platform, canopy posts, sliding crane trolley, order lamp, entrance arrow. Solar: framed cells + bolts. Wind: turning blades (frozen when motion off).
  - All animation respects `settings.motion`; far-zoom fallbacks kept; off-screen tiles cost nothing. Power stays a text line (Q4 decision).
  - `?art=1` review sheet now shows every machine idle|working and both generators on floor plates (`src/ui/artsheet.js`).
  - Tests: 147 pass, `npm run build` OK.
- Defects from the playtest (status): 1 machine drag - fixed (slop + one-step test); 2 wrong direction / keyboard rotate - fixed (autoDir + F/R); 3 belt corners - P2; 4 patch-up connect - fixed (suggestBeltDir + end-to-end test); 5 silent cutter refusal - P2 (alert, per Q4 answer).

## Session 2026-10-22c (Claude): P3 factory atmosphere
- changed: `game/src/game/art/style.js` (new floor/machine/hopper/dock/solar/wind drawing + MACHINE_COLORS moved here), `game/src/game/renderer.js` (delegates all tile art to style.js; solar/wind drawing extracted to drawSolar/drawWind), `game/src/ui/artsheet.js` (machine + generator cards).
- tests added: none new (visual pass; covered by existing 147 + build). Human check is Paul's.
- problems: none open.

## Session 2026-10-22b (Claude): P1 build feel
- changed: `src/game/autoDir.js` (new), `src/game/input.js` (suggestions, DRAG_SLOP, ghost rotation rules). See Polish interlude above.
- tests added: `test/polish-p1.test.js` (17). Full suite 134 passing. `npm run build` clean. Sanity check: stubbing the suggest functions to return null fails 8+ of the new tests, so they test real behaviour.
- problems: none open. Human gate for P1 is Paul's.

## Session 2026-10-22 (Claude): recorded Paul's playtest; no code changed
- changed: `roadmap.md` section 3b (playtest report, defects, wishes, draft P1-P3 passes, Q4); this file.
- tests added: none yet (each P1 defect gets a failing test when its pass starts).
- problems: none open on the code; Phase 4 gate not passed.

## Last session (2026-10-21, Claude)
- changed:
  - **Engine fix (important):** on a belt carrying several parts, only the front part moved each tick, so busy belts crawled. Every part now moves each tick, stopping 0.63 tiles behind the part ahead. Busy lines now run at full belt speed. Two regression tests added (`test/flow.test.js`). This will make every factory feel faster than before.
  - `game/data/upgrades.json`: four upgrade tracks (Conveyor, Machine motors, Hoppers, Depots; 2 or 3 levels each), two boosts (Overdrive, Rush), and side order timing.
  - Upgrades panel ("upgrades" in the top bar): buy levels and use boosts. Active boosts count down in the top bar.
  - Side orders: every 2.5 minutes (after the first contract) a side slot asks for 5 to 15 of a part from an earlier contract, at 1.5x credits, for 5 minutes. Shown under the main order with time left; toasts when one arrives or is done.
  - Standing orders: contracts c08 and c13 now ask for 6 a minute for 2 minutes. The order panel shows "Now: 4 a minute (need 6)" and held time; the dock shows the live rate.
  - Stats panel ("stats"): parts made and delivered per minute, last minute and last 5 minutes, with icons.
  - Hover card: machines show their rate ("takes 30 and makes 60 parts a minute").
  - The "contract done" toast now shows the credits that contract actually paid.
- decisions Claude made (please check):
  - Belt speed levels are x1.5, x2, x3 (the roadmap said 2, 4, 8 parts per second; doubling each time felt too steep for the small placeholder plot). Change `mult` in `upgrades.json`.
  - Standing orders: held time pauses when the rate drops (it never resets). Gentler than starting over.
  - Side orders pick deterministically (no random numbers), from parts of earlier contracts only.
  - Upgrades and boosts are global, as in shapez; perks still multiply on top.
- tests added: test/phase4.test.js (15), 2 in test/flow.test.js.
- problems: none open.

## Phase 3 (waiting for Paul's gate)
- [x] Automatic checks passed. [ ] Human gate: reach the city cap, run short of power, and feel the level-up choice is real.

## Phase 2 (done when Paul passes its gate)
- [x] Automatic checks passed (see git history for details). [ ] Human gate: play from New game through the first expansion without opening a menu.

## Phase 1 (done)
- [x] Automatic checks passed. [x] Human gate: Paul, 2026-10-21 ("Ports on machines is a critical and very well made call. Tools on numbers is far better as well.")

## Phase 0 (done)
- [x] Automatic checks passed. [x] Human gate: Paul, 2026-10-21.

## Questions for Paul
- P1 human check: rebuild a broken line with one tap and place a row of machines facing the right way without fighting the tool. Then P2 can start.
- The city cap (12) and prices (solar 25, wind 80) are guesses for the placeholder contracts. Tune them in `game/data/contracts.json` and `game/data/power.json` when the real progression exists.
- Phase 5 is next and starts with you: the product tree, names and contract sequence (any format). The engine is ready for it: everything is data.
