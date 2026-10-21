# Status
Current phase: 1 (Building feels good)
Current task: 1.1 to 1.10 complete - ready for human gate

Built by Claude (not the local model) on 2026-10-21, at Paul's request.

## Automatic checks (Phase 1)
- [x] Drag path builder tests: straight, one corner, two corners, diagonal jump, back-tracking, crossing itself, single tile (test/phase1.test.js)
- [x] Planning: blocked tiles marked invalid with a reason, outside-area, turning existing belts, preview matches what is built, machines repeat, machine dropped on a belt is inserted (test/phase1.test.js)
- [x] Ports accept and reject by side, belt to machine and machine to machine (test/phase1.test.js)
- [x] Undo/redo round trips, including drags and area deletes as one step; at least 50 steps kept (limit 100)
- [x] Rotating a machine in place keeps its parts; rotating a belt keeps the parts on it; a blocked rotation puts the belt back
- [x] Frame time under 8 ms with 300 items: 438 items on 308 belts, render call median 0.5 ms, max 3.4 ms (measured in the browser pane by timing `renderer.render()`; the `?perf=1` overlay shows live numbers when the pane is visible). Note: this times the draw calls, not GPU compositing; check on a real Chromebook in Phase 8.
- [x] Full suite: 112 passing. `npm run build` clean.

## Human gate (Phase 1)
- [ ] Paul draws a 20-tile belt with two corners in one drag, rebuilds a broken line in under 30 seconds, and says it "feels right". (only Paul ticks this)

## Last session (2026-10-21, Claude)
- changed:
  - Drag to build (1.1, 1.2): `src/game/dragpath.js` builds the path (follows the current heading, turns at corners, back-tracking cuts it). `src/game/build.js` plans the whole path on an overlay of the world, so the preview uses the same rules as real placement; invalid tiles show red and the status bar says why. Belts follow the path; machines repeat along it. The next belt starts facing the way the last drag ended.
  - Dropping a machine on a ground belt inserts it into the line (the belt is swapped out). Not in the roadmap, added because it is the most common edit.
  - Delete (1.3): right-drag removes everything in a box; right-click on a piece removes it; right-click with a tool puts the tool away. The dock and other fixed pieces cannot be removed or rotated (before, Delete could remove the dock).
  - Rotate (1.4): F or R, Shift reverses. Rotates the ghost, or the selected piece in place without losing its parts (`GameRoot.rotateAt`).
  - Pipette (1.5): middle-click or Q.
  - Ports (1.6): `PORTS` in `systems/process.js`. Single-input machines take from the back; 2-input stations and the merger from back, left and right; the splitter outputs front and right; the recycler and dock take from any side. Inputs draw as light notches, outputs as white arrows. A belt ending at a side with no input shows a red X and its parts wait (nothing lost).
  - Smooth motion (1.7): items keep their previous distance; the renderer draws between ticks using the loop's alpha.
  - Undo/redo (1.8): `src/game/history.js`, Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, 100 steps.
  - Hover info (1.9): tooltip with name, what it takes, what it makes, and its state.
  - Machine states (1.10): working pulses gently, waiting is dimmed, blocked has an amber dashed outline (plus "!" in colorblind mode). Replaces the "!" badge.
  - Keys changed: toolbar tools are now 1 to 9, 0, - (letters are free for actions). Speed toggle moved from 1/2 to ".". Toolbar moved to the bottom so it no longer covers the top rows.
  - Ledger fix: removing a machine now counts the parts it held in `partsRemoved`.
  - Machines can no longer be placed under an overhead belt (overhead already could not go over a machine).
- tests added: test/phase1.test.js (26 tests).
- problems:
  - None open. The browser pane pauses animation when hidden, so live fps could not be read there; render time was measured directly instead.

## Phase 0 (done)
- [x] Automatic checks: 86 tests passing, including 150 s random-edit conservation test (test/phase0.test.js)
- [x] Human gate: Paul tested on 2026-10-21, "it works but of course is extremely barebones."

## Questions for Paul
- Splitter exits are front and right (kept from before so existing layouts still work). A Y shape (left and right) may read better. Change it?
- Before Phase 3: `docs/power-and-rewards.md` section 7 (city power cap moment, perk pool, supply drop items).
