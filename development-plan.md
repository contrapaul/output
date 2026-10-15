# Output — Development Plan

Working title: **Output** (electronic-parts factory puzzle game for the edu/tools page)
Status: planning v1
Inputs: `output/concepts.md` (design intent), `shapez.io-master/shapez-repo-review.md` (pattern
study), `shapez.io-master/` source (reference for architecture patterns only)

This document is the working plan for building the game. It turns the concept worksheet into
concrete specs, architecture, data formats, milestones, and testing criteria.

---

## 1. Goals and guardrails

**Goal:** an original, approachable factory-puzzle game where middle and high school students
build production lines that turn raw materials (silicon, copper, battery, housing) into
finished products, used in a grade 7 LEGO engineers unit to teach production lines and
machine-to-machine automation.

**Guardrails (from concepts.md, non-negotiable):**

1. **Originality:** no shapez.io code, art, names, levels, or UI text. We borrow *patterns*
   (architecture ideas), never assets. The shapez repo is GPLv3; its art lives in a separate
   repo with unknown license. **Zero asset reuse.**
2. **Reading level:** all in-game text at grade 7, short sentences, **no em dashes**, no
   unexplained jargon.
3. **Low stakes:** no fail state, no penalty for messy builds. Jams are information, not
   punishment. Currency is earned, upgrades are optional and never required.
4. **Local-first:** no accounts, no servers, no analytics by default. Save in localStorage
   plus downloadable/uploadable save files.
5. **Lightweight:** static files, loads in a few seconds, runs offline, works on desktop
   Chrome/Firefox/Safari and old school laptops.
6. **Session length:** a full unit fits ~30 minutes.

**Satisfactory-style element (from concepts.md):** a component tree. Simple parts combine
into complex assemblies (die + coil → board → module → device), and contracts get more
complex as the player earns trust. "Expansion" = bigger zones and multi-line contracts in
later units.

---

## 2. Borrow vs. build (IP boundary)

| From shapez.io | Status for Output |
|---|---|
| ECS-lite: entity + data components + logic systems | **Borrow pattern** (reimplement, simplify) |
| Path-based belt simulation (items = distance arrays on a chain) | **Borrow pattern** (reimplement) |
| Machine = data definition + handler-table processing logic | **Borrow pattern** (reimplement) |
| Item as immutable value type with canonical string + hash equality | **Borrow pattern** (reimplement with our own item model) |
| Schema-based savegame with versioned migrations | **Borrow pattern** (simplify: versioned JSON + migration functions) |
| Game modes as classes (puzzle = bounded zone, deterministic, no autosave) | **Borrow pattern** |
| Signal/event bus for entity lifecycle | **Borrow pattern** (simple EventTarget) |
| Registry pattern for machines/items | **Borrow pattern** (plain Maps) |
| Fixed-timestep logic decoupled from render | **Borrow pattern** |
| Chunk culling, sprite atlas, buffer caching | **Skip** (our zones are ≤ ~14×10 tiles; draw everything, use vector art) |
| Web workers, LZ compression, Electron/Steam/ads layers | **Skip** |
| Any code, sprites, level data, UI copy, machine/shape names | **Do not touch** |

Reference files in the shapez repo worth reading (pattern study only):

- `src/js/game/systems/belt.js` + `belt_path.js` — path-based flow, incremental path maintenance
- `src/js/game/systems/item_processor.js` — handler-table machine logic
- `src/js/game/components/item_ejector.js` / `item_acceptor.js` — slot geometry model
- `src/js/game/meta_building.js` — data-driven building definition
- `src/js/game/modes/puzzle.js` + `puzzle_edit.js` — bounded-zone mode + editor idea
- `src/js/game/modes/levels.js` — `{shape, required, reward}` level data
- `src/js/game/hub_goals.js` — progression + upgrade multipliers
- `src/js/savegame/schemas/*` — versioned migration chain
- `src/js/game/entity_manager.js` — component index + deferred destroy
- `mod_examples/` — how to design an extensible, example-documented API

---

## 3. Core design spec

### 3.1 Item model (the central modeling decision)

An item is an **immutable recipe tree**. Equality is string equality of the canonical form.

```
parts (leaves):
  silicon_ingot, silicon_wafer, silicon_die
  copper_wire, copper_coil
  battery_cell, housing

assemblies (functions of items):
  solder(die, coil)        = circuit_board
  mount(board, cell)       = module
  encap(module, housing)   = device
```

Canonical encoding (what we store, compare, and serialize):

```
part:        "silicon_die"
assembly:    "solder(copper_coil|silicon_die)"     // children sorted
             "mount(battery_cell|solder(copper_coil|silicon_die))"
```

Rules:

- Assembly children are **sorted** in the canonical string → order-insensitive equality for
  2-input machines (solder doesn't care which input is first). If we ever need order
  sensitivity, use a distinct function name instead.
- Every item has: `id` (canonical string), `display name`, `icon spec` (shape + color +
  pattern + optional nested sub-icons), `recipe steps` (for the dock's "how to make" hint).
- Item set is a fixed registry: 7 parts + 3 assemblies = 10 items for v1 (plastic sheet is
  reserved for later content). Adding an item = one registry entry + one icon drawing
  function. No engine changes.

**Why this works (and why it's original):** the user's example recipe ("combine silicon and
copper, run through soldering machine, add battery, place in enclosure") maps 1:1 onto
functions over parts. Rendering is trivial (nested icons), rejection is unambiguous (string
mismatch), and savegames are tiny strings. This deliberately avoids shapez's quadrant/layer
shape representation, keeping us clear of its distinctive material.

### 3.2 Machines (v1 frozen set — 13 kinds, 16 type ids incl. 4 material hoppers)

Slot model: each machine has **input slots** and **output slots**, each with a local tile
position + direction. A slot is either *occupied by an item mid-transfer* or free. This is
the same data-driven slot geometry shapez uses, reimplemented for our machines.

| id | name | inputs | outputs | rate (items/s) | rule |
|---|---|---|---|---|---|
| `hopper_ingot` | Silicon hopper | – | 1 | 0.5 | emits `silicon_ingot` |
| `hopper_wire` | Copper hopper | – | 1 | 0.5 | emits `copper_wire` |
| `hopper_cell` | Battery hopper | – | 1 | 0.5 | emits `battery_cell` |
| `hopper_case` | Housing hopper | – | 1 | 0.5 | emits `housing` |
| `belt` | Conveyor | 1 | 1 | 2.0 | moves items, keeps spacing |
| `overhead` | Overhead conveyor | 1 | 1 | 2.0 | same as belt, on layer 2 (crosses layer-1 belts and machines) |
| `splitter` | Splitter | 1 | 2 | 2.0 | each item → first free output (round-robin) |
| `merger` | Merger | 2 | 1 | 2.0 | takes from either input |
| `saw` | Saw | 1 | 2 | 1.0 | ingot → 2 wafers; wafer → 2 dies; else rejects |
| `press` | Coil press | 1 | 1 | 1.0 | wire → coil; else rejects |
| `solder` | Solder station | 2 | 1 | 1.0 | needs exactly {die, coil} → board |
| `mounter` | Assembler | 2 | 1 | 1.0 | needs exactly {board, cell} → module |
| `encap` | Encapsulation | 2 | 1 | 1.0 | needs exactly {module, housing} → device |
| `bin` | Bin | 1 | 1 | 2.0 | stores up to 10 items; outputs when downstream free |
| `recycler` | Recycler | 1 | 0 | 2.0 | consumes any item |
| `dock` | Order dock | 1 | – | 2.0 | accepts only the contract target; else bounces item back (item returns to the belt behind it) |

Notes:

- **Reject vs. bounce:** 2-input stations (solder/mounter/encap) *hold* a matching pair in
  progress and reject non-matching input (input stays on the upstream belt → visible backup).
  The dock *bounces* wrong items back onto the belt (visible, readable, no item loss).
- **Backpressure rule (global):** an output slot can only eject into a free acceptor slot,
  an empty belt tile, or the dock. If blocked, the machine holds its output and stops
  consuming. Backups are always rendered as a queue of waiting items.
- **No partial state on belts:** an item is always either *on a belt at a distance d*,
  *in a machine slot*, or *in a bin*. Three states, no exceptions.
- Upgrades (currency-spendable, optional) are modifiers on machine instances, not new
  machine types: `motor2x` (rate ×2), `bin20` (capacity ×2), `splitter_dual` (fair 50/50),
  `dock_express` (rate ×2). All unlocked by Unit 8 at the latest, spendable earlier if
  currency allows.

### 3.3 Flow simulation (the heart of the engine)

Borrow shapez's core idea, simplified:

1. **Lines:** connected `belt` tiles form *lines* (maximal chains). A line is a linked list
   of tiles with a direction. Lines are maintained incrementally when belts are placed or
   removed (extend / split / merge), never recomputed from scratch.
2. **Items on a line:** an ordered array of `[distance, item]` pairs + one
   `spacingToFirst` accumulator. Distance is measured in tiles from the line's start.
3. **Tick (fixed step, see 4.1):**
   a. Hoppers try to emit into the line's first tile (if free and spacing allows).
   b. For each line: compute `velocity = beltRate × dt`; advance items from the **tail**
      forward, each clamped by minimum spacing (0.63 tile, shapez's proven default) to the
      item ahead; consume shared velocity. If the tail item is past the line's end and the
      next tile's acceptor slot is free, eject into it.
   c. For each machine (in a stable order): if all required inputs present and output free,
      start/continue a charge (processing timer with fractional-time carry-over, shapez's
      `bonusTime` trick, so throughput is exact at any tick rate). On completion, eject
      outputs.
   d. Dock: consume target items, award currency, check contract progress.
4. **Why tail-first + shared velocity:** backpressure emerges automatically, items never
   overlap, and a blocked line stops cleanly. This is the single most important simulation
   pattern to copy from shapez (`belt_path.js update()`).
5. **Determinism:** fixed tick rate (30/s), stable iteration order, no random numbers in
   simulation → puzzle contracts are fully deterministic (required for fair replay and
   future teacher-authored levels).

### 3.4 Progression spec

- **Contracts** (levels) are data: `{ id, name, zone, fixed: {hoppers, dock}, unlocked,
  target: { item, amount }, hint, stars }`.
- **Tiers:** Novice (tutorials + U1–U2), Journeyman (U3–U5), Engineer (U6–U7),
  Plant Manager (U8 + sandbox + free contracts).
- **Currency:** 1 coin per accepted item (later: bonus for 3-star contracts). Spent on
  upgrades (3.2). Persisted.
- **Stars per contract:** 1 star = completed; 2 stars = completed within a soft time
  target; 3 stars = soft time target + no more than N machine placements (clean build).
  Stars are optional bragging rights, never gates.

Content (from concepts.md §6 table): Tutorials A/B/C, Units 1–8, Sandbox. The full table
lives in concepts.md; the machine/recipe mapping per unit is:

| Unit | Recipe chain taught | New machine |
|---|---|---|
| A | (raw move) | belt |
| B | hopper → saw → dock | saw |
| C | 2×hopper → merger → press → dock | merger, press |
| 1 | saw twice (ingot→wafer→die) | – (reuse) |
| 2 | die + coil → board | solder |
| 3 | board + cell → module | mounter |
| 4 | module + case → device | encap |
| 5 | board line → splitter → 2 solder stations | splitter |
| 6 | bin buffering | bin |
| 7 | crossing lines | overhead |
| 8 | full chain + upgrade choice | all + upgrades (+recycler as cleanup tool throughout) |

---

## 4. Architecture

### 4.1 Module layout (proposed repo: `output/game/`)

```
game/
  index.html
  package.json            # dev deps only (vite, eslint); zero runtime deps
  src/
    main.js               # boot: state manager → menu
    core/
      loop.js             # fixed-timestep scheduler (30/s logic, rAF render)
      signals.js          # tiny event emitter (or use EventTarget)
      grid.js             # tile math, directions, rotations
      config.js           # rates, spacing, colors, theme
    game/
      root.js             # game root: world + systems + ui refs (shapez GameRoot analog)
      registry.js         # ITEM_REGISTRY, MACHINE_REGISTRY (plain objects)
      items.js            # canonical encoding, equality, recipe steps, icons data
      machines.js         # machine definitions (slots, rates, handlers)
      world.js            # placed machines map (tile → machine), layers
      line.js             # belt Line: tiles, items array, extend/split/merge
      systems/
        flow.js           # line item advancement (the belt_path update analog)
        process.js        # machine charges + handler table (item_processor analog)
        dock.js           # acceptance, currency, contract progress
      contract.js         # contract state, stars, progress
      save.js             # versioned schema + migrate chain + localStorage + export/import
      input.js            # mouse/touchpad + keyboard (place/rotate/delete/select/camera)
      ui/
        toolbar.js        # machine palette
        dockpanel.js      # target, progress, recipe hint
        machinecard.js    # in-out card for selected machine
        jamhint.js        # highlight full machine + trace hint
        menu.js           # main menu, tier/contract select, sandbox, settings
        upgrades.js       # shop
    art/
      draw.js             # canvas helpers
      parts.js            # vector icons for all items (shape+color+pattern)
      machines.js         # vector icons for all machine kinds + full/working states
    states/
      menu.js, contract.js, sandbox.js
  levels/
    *.json                # contract data files (T-A, T-B, T-C, U1..U8, sandbox)
  docs/
    TEACHER.md, LEVEL_FORMAT.md, LICENSES.md
  test/                   # node-based unit tests for sim (see 9)
```

### 4.2 Key architectural patterns (from the shapez review, applied)

1. **Data/logic split:** `Machine` instance = data only (type, tile, rotation, slot
   occupancy, charge timers, upgrade flags). All behavior in `systems/process.js` via a
   handler table keyed by machine id. A new machine = registry entry + handler + icon.
2. **Event bus:** `world.signals` for `machinePlaced`, `machineRemoved`, `lineChanged`,
   `itemAccepted`, `contractComplete`, `save`, `load`. UI and systems subscribe; nobody
   calls across layers directly.
3. **Deferred removal:** machines marked destroyed are removed at tick end (mirrors
   shapez's `destroyList`), so systems can safely touch them mid-tick.
4. **Fixed timestep:** logic at 30 Hz (accumulator over `performance.now()`), render on
   rAF. Interpolate belt item positions between the last two logic states for smooth
   motion (cheap, since items are just numbers). Speed control = run 0, 1, or 2 ticks per
   frame.
5. **Registry-driven polymorphism:** item ids and machine ids are strings resolved through
   registries — this is what makes savegames safe and mods/examples easy later.
6. **No global mutable state except `root`** (the game root object), analogous to shapez's
   `GameRoot` — everything reachable from one place, easy to serialize and tear down.

### 4.3 Rendering

- Canvas 2D, whole zone drawn every frame (zones are small; no chunk culling needed).
- **Vector art in code** (canvas paths): no images, no atlas, no asset pipeline. Each part
  icon = base shape + fill + pattern stroke (stripes/dots/cross) + optional sub-icons.
  This gives crisp zoom, automatic colorblind patterns, and zero license surface.
- Draw order: grid → layer-1 belts → items on belts → layer-1 machines → layer-2 overhead
  belts + items → layer-2 machines → selection/jam highlights → dock glow.
- DOM (HTML/CSS) for all HUD: toolbar, dock panel, machine card, dialogs, menus. Canvas
  never draws text except tiny in-world labels.
- Camera: pan (drag / arrows / WASD), zoom (wheel / +/-), clamped to zone + margin.
- 60 fps render target; logic is trivial cost at our scale (< 200 items, < 120 machines).

### 4.4 Save system (from day one)

```json
{
  "format": "output.save",
  "version": 1,
  "profile": {
    "tier": "journeyman",
    "coins": 12,
    "upgrades": ["motor2x"],
    "contracts": { "t-a": { "stars": 3, "done": true }, "u1": { "stars": 1 } }
  },
  "active": {
    "contract": "u3",
    "machines": [
      { "t": "saw",   "x": 3, "y": 2, "r": 1, "up": [] },
      { "t": "belt",  "x": 4, "y": 2, "r": 1, "up": ["motor2x"] }
    ],
    "accepted": 3
  },
  "settings": { "sound": false, "motion": "smooth", "theme": "light", "colorblind": true },
  "stats": { "timePlayedSec": 754, "machinesBuilt": 41 }
}
```

- Versioned: `version` field + `migrate_0_to_1(save)` style functions in a chain
  (shapez's 1000→1010 pattern, simplified). Every format change = +1 version + one
  migration + a test that loads a saved fixture of the previous version.
- Items in transit are **not** saved (only machine slots if we care; v1: discard in-flight
  items on save, acceptable since zones are small and hoppers regenerate supply).
  Decision: **discard in-flight items on save** (documented in code); saves capture
  machines + accepted count + coins.
- localStorage key `output.save.v1`; export = download JSON file; import = file picker +
  validation + migration. Corruption → keep last good copy, show "save could not be read"
  (grade-7 wording), never overwrite the old save until the new one parses.

---

## 5. Tech stack and repo setup

| Choice | Value | Rationale |
|---|---|---|
| Language | Modern JS (ES2020+, modules) | shapez shipped ES5 for legacy speed; we target current Chrome/FF/Safari and gain `Map`, `Set`, optional chaining, `structuredClone` |
| Framework | None | Zero deps, zero supply-chain risk, trivially hostable |
| Dev tool | Vite (dev server + build) | Fast iteration; build output is plain static files we can host anywhere |
| Rendering | Canvas 2D + DOM/CSS HUD | Proven by shapez; no WebGL needed at this scale |
| Tests | `node --test` on pure-sim modules (flow, process, items, save) | The simulation is the riskiest code; make it testable headless |
| Lint/format | ESLint + Prettier | Match team habit from shapez repo |
| Type safety | JSDoc + `// @ts-check` + `tsc --noEmit` | Cheap safety without a build-step migration to TS (shapez's exact approach) |
| Hosting | Static files on the edu site (tools page iframe or page) | Per concepts.md §9 |
| Bundle target | < 250 KB JS, < 1 MB total, no images | "Loads in a few seconds" |

---

## 6. Interaction and UX spec

**Placement flow:** click toolbar machine → ghost follows cursor on grid (valid tile =
green tint, invalid = red tint) → click to place → ghost stays for repeat placement
(shift+click or right-click to exit) → `F` rotates ghost → `Esc` cancels.

**Editing:** click a placed machine to select (shows machine card); `Delete`/`Backspace`
or trash button removes it; drag moves it (belt lines re-resolve). `Ctrl+Z` undoes the
last placement/removal (one level deep, v1).

**Camera:** left-drag empty space pans (or arrow keys), wheel zooms, `C` centers on
zone, `0` resets view. (Arrow keys, not WASD, since the QWERTY row selects machines.)

**Speed:** `Space` pause, `F5` = 1x, `F6` = 2x.

**Keyboard map (default, remappable later):**

| Key | Action |
|---|---|
| Q, W, E, R, T, Y, U, I, O | select machine in toolbar (label shown on each toolbar button) |
| F | rotate ghost / selected machine |
| Delete | remove selected |
| Ctrl+Z | undo last placement |
| Space | pause/resume |
| F5 / F6 | 1x / 2x speed |
| C | center camera on zone |
| H | hint |
| M | mute |

Note: letter keys select machines (shown on the toolbar), so they do not clash with the
function-key controls. All bindings are listed in-game under "Help".

**Jam feedback (core teaching moment):**

1. Full machine pulses a soft amber outline.
2. Waiting items render as a short queue behind it (never clipped, never overlapping).
3. Dock rejection: item visibly slides back onto the belt; dock panel flashes "needs:
   {target}" and shows the recipe steps.
4. `H` hint: highlights the full machine, draws a dotted trace upstream to its supply
   source, and shows a one-line suggestion ("The solder station is waiting for a die.
   Check what feeds it.").

**Accessibility (from concepts.md §8):**

- Every item icon: unique **shape + pattern** in addition to color; colorblind mode
  (default on) increases pattern contrast and shows a small letter tag on hover.
- Motion: "smooth" vs "stepped" belt motion toggle; no flashing; respect
  `prefers-reduced-motion` as the default.
- Text: grade-7, no em dashes, no jargon without an in-card explanation.
- All controls available via mouse **and** keyboard; focus states visible.
- Color-blind safe UI palette (no red/green only distinction anywhere).

---

## 7. Data formats (normative)

### 7.1 Contract/level file (`levels/u3.json`)

```json
{
  "id": "u3",
  "tier": "journeyman",
  "name": "Add a battery",
  "zone": { "w": 12, "h": 8 },
  "fixed": [
    { "t": "hopper_ingot", "x": 0, "y": 3, "r": 1 },
    { "t": "hopper_cell",  "x": 0, "y": 5, "r": 1 },
    { "t": "dock",         "x": 11, "y": 4, "r": 0, "target": "mount(solder(copper_coil|silicon_die)|battery_cell)" }
  ],
  "unlocked": ["belt", "saw", "press", "solder", "mounter", "bin", "recycler"],
  "target": { "item": "mount(solder(copper_coil|silicon_die)|battery_cell)", "amount": 8 },
  "stars": { "time2": 240, "machines3": 14 },
  "hint": "A module is a board with a battery. The board still needs a die and a coil.",
  "learn": "adding a part to an assembly"
}
```

Rules: `fixed` machines are immovable; `unlocked` restricts the toolbar; `target.item`
must be a canonical item id; `stars.time2` in seconds, `stars.machines3` = placement
budget.

### 7.2 Machine definition (`src/game/machines.js`)

```js
{
  id: "solder", name: "Solder station",
  size: [1, 1], layer: 1,
  in:  [ { dx: 0, dy: -1, dir: "down" }, { dx: -1, dy: 0, dir: "right" } ],
  out: [ { dx: 1,  dy: 0, dir: "right" } ],
  rate: 1.0, chargeTime: 0.5,
  needs: ["silicon_die", "copper_coil"],      // for 2-input stations
  make:  "solder(copper_coil|silicon_die)",
  canTake: item => item in {die, coil},        // reject predicate
  upgrades: ["motor2x"]
}
```

### 7.3 Item registry entry

```js
{
  id: "solder(copper_coil|silicon_die)",
  name: "Circuit board",
  icon: { base: "rect", color: "boardBlue", pattern: "none",
          sub: [{ part: "silicon_die", at: [-0.25, -0.25] },
                { part: "copper_coil", at: [ 0.25,  0.25] }] },
  steps: ["solder a silicon die with a copper coil"]
}
```

---

## 8. Milestones and tasks

Owners: **Dev** = you + assistant. Teacher = the grade 7 teacher (content/copy review).

### M0 — Scaffold (week 1)

- [ ] Repo setup: Vite, ESLint/Prettier, `tsc --noEmit`, `node --test`, folder tree (§4.1)
- [ ] `core/loop.js` fixed-timestep scheduler + `core/signals.js` + `core/grid.js`
- [ ] Canvas boot, grid render, camera pan/zoom, theme (light/dark)
- [ ] Toolbar with belt only; place/rotate/delete/undo; ghost preview
- [ ] `line.js`: belt lines with incremental extend/split/merge
- [ ] **Definition of done:** place a belt loop, delete a middle tile, lines re-resolve
      correctly with zero visual glitches.

### M1 — Core loop (weeks 1–2) → *prototype gate*

- [ ] Hopper (ingot) emits; `systems/flow.js` advances items with spacing + shared velocity
- [ ] Dock accepts/rejects; contract progress + complete screen
- [ ] Saw + `systems/process.js` handler table + charge timers
- [ ] Tutorial A and B playable end-to-end
- [ ] Headless tests: line flow, spacing, backpressure, saw output, dock rejection
- [ ] **Prototype question from concepts.md:** "Can shapes and elements be modified and
      stuck together cleanly?" → **Definition of done:** a student places a saw, cuts an
      ingot, delivers 10 wafers, no bugs, no clipping, no ghost parts.

### M2 — Full recipe chain (weeks 3–4) → *first playable gate*

- [ ] press, solder, mounter, encap + all 4 hoppers + merger + bin
- [ ] Tutorials C, Units 1–4 content files + balance pass
- [ ] Save/resume (versioned schema, localStorage, export/import)
- [ ] Machine card, jam feedback, hint (H), dock recipe panel
- [ ] Pause/1x/2x speed; reset level
- [ ] **Definition of done:** a new player completes Unit 4 (6 devices delivered) without
      help, in a 30-minute window.

### M3 — Full game (weeks 5–8) → *pilot gate*

- [ ] splitter, overhead conveyor, recycler; Units 5–8
- [ ] Currency + upgrades (motor2x, bin20, dock_express) + shop UI
- [ ] Tiers + stars + sandbox + free contracts
- [ ] Accessibility pass: colorblind patterns, motion toggle, full keyboard, focus states
- [ ] Copy pass: grade-7 reading level, no em dashes, teacher review
- [ ] Save migration test (load a v1 fixture after a schema change)
- [ ] Performance check on a low-spec laptop (Chromebook or 2018 i5): 60 fps at max zone
- [ ] **Definition of done:** one class plays a 30-minute session; all levels completable;
      no data loss on refresh; teacher signs off on text.

### M4 — Release (weeks 9–12)

- [ ] Polish: sounds (code-generated, muted by default), transitions, error screens
- [ ] Teacher docs (`docs/TEACHER.md`: how to launch, how to read a factory, how to
      assign a unit, level file format for authoring)
- [ ] Host on edu/tools page; test from school network + laptop + Chromebook
- [ ] LICENSES.md (record: all code original, all art original, zero external assets)
- [ ] **Definition of done:** live on the tools page; a student on a school laptop
      completes a contract; save files round-trip (download on one machine, upload on
      another).

---

## 9. Testing plan

**Unit (headless, `node --test`):**

- Item canonicalization: `solder(die, coil) === solder(coil, die)`, encoding/decoding
  round-trip, unknown id rejection.
- Line math: extend/split/merge invariants; item spacing never < 0.63 tile; no item
  passes another; velocity conservation (items/s out = items/s in over a steady state).
- Backpressure: full dock → full station → full belt → hopper stops (no items created
  out of thin air; conservation law test: items in world = emitted − accepted − recycled).
- Process: each machine's accept/reject matrix; charge completion across tick boundaries
  (fractional-time carry-over).
- Save: migrate chain (v1→v2 fixture), corruption handling, export/import round-trip.

**Integration (in browser):**

- Per-contract smoke script: load contract, run a known-good factory layout (stored in
  test data), assert target delivered within N simulated seconds. This is the "solvable
  level" guarantee for content review.

**Playtest (human):**

- 12–20 students, grade 9-12, 30-minute session each.
- Observe: time-to-first-success on Tutorial B; where they get stuck; whether jam
  feedback is understood without help; any text they don't understand (verbatim quotes).
- Success thresholds (concepts.md §12): students play outside class; can explain
  "backpressure" or "machine order" in their own words afterwards.
  

---

## 10. Risks and open questions

### Risks (carried from concepts.md §13, with mitigation owners)

| Risk | Likelihood / impact | Mitigation / owner |
|---|---|---|
| IP bleed: accidentally copying shapez names/art/levels | medium | Original names (done), vector art (done), own level data; LICENSES.md audit at M4 / Dev |
| Scope creep | high | Machine list frozen at 13 (§3.2); control tier explicitly deferred / Dev |
| Jam frustration | medium | Readability spec §6 + small zones + teacher watch in M3 / Dev + Teacher |
| Save format breakage | low | Versioned from day one + fixture tests (§4.4) / Dev |
| Low-spec performance | low | Vector art, small zones, 30 Hz sim; M3 perf gate / Dev |
| Reading-level drift | low | Copy pass at M3, grade-7 standard, no em dashes / Teacher |
| Asset licensing (sound) | low | Code-generated tones only; LICENSES.md / Dev |
| "Bounce" feels punitive | medium | Framing: dock shows what it needs; no item loss; no fail state / Dev |

### Open questions (need your answers before M2 where noted)

1. **Item model confirmation (§3.1):** parts + assembly-recipe model (my proposal) vs. a
   grid/quadrant shape model. *Needed before M1 art work.* I strongly recommend the
   recipe model: simpler, original, and it matches your assembly examples exactly.
   *Answer*: Yes, the simpler model is correct, just need to ensure items and components are visually distinctive. I am planning to create PNG art for the pieces, just need to lock in sizes. 
2. **Hopper tiers:** 4 fixed hoppers (one per material) as specified, or a single
   "material hopper" with a selectable output? Fixed is simpler and more teachable.
   *Answer*: 4 fixed hoppers.
3. **Rush orders / timers:** keep fully out of v1 (my recommendation) — stars already give
   an optional speed goal.
   *Answer*: Can be added later as challenges.
4. **Control tier (logic gates):** confirm deferred to post-release (listed under later
   possibilities in concepts.md).
   *Answer*: Correct, initial release without logic gates is easier, and gives students a chance to learn the game- so that when they are introduced they have ideas about how to actually use them.
5. **Playtest cohort:** concepts.md §12 says grades 9–12, but the unit is grade 7. Plan
   assumes **both** (grade 7 primary, 9–12 secondary). Confirm.
   *Answer*: Grade 7-12 will play the game, plus visitors of all ages.
6. **Hosting detail:** iframe vs. dedicated page on edu/tools; do school networks block
   external CDNs? (We use zero external requests, so either way is safe — confirm the
   page URL for the M4 link.)
   *Answer*: Network is safe as long as we ensure no content (fonts, other) is pulled from sources blocked in China.
7. **Sound:** OK to generate all audio with the Web Audio API (no files)? My assumption:
   yes.
   *Answer*: Yes, I will replace sounds later with custom audio. Once built I'd request a list of sounds needed (and desired filenames/types) and I will record or source all audio. 

---

## 11. Immediate next steps

1. Answer open questions 1–7 (a sentence each is enough). 
2. M0 scaffold: I set up the repo, loop, grid, camera, and belt placement; you review the
   ghost-placement feel on a touchpad.
3. M1 spike: implement the line-flow simulation + headless conservation test first (it is
   the riskiest 300 lines), then hopper/saw/dock on top.
4. After M1: 10-minute playtest of Tutorial A/B with one student (or yourself); decide if
   the core loop is fun before building the recipe chain (M2).
