# Status
Current phase: 4 (Scale)
Current task: built - ready for human gate

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
- The city cap (12) and prices (solar 25, wind 80) are guesses for the placeholder contracts. Tune them in `game/data/contracts.json` and `game/data/power.json` when the real progression exists.
- Phase 5 is next and starts with you: the product tree, names and contract sequence (any format). The engine is ready for it: everything is data.
