# Output: factory game

A factory game for the edu/tools page: one factory that keeps growing, with
contracts that arrive on their own.

## Status

See `../STATUS.md` (phase status) and `../roadmap.md` (the plan).

## Quick start

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # headless tests (node --test)
npm run build      # production build to dist/
```

## Pages

| URL | What |
|---|---|
| `/` | Continue the saved factory, or the menu (New game, Sandbox, Settings, Export, Import) |
| `/?sandbox` | Sandbox: largest plot, every hopper and tool, no orders, not saved |
| `/?art=1` | Art sheet: every part form and every contract item at belt and order size (`&cb=1` colorblind, `&theme=dark`) |
| `/?perf=1` | Frame-time overlay |

## Content (edit without code)

| File | What |
|---|---|
| `data/contracts.json` | Contracts in order: item, amount, credits per part, unlocks, milestone |
| `data/plot.json` | Plot stages (zone, new hoppers) and the dock position |
| `data/operations.json` | Operation machines (cut, press, combine, encase), times, depth limit, shell materials |
| `data/items.json` | Material colors and patterns, real names for item ids |

Item ids are recipe trees: `m1`, `cut(m1)`, `press(cut(m2))`, `join(a|b)`
(sorted), `case(assembly|shell)`. A part can be cut up to three times, and
pressing is its last step. A combiner takes one part from each side.

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
data/                  # content (JSON), see above
src/
  main.js              # app shell: menu, campaign or sandbox, HUD, toasts
  data/index.js        # the one place that imports data/*.json
  core/                # loop (30 Hz), signals, grid math, config/theme
  game/
    campaign.js        # contract queue, unlocks, plot stages
    root.js            # GameRoot: tick, hoppers, machines, dock, ledger
    world.js           # placed pieces by tile and layer, placement rules
    line.js            # belt lines (incremental place/remove/split/splice)
    items.js           # item ids, part rules, labels, recipe steps
    art.js             # item icons from the recipe tree (+ cached stamps)
    renderer.js        # canvas drawing, culling, far-zoom drawing
    camera.js          # pan/zoom, fit, ease to a new zone
    input.js           # mouse + keyboard (drag build, area delete, pipette)
    dragpath.js        # drag path builder (corners, back-tracking)
    build.js           # plan/apply multi-tile placement, area delete
    history.js         # undo/redo stack
    save.js            # save v3 (one factory, parts in transit), migrations
    systems/
      flow.js          # belt item advancement (spacing, backpressure)
      process.js       # machine handlers (from operations.json), ports
      dock.js          # 2x2 order dock with slots
  ui/
    toolbar.js         # tool palette
    artsheet.js        # ?art=1 page
test/                  # node --test: lines, flow, phase0, phase1, phase2
```

## Key invariants (tested)

1. **Spacing:** items on a belt never closer than 0.63 tiles
2. **Backpressure:** a blocked tail clamps the whole line, nothing is lost
3. **Ledger:** parts in world = emitted + injected + made - merged - delivered - recycled - removed (`GameRoot.ledgerOk()`)
4. **Determinism:** fixed 30 Hz tick, stable iteration order, no randomness
5. **Line integrity:** every belt in exactly one line, chains are simple
6. **Ports:** parts enter only through input sides and leave through output sides
