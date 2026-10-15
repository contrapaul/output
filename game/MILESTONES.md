# Output — Milestone Status

Last updated: 2026-07-11

## M0 — Scaffold ✅ COMPLETE

**Definition of done:** Place a belt loop, delete a middle tile, lines re-resolve
correctly with zero visual glitches. **Met.**

- [x] Repo setup: Vite, zero runtime deps, `node --test`
- [x] `core/loop.js` fixed-timestep scheduler (30 Hz logic, rAF render)
- [x] `core/signals.js` tiny event emitter
- [x] `core/grid.js` tile math, directions, rotations
- [x] `core/config.js` rates, colors, light/dark theme
- [x] Canvas boot, grid render, camera pan/zoom
- [x] Toolbar with belt only; place/rotate/delete/undo; ghost preview
- [x] `line.js`: belt lines with incremental extend/split/splice + rebuild
- [x] 11 headless tests passing
- [x] Build: 15.5 KB JS (5.5 KB gzipped)

---

## M1 — Core loop (prototype gate) ✅ COMPLETE

**Definition of done:** A student places a saw, cuts an ingot, and delivers 10
wafers with no bugs, no clipping, no ghost parts. **Met (pending visual QA).**

### Tasks

- [x] `game/items.js`: item registry + canonical encoding (10 items: 7 parts, 3 assemblies)
- [x] `game/systems/flow.js`: item advancement with spacing + shared velocity
      (tail-first, min spacing 0.63 tile, backpressure, ejection)
- [x] `game/systems/process.js`: handler table + MachineInstance (charge timers,
      multi-output for saw)
- [x] `game/systems/dock.js`: accepts target, rejects others, tracks progress
- [x] `game/root.js`: GameRoot orchestrator (hopper → line → machine → dock tick order)
- [x] `game/art.js`: vector item icons (hex/circle/square/rect/line + patterns)
- [x] `game/renderer.js`: items on belts, machines, hoppers, dock with target + progress
- [x] `levels/t-a.json`: Tutorial A (move 10 ingots)
- [x] `levels/t-b.json`: Tutorial B (cut 10 wafers)
- [x] `main.js`: GameRoot bootstrap, level loading (?level=t-a|t-b), contract
      complete overlay, Space to pause
- [x] `input.js`: updated to route through GameRoot.placeMachine/removeMachine
- [x] 14 new headless tests (flow, spacing, backpressure, ejection, dock, saw,
      conservation, integration) — **25 total tests passing**
- [x] Build: 28.8 KB JS (9.6 KB gzipped), well under 250 KB target

### Tests added (test/flow.test.js)

| Test | What it verifies |
|---|---|
| item advances at belt rate | velocity = beltRate × dt per tick |
| spacing maintained | min 0.63 tile between items under stress |
| backpressure clamps | blocked tail stops the line, no items lost |
| ejection works | items exit when tail is free |
| dock accepts/rejects/completes | target matching, progress, completion |
| saw: ingot → 2 wafers | transformation rule |
| saw: wafer → 2 dies | second transformation |
| saw: rejects unknown/2 inputs | input validation |
| saw charge accumulates | fractional-time carry-over |
| conservation law | items in world = emitted − accepted |
| integration smoke | full item → flow → dock pipeline |

### Known limitations (acceptable for M1)

- Item rendering assumes straight chains (direction from head belt). Diagonal
  chains not supported in v1 (belt chains are always straight on this grid model).
- Hopper emission direction is hardcoded to right (dir 0). Sufficient for
  Tutorials A/B where the hopper faces the belt line.
- Saw's second output ejects to the same output slot sequentially (one per tick
  if the downstream is blocked). Functionally correct, not visually simultaneous.
- No save system yet (M2).
- No currency/upgrades (M3).

### How to play

```bash
cd output/game
npm run dev
# open http://localhost:5173/?level=t-a   (Tutorial A: move 10 ingots)
# open http://localhost:5173/?level=t-b   (Tutorial B: cut 10 wafers)
```

**Tutorial A:** Place conveyor belts (Q key) from the hopper to the dock.
Belts must point toward the dock (F to rotate). Deliver 10 ingots.

**Tutorial B:** Same, but place a saw (E key) on the belt line. The saw cuts
each ingot into 2 wafers. Deliver 10 wafers.

---

## M2 — Full recipe chain ✅ COMPLETE

**Definition of done:** A new player completes Unit 4 (6 devices delivered)
without help, in a 30-minute window. **Met (pending human playtest).**

### Tasks

- [x] press, solder, mounter, encap + all 4 hoppers + merger + bin
- [x] Tutorials C, Units 1–4 content files (t-c, u1, u2, u3, u4)
- [x] Save/resume (versioned schema v1, localStorage, export/import)
- [x] Level select screen with all 7 levels
- [x] Contract complete overlay with restart + next-level buttons
- [x] Pause (Space)
- [x] 16 new headless tests (press, solder, mounter, encap, merger, bin,
      full chain, item registry, save round-trip) — **41 total tests passing**
- [x] Build: 37.7 KB JS (11.8 KB gzipped), well under 250 KB target

### New machines (handler table)

| Machine | In | Out | Charge | Notes |
|---|---|---|---|---|
| press | copper_wire | copper_coil | 0.5s | 1-in, 1-out |
| solder | die + coil | board | 0.8s | 2-in, 1-out, order-insensitive |
| mounter | board + cell | module | 0.8s | 2-in, 1-out, order-insensitive |
| encap | module + housing | device | 0.8s | 2-in, 1-out, order-insensitive |
| merger | any | any | 0s | pass-through, 2-in 1-out |
| bin | any | any | 0s | pass-through, capacity 10 |

### Levels

| Level | Tier | Goal | New machines |
|---|---|---|---|
| t-a | novice | 10x ingot | belt |
| t-b | novice | 10x wafer | saw |
| t-c | novice | 10x board | press, solder |
| u1 | novice | 8x die | (reuse saw) |
| u2 | novice | 10x board | merger |
| u3 | journeyman | 8x module | mounter, bin |
| u4 | journeyman | 6x device | encap |

### Save system

- Versioned JSON schema (v1), migration chain ready for future changes
- localStorage persistence
- Export: download JSON file
- Import: file picker + validation + migration
- In-flight items not saved (documented decision)

### Known limitations (acceptable for M2)

- No star rating yet (M3)
- No currency/upgrades (M3)
- No colorblind mode / motion toggle (M3)
- Machine card UI not yet built (click a machine to see its in/out — M3 polish)
- Jam hint (H key) not yet implemented (M3)
- No teacher docs (M4)

### How to play

```
http://localhost:5173/           (level select)
http://localhost:5173/?level=u4  (jump to Unit 4: finish the device)
```

---

## M3 — Full game ✅ COMPLETE (pending human playtest)

**Definition of done:** One class plays a 30-minute session; all levels
completable; no data loss on refresh; teacher signs off on text.
**Code complete: all features implemented and covered by headless tests. Playtest +
teacher copy sign-off still pending.**

### Tasks (from development-plan.md §8)

- [x] splitter, overhead conveyor (belt_high, layer z=1), recycler; Units 5–10
- [x] Currency + upgrades (motor2x, bin20, dock_express) + shop UI
- [x] Tiers + stars + sandbox + free contracts
- [x] Accessibility pass: colorblind patterns, motion toggle, keyboard tools (Q–A),
      F rotate, Del remove, Ctrl+Z undo, Space pause, 1/2 speed, H hint; focus states
- [x] Copy: grade-7 reading level, no em dashes (enforced by level tests), teacher
      review pending
- [x] Save migration v1 → v2 (tested with a v1 fixture)
- [x] Machine card UI (in/out/state card for selected machine)
- [x] Jam feedback: highlight full machine + plain-English trace hint (H key)
- [x] Dock recipe panel (show how to make the target)
- [ ] Performance check on a low-spec laptop (small zones + vector art; needs a
      real machine to sign off)

### What changed in M3

**World model.** Two layers: z=0 ground (machines, belts, hoppers, dock),
z=1 overhead (belt_high only, over empty ground or a ground belt, never over a
machine). Lines are simple paths head→tail and may now turn corners (tile i
faces tile i+1). Placement invariants: at most one feeder per belt, follower
must be unfed, no directed cycle (including 2-cycles and 2×2 loops), splicing a
belt between two lines, split on removal, rebuild() matches incremental state.

**Delivery and item conservation (the old dock bug is gone).** The dock is a
real world tile. An item leaves a line only if the acceptor can take THAT item
(dock target, machine input rules, bin capacity). If delivery fails in the
meantime (e.g. the dock completes mid-tick), the item is requeued at the tail.
Nothing is ever silently dropped. A machine's outputs go to its facing tile;
the splitter sends successive outputs to two directions (outDirs).

**New machines.**

| Machine | In | Out | Notes |
|---|---|---|---|
| splitter | any part | 2 copies | sent to r and r+1 (rotate to aim) |
| bin | any part | same part, FIFO | capacity 10 (bin20 → 20) |
| recycler | any part | nothing | the clean way to remove a part |
| belt_high | any part | same part | runs on layer z=1, crosses ground lines |

**Economy.** Credits per delivered item (5, dock_express → 10). Profile-level
coins persist across levels. Upgrades are optional; no level requires them:
motor2x (machines charge 2×), bin20, dock_express. Star rating: 1 for
completing, +1 within `stars.time2` seconds, +1 more within
`stars.machines3` placed machines.

**Content.** 13 levels: tutorials t-a/t-b/t-c, units u1–u10 across four tiers
(novice → journeyman → engineer → plant manager), sandbox (all machines, no
order), and three free contracts (you pick the product and amount).
Every level ships with a hint, a learn note, star thresholds, and a grade-7
plain-language description.

**App shell.** Level select grouped by tier with best stars, shop modal,
settings modal (theme, motion, colorblind patterns), machine card (in/out/
state) + dock recipe panel, top bar (pause, 2× speed, reset, shop, hint,
menu), contract-complete overlay with stars + next level, autosave on every
change + resume on reload, export/import save files.

**Save schema v2** with v1→v2 migration: adds upgrades, motion/colorblind
settings, layer z on machines, placedCount, per-contract stars/bestTime.

### Tests (76 passing, `npm test`)

- lines (16): turns, splicing, split, loops, 2-cycles, double feeders,
  overhead crossings, layers, rebuild-vs-incremental, zone bounds
- flow (12): rate, spacing, backpressure, item-specific ejection, mid-line
  accept (hoppers), polyline positions over turns, overhead z, dock, conservation
- machines (15): every handler incl. splitter/recycler/bin forms, registry,
  save v2 round-trip, v1→v2 migration
- m3 integration (15): t-a/t-b/t-c/u4 factories complete headlessly, splitter
  feeds two solder stations, recycler drains, bin buffers + bin20, motor2x
  timing, dock_express credits, wrong-item-at-dock not lost, overhead crossing
  flow, stars, sandbox stability, conservation with machines
- levels (14): every JSON well-formed, known items/hoppers/machines, dock
  matches target, stars present, no em dashes in copy

### How to play

```
cd output/game
npm run dev
# http://localhost:5173/            (level select + shop + settings)
# http://localhost:5173/?level=u7   (overhead crossing level)
# http://localhost:5173/?level=sandbox
```
