# Status
Current phase: 1 (Building feels good)
Current task: 1.1 (drag to place belts), not started

Read `roadmap.md` (v3, updated 2026-10-21) before starting. Paul answered decisions D1 to D9; section 3 lists what they change. Phase 1 itself did not change.

## Automatic checks (Phase 1)
- [ ] Drag path builder tests: straight, one corner, back-tracking, through blocked tiles
- [ ] Ports accept and reject by side
- [ ] Undo/redo round trips, including drags and area deletes as one step
- [ ] Rotating a machine in place keeps its parts
- [ ] Frame time under 8 ms with 300 items on screen (`?perf=1` overlay)

## Human gate (Phase 1)
- [ ] Paul draws a 20-tile belt with two corners in one drag, rebuilds a broken line in under 30 seconds, and says it "feels right". (only Paul ticks this)

## Phase 0 (done)
- [x] Automatic checks: 86 tests passing, including 150 s random-edit conservation test (test/phase0.test.js)
- [x] Human gate: Paul tested on 2026-10-21, "it works but of course is extremely barebones."
- Recorded decision: a part on a removed belt tile is removed from the world (counted in `GameRoot.partsRemoved`, `partRemoved` signal fires for a future puff effect).
- Known behavior: a bin with no downstream keeps one part in its output slot. Bins are replaced by storage depots in Phase 2.

## Last session
- 2026-10-21 (Claude, planning only, no game code changed): roadmap v3 written from Paul's decisions; Cloudflare deploy fixed (`wrangler.jsonc`); this file reset for Phase 1.

## Questions for Paul
- None blocking Phase 1 or Phase 2. Phase 2 decisions are recorded in roadmap section 3 (D1 to D9, R1 to R6).
- Before Phase 3: `docs/power-and-rewards.md` section 7 (city power cap moment, perk pool, supply drop items).
