# Output — Factory Puzzle Game

Electronic-parts factory puzzle game for the edu/tools page.

## Status

See `../STATUS.md` (phase status) and `../roadmap.md` (the plan).

## Quick start

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # 25 headless tests
npm run build      # production build to dist/
```

## Play

| Level | URL | Goal | New machines |
|---|---|---|---|
| Tutorial A | `/?level=t-a` | Move 10 ingots | belt |
| Tutorial B | `/?level=t-b` | Cut 10 wafers | saw |
| Tutorial C | `/?level=t-c` | Build 10 boards | press, solder |
| Unit 1 | `/?level=u1` | 8x dies | (reuse) |
| Unit 2 | `/?level=u2` | 10x boards | merger |
| Unit 3 | `/?level=u3` | 8x modules | mounter, bin |
| Unit 4 | `/?level=u4` | 6x devices | encap |

Open `http://localhost:5173/` for the level select screen.

## Controls

| Input | Action |
|---|---|
| 1 to 9, 0, - | pick a tool from the toolbar |
| left-drag with a tool | draw a path, release to build (belts follow the path and turn corners; machines repeat) |
| drop a machine on a belt | inserts the machine into the line |
| F or R (Shift to reverse) | rotate the ghost, or the selected piece in place |
| left-click, no tool | select a piece |
| left-drag, no tool | pan |
| right-click with a tool / Esc | put the tool away |
| right-click on a piece | remove it |
| right-drag | remove everything in a box |
| middle-click or Q | pipette: pick up that piece's tool and rotation |
| Delete | remove selected |
| Ctrl+Z, Ctrl+Shift+Z (or Ctrl+Y) | undo, redo (a whole drag is one step) |
| Space | pause/resume |
| . | speed 1x / 2x |
| H | hint |
| wheel | zoom |
| C | center camera |

Add `?perf=1` to the URL for a frame-time overlay.

## Architecture

```
src/
  main.js              # bootstrap, level loading, contract overlay
  core/
    loop.js            # fixed-timestep scheduler (30 Hz)
    signals.js         # event emitter
    grid.js            # tile math, directions
    config.js          # rates, colors, theme
  game/
    world.js           # placed machines map
    line.js            # belt lines (incremental place/remove/split/splice)
    camera.js          # pan/zoom
    renderer.js        # canvas: grid, belts, machines, items, hoppers, dock
    input.js           # mouse + keyboard (drag build, area delete, pipette)
    dragpath.js        # drag path builder (corners, back-tracking)
    build.js           # plan/apply multi-tile placement, area delete
    history.js         # undo/redo stack
    art.js             # vector item icons
    items.js           # item registry + canonical encoding
    root.js            # GameRoot: tick orchestrator
    systems/
      flow.js          # belt item advancement (spacing, backpressure)
      process.js       # machine handler table + charge timers
      dock.js          # order dock (accept/reject/progress)
  ui/
    toolbar.js         # machine palette
test/
  lines.test.js        # 11 tests: line resolution
  flow.test.js         # 14 tests: flow, dock, saw, conservation
levels/
  t-a.json             # Tutorial A
  t-b.json             # Tutorial B
```

## Key invariants (tested)

1. **Spacing:** items on a belt never closer than 0.63 tiles
2. **Backpressure:** blocked tail clamps the entire line, no items lost
3. **Conservation:** items in world = emitted − accepted (no creation/destruction)
4. **Determinism:** fixed 30 Hz tick, stable iteration order, no randomness
5. **Line integrity:** every belt in exactly one line, chains are simple
6. **Order-insensitive assembly:** solder/mounter/encap accept inputs in any order

## Test coverage

| File | Tests | Covers |
|---|---|---|
| `test/lines.test.js` | 11 | line place/remove/split/splice, invariants |
| `test/flow.test.js` | 14 | flow, spacing, backpressure, dock, saw, conservation |
| `test/machines.test.js` | 16 | press, solder, mounter, encap, merger, bin, full chain, save |
| **Total** | **41** | |
