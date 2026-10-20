# Status
Current phase: 0 (Repair and re-baseline)
Current task: 0.1-0.5 complete - ready for human gate

## Automatic checks
- [x] All tests pass, including the conservation test: items in world = emitted + injected - delivered - recycled, checked after 150 s of a seeded random edit script on the sandbox (test/phase0.test.js, passing)

## Human gate
- [ ] Paul builds a line, edits it while parts are moving, and nothing vanishes. (only Paul ticks this)

## Last session
- changed:
  - Belt edits no longer wipe items in transit. Placing, removing, and rotating (remove + place) now keep items on every surviving tile: items are snapshotted before the edit and re-homed to the line that still owns their tile (game/src/game/root.js, `_snapshotItemTiles` / `_resyncFlowLines`).
  - Design decision (roadmap allowed either, so it is documented here): a part sitting on a removed belt tile is REMOVED from the world, not stored (there is no stock system yet). It is counted in `GameRoot.partsRemoved` and a `partRemoved` signal fires, ready for a puff effect.
  - Splitter no longer duplicates: one part in, one part out. It sends to one of two exits, alternating when both have room (`MachineInstance.outCursor`, `handler.outDirs` in game/src/game/systems/process.js).
  - Credits fixed: the `coinsEarnedHere` typo is gone and the `contractComplete` payload reports a real earned number (10 ingots = 50 credits, verified by test).
  - Hidden bug found while adding the ledger: `recycled` was never incremented anywhere. Recycler now counts through `handler.sink`.
  - GameRoot now keeps a ledger: emitted / delivered / recycled / partsRemoved.
  - Level hints u5 and u8 reworded to the new splitter behavior (grade 7, no em dashes).
  - Status consolidated: `game/MILESTONES.md` deleted, status section removed from `game/README.md`, this file created.
- tests added:
  - test/phase0.test.js (10 tests): tail extension, head extension, mid-line split, tail removal, mid-line rotation (no item lost); splitter alternation; splitter blocked-exit fall-through; splitter 1-in/1-out with no duplication; credits are a real number; 150 s seeded random edit script with conservation checked every 100 ticks (mulberry32 seed 20261015, reproducible).
  - Full suite: 86 passing. `npm run build` clean (66.35 kB JS, 20.72 kB gzip).
- problems:
  - Two new tests first failed because they asserted on bin buffer only. A bin with no downstream keeps one part in its output slot (pre-existing M3 behavior, not a Phase 0 concern). Tests now count buffer + output slot.
  - Nothing else went wrong.

## Questions for Paul
- None for Phase 0.
- Roadmap decisions D1, D2, D4, D7, D9 are due before Phase 2 (you said you would update the roadmap after Phase 1).
