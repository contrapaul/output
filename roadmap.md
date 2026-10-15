# Output: Roadmap v2 (from engine prototype to a fun game)

Status: draft for review (2026-10-15)
Replaces: the milestone section of `development-plan.md` (sections 8 and 11) and `game/MILESTONES.md`.
Still valid: `concepts.md` (design intent, Paul's brief), `development-plan.md` sections 1 to 7 except where this document overrides them.

This plan is written for two readers:

- **Paul** decides direction, plays the builds, and signs off on human gates.
- **The local model** writes all game code, one task at a time, following the working rules in section 9.

---

## 1. Where we are

**Keep (solid):** the belt line engine (`line.js`, `flow.js`), the tail-first flow with backpressure, the recipe-string item model, the fixed 30 Hz tick, versioned saves with migrations, the zero-dependency static build.

**Broken (fix first):**

| Bug | Where | Effect |
|---|---|---|
| Any placement wipes all belt items | `root.js _rebuildFlowLines()` clears every FlowLine and makes new empty ones | Building while the factory runs destroys parts |
| Splitter duplicates parts | `process.js HANDLERS.splitter` returns two copies | Creates parts from nothing, wrong lesson, breaks units 5 and 8 |
| Credits earned shows NaN | `root.js` uses `coinsEarnHere` and `coinsEarnedHere` | Wrong number on the complete screen |
| No click-and-drag belt placement | `input.js` places one tile on mouse up | Building a line is slow and tedious |

**Wrong by design (change):**

- "Choose a contract" level select. The game should hand out the next contract when the last one is done, as in Satisfactory.
- Each level is a separate small factory that freezes when the order is filled. Nothing carries forward, so nothing grows.
- 10 items in one straight chain. There is no room to scale.
- Machines take parts from any side and have no visible ports.
- Status docs claim milestones are met when the human checks never happened.

---

## 2. The target game (one paragraph)

You run one factory plot that keeps growing. The Order Terminal (the dock, upgraded) always shows your current contract. Deliver it and the next contract arrives, along with a reward: a new machine, a bigger plot, a faster belt, or a perk choice. Early contracts are tiny and teach one idea each (they replace the tutorial levels). Later contracts ask for more parts, new products built from parts you already make, and steady rates ("keep 6 boards per minute flowing"). Your old lines keep running and keep paying, so the factory you built an hour ago still matters. A 30-minute class session moves you forward a tier, and the save carries over to the next session.

### Satisfactory and shapez ideas we use (patterns only, no assets)

| Idea | Source | How Output uses it |
|---|---|---|
| Next goal assigned when the last is done | shapez hub levels, Satisfactory HUB milestones | Contract queue in data, auto-advance |
| Rewards unlock capabilities | shapez `tutorial_goals.js` rewards | Each contract names its reward |
| Pay for upgrades with products | shapez upgrade shop, Satisfactory milestones | Upgrades cost delivered parts (see decision D3) |
| Resource nodes and extractors | shapez `systems/miner.js`, Satisfactory nodes | Supply nodes on the plot, Intakes placed on them |
| Belt speed tiers | both games | Conveyor Mk1, Mk2, Mk3 as upgrades |
| Land that opens up as you progress | Satisfactory exploration | Plot expansions as rewards |
| A sink that buys anything | Satisfactory AWESOME sink | Market tile: any finished product earns credits |
| Production stats | shapez `production_analytics.js` | Items per minute on machine cards and a stats panel |

---

## 3. Decisions for Paul (needed before the phase noted)

Each has a recommendation. A one-line answer is enough.

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| D1 | Map: fixed large plot, or a plot that expands as a reward? | Expanding plot. Starts about 16x12, grows in steps to about 48x32. It feels like growth and keeps performance safe. | Phase 2 |
| D2 | Raw materials: fixed hoppers at the edge, or supply nodes the player builds Intakes on? | Nodes plus Intakes. Placing your own source is where the scaling starts (more Intakes, faster Intakes). | Phase 2 |
| D3 | What pays for upgrades: credits, or delivered parts? | Both. Contracts and upgrades cost parts (Satisfactory style, ties economy to production). Credits come from the Market and buy perks and one-use boosts. | Phase 4 |
| D4 | Keep the old hand-built levels? | Turn the tutorial ones into the first contracts. Keep the rest as optional "Challenges" (bounded puzzles) after release. | Phase 2 |
| D5 | Product tree (section 7 draft) | Paul edits names and recipes. The engine only needs the shape of the tree locked. | Phase 5 |
| D6 | Perks ("rogue-like choices" from the brief): how many, and do they reset? | Pick 1 of 3 at the end of each tier. Kept for the save. Never required. | Phase 4 |
| D7 | Save slots | 3 named slots plus export/import. Class laptops get shared. | Phase 2 |
| D8 | Art control (see section 6) | Vector art driven by one style file Paul can edit, plus an optional PNG override per sprite. | Phase 6 |
| D9 | The brief says the dock bounces wrong items back. With one growing factory and upgrades paid in parts, should the Terminal store non-contract parts instead? | Store them. Wrong parts still show clearly in the terminal panel ("not needed now, stored"), but they no longer jam the main line. Keep the bounce rule for Challenges. | Phase 2 |

---

## 4. Phases

Each phase has: a goal, tasks, **automatic checks** (the model must make these pass) and a **human gate** (only Paul can mark it). A phase is not done until both pass. Sizes are relative: S, M, L.

### Phase 0: Repair and re-baseline (S)

Goal: the engine does what the docs say, and the docs tell the truth.

Tasks:
1. Fix the item wipe. Placing or removing a belt must keep every item on lines that did not change. On a split, items go to the piece that now holds their tile. On a merge, items join in order with their distances shifted. Items on a removed tile go back to the player's stock (or are deleted with a short "part removed" puff; pick one and document it).
2. Fix the splitter. One part in, one part out, sent to the next output that has room (alternating when both have room).
3. Fix the `coinsEarnHere` typo.
4. Add regression tests: edit while running (place, remove, rotate in the middle of a full line), a conservation test that includes the splitter, merger, bin and recycler, and a test for the credits earned value.
5. Make one `STATUS.md` (template in section 9), and delete the status sections from `game/README.md` and `game/MILESTONES.md`.

Automatic checks: all tests pass, including a new conservation test: `items in world = emitted - delivered - recycled` after 5 minutes of a random edit script on the sandbox.
Human gate: Paul builds a line, edits it while parts are moving, and nothing vanishes.

### Phase 1: Building feels good (M)

Goal: placing and fixing a factory is quick and satisfying. This matters more than any new content.

Read first (patterns only): shapez `hud/parts/building_placer_logic.js` (drag, direction lock), `hud/parts/building_placer.js` (ghost preview), `hud/parts/mass_selector.js` (area delete).

Tasks:
1. **Drag to place belts.** Hold left mouse and drag. The path locks to one axis, then turns at the corner when the mouse turns. Each belt points toward the next tile in the drag. Preview the whole path as ghosts before release. Invalid tiles show red with a reason.
2. **Drag to place machines** repeats the machine along the drag (useful for rows of saws).
3. **Delete by right-drag** over an area (box select), plus the existing Delete key. Remove the "no cost, no friction" gap: deleting should be as fast as building.
4. **Rotate before and after placing.** F (and R) rotates the ghost; the last rotation is kept for the next placement. Selecting a placed machine and pressing F rotates it in place without losing its parts.
5. **Pipette.** Middle-click or Q over a placed thing picks that tool with that rotation.
6. **Ports.** Every machine defines input ports and output ports by side (back, left, right, front). Draw them as small arrows on the machine. Parts can only enter through input ports. Belts that end at a wrong side show a red marker.
7. **Smooth motion.** Interpolate item positions between ticks (render alpha from the loop). No jitter at 60 fps.
8. **Undo and redo** with a stack of at least 50 actions, including drags and area deletes as single steps.
9. **Hover info.** Hovering any tile shows a small tooltip: name, what it takes, what it makes, state (working, waiting for input, output blocked).
10. **Machine states at a glance.** Working: gentle pulse. Waiting for input: dim. Output blocked: amber outline. These replace the "!" badge.

Automatic checks: unit tests for the drag path builder (straight, one corner, back-tracking, through blocked tiles), ports accept and reject, undo/redo round trips. Frame time under 8 ms with 300 items on screen (logged by a `?perf=1` overlay).
Human gate: Paul draws a 20-tile belt with two corners in one drag, rebuilds a broken line in under 30 seconds, and says it "feels right".

### Phase 2: One growing factory with assigned contracts (L)

Goal: the structural change. No more level select. One plot, a contract queue, rewards.

Read first: shapez `hub_goals.js`, `modes/regular.js` (goal list with growing amounts and rewards), `systems/miner.js`, `hud/parts/unlock_notification.js`, `hud/parts/pinned_shapes.js`.

Tasks:
1. **Contracts as data** in `game/data/contracts.json`: `{ id, tier, title, brief, requires: [{ item, amount }], reward: { unlock?, expand?, upgrade?, perkChoice? }, hint }`. Ordered list. Validate on load (known items, reachable with machines unlocked so far).
2. **Order Terminal.** The dock becomes a fixed 2x2 building on the plot that accepts anything from any side. Parts that match the current contract count toward it. Everything else goes into storage (counts for later upgrades, see D3) instead of jamming the belt. The terminal panel always shows the current contract, progress bars, and the reward.
3. **Auto-advance.** When a contract is filled: short celebration, reward applied, unlock card ("New machine: Solder station. It joins a die and a coil into a board."), next contract appears. No menu in between.
4. **Supply nodes and Intakes** (if D2 accepted). Nodes are fixed on the plot (silicon, copper, battery, housing at first). The Intake is placed on a node and outputs at a set rate. Remove fixed hoppers.
5. **Plot expansions** (if D1 accepted). The plot grows by rings or sides as contract rewards. New nodes appear in new land.
6. **Persistent save v3.** One plot per slot: machines, belts, items in transit (now cheap to save, since the engine keeps them), contract index, storage, unlocks. Migrate v2 saves by starting a new plot and keeping credits.
7. **Main menu** becomes: Continue, New factory, Load (slots), Settings, Sandbox. Level select removed.
8. **First 12 contracts** (Novice tier) rebuilt from the tutorial levels: move ingots, cut wafers, cut dies, press coils, merge two lines, solder a board, and so on. One new idea per contract.

Automatic checks: a headless run of the first 12 contracts using reference layouts stored in `test/fixtures/` (each contract must complete within a set number of simulated minutes). Save, reload, and continue gives the same state, items in transit included.
Human gate: Paul plays from a new factory to the end of Novice without opening a menu, and wants to see the next contract.

**Fun checkpoint.** After Phase 2, Paul and one or two students play for 20 minutes. If it is not fun yet, fix that before adding content (go back to Phase 1 items or contract pacing). Write what was learned in `STATUS.md`.

### Phase 3: Onboarding inside the contracts (M)

Goal: a grade 7 student learns by playing, with almost no reading.

Read first: shapez `hud/parts/interactive_tutorial.js`, `hud/parts/tutorial_hints.js`.

Tasks:
1. Early contracts carry **guided steps** in their data: `steps: [{ when, show, highlight }]`. Example: "Drag a conveyor from the Intake to the Terminal" with a pulsing arrow on the Intake and the Terminal. Each step disappears when the player has done it.
2. Steps only appear for the first contract that teaches each idea. Later contracts just show the brief and the recipe.
3. **Jam help** (the H key, plus a button that appears after 20 seconds with no progress): highlights the stuck machine and traces upstream to the cause in plain words.
4. **Recipe view** on the terminal: the target product as a tree of icons (board = die + coil, soldered), with the machine for each step.
5. Every line of text checked: grade 7, short sentences, no em dashes (keep the automated test that rejects em dashes in all data files).

Automatic checks: every contract with steps can be completed by a scripted player that follows only the highlights.
Human gate: a student who has never seen the game reaches contract 6 in 10 minutes without adult help.

### Phase 4: Scale and economy (M)

Goal: the reason to keep building. Bigger numbers, faster lines, real choices.

Read first: shapez `hud/parts/shop.js`, `hud/parts/statistics.js`, `production_analytics.js`.

Tasks:
1. **Upgrades** paid in delivered parts or credits (per D3): Conveyor Mk2 and Mk3 (2, 4, 8 parts per second), Intake Mk2 and Mk3, machine speed tiers, bigger bins. Upgrades apply to the whole factory, like shapez.
2. **Standing orders.** From Journeyman on, some contracts ask for a rate ("6 boards per minute for 3 minutes"). The terminal shows a live rate meter.
3. **Market tile.** Buys any finished product for credits, forever. Gives old lines a purpose.
4. **Perks** (per D6): at the end of each tier, choose 1 of 3. Examples: "Saws make 3 wafers from 1 ingot", "Bins hold 30", "Intakes on copper run 50% faster". Each one is a small data-driven modifier.
5. **One-use boosts** bought with credits: "Overdrive: all machines 2x for 60 seconds".
6. **Stats panel:** items per minute made and delivered for each item, last 5 minutes.
7. **Machine card shows rates:** "Saw: 30 ingots in per minute, 60 wafers out per minute". This is where ratios get taught without a lesson.

Automatic checks: modifier tests (each perk and upgrade changes exactly what it says), rate meter accuracy against a known layout, economy simulation that checks a player can afford the first upgrade within 2 contracts of it appearing.
Human gate: Paul upgrades belts and feels the factory speed up. A standing order makes him rebuild a line for more throughput.

### Phase 5: Content: the product tree and four tiers (L)

Goal: enough to play for many hours, built from data only.

Tasks:
1. **Recipes as data** in `game/data/recipes.json`: `{ machine, inputs: [...], outputs: [...], time }`. Remove the hard-coded handlers for each item. A 2-input station accepts a part only if some recipe it knows could still be finished with it.
2. Add the items and machines from section 7 (after Paul's edits, D5).
3. Write all contracts for Novice, Journeyman, Engineer, Plant Manager (about 40 total). Amounts grow like shapez: tens early, hundreds late.
4. A **reference solution** for every contract in `test/fixtures/`, run headless in CI.
5. Sandbox mode: everything unlocked, infinite plot, no contracts.

Automatic checks: every contract solvable by its reference layout; every item reachable from raw materials with the machines unlocked by then; no recipe produces an item nothing uses (except final products).
Human gate: Paul plays from Novice to the middle of Engineer across two or three sessions and still wants to continue.

### Phase 6: Art, audio and UI polish (M)

Goal: looks and sounds like a finished game. Paul has control over the look.

Tasks:
1. **Art kit** (section 6): all colors, shapes and line weights in `game/src/art/style.js`. Every item and machine drawn from it.
2. **PNG override** hook: if `public/sprites/<id>.png` exists, draw it instead of the vector version.
3. **HUD redesign:** contract panel (top left), toolbar with machine icons and key labels (bottom center, shapez style), credits and storage (top right), pause and speed (top right). No text-only buttons in the playfield.
4. **Animations:** parts slide into machines and pop out, terminal accepts with a small bounce, contract complete celebration, unlock card.
5. **Audio:** Web Audio placeholders for every event, played through one `sound.js` with a manifest. Deliver `AUDIO.md` listing every sound, when it plays, its suggested length, and the file name Paul should use (for example `belt_place.ogg`, `contract_complete.ogg`). Dropping files into `public/audio/` replaces the placeholders.
6. Light and dark themes from the style file. Colorblind mode checked with a simulator.

Automatic checks: every item and machine id has a drawing; no PNG is required to run; bundle under 250 KB JS without optional PNGs.
Human gate: Paul shows it to someone who has not seen it, and they think it is a real game.

### Phase 7: Pilot and release (M)

Tasks: performance on a low-spec Chromebook (50 fps with the largest plot), keyboard play, motion setting, save export and import across machines, teacher notes (`docs/TEACHER.md`: how to start, how a 30-minute class session maps to tiers), class playtest, fixes from it, deploy to edu/tools with no external requests.

Human gate: one class plays for 30 minutes, no data loss, students ask to keep playing.

### Later (after release, not before)

Logic tier (sensors, relays, gates), Challenges (bounded puzzle levels, rush orders), blueprints (copy and paste areas, a late unlock reward), teacher level editor, shareable factories.

---

## 5. What changes in the code structure

| Now | After |
|---|---|
| `levels/*.json` + level select | `data/contracts.json` + auto-advance; old levels kept as `data/challenges/` for later |
| `HANDLERS` with hard-coded recipes | `data/recipes.json` + a generic station handler |
| Fixed hoppers | Supply nodes + Intake machine |
| Single-tile dock with exact target | 2x2 Order Terminal + storage |
| `_rebuildFlowLines()` on every edit | Flow state carried through line split and merge |
| Inputs from any side | Port definitions per machine |
| `art.js` + renderer drawing inline | `art/style.js` + `art/items.js` + `art/machines.js`, PNG override |
| Save v2 per level | Save v3 per factory slot |

---

## 6. Art direction and control

Vector art stays, if it is good. The PNG idea was about control, so the plan gives control without PNGs:

- **One style file** (`art/style.js`): palette tokens, outline width, corner radius, shadow, the shape and pattern for every material. Change a value, every sprite follows.
- **Fixed sizes:** a tile is 64 logical px. Items draw in a 28 px box centered on the belt. Machines fill the tile with a 4 px inset. Ports are 10 px arrows on the edge. PNG overrides are 2x (128 px per tile, 56 px per item) with a transparent background.
- **Recognition rule:** every material has one silhouette, one color and one pattern. Every processed form keeps its material's color and changes shape (ingot to wafer to die gets flatter and smaller).
- **Review sheet:** a `?art=1` page that draws every item and machine at 1x and 2x, in both themes and in colorblind mode, so Paul can review the whole set at once.

---

## 7. Product tree (draft for Paul to edit)

Raw (from supply nodes): silicon ingot, copper wire, battery cell, housing, plastic pellet (Engineer), glass pane (Plant Manager).

| Tier | New items | New machines | Example finished products |
|---|---|---|---|
| Novice | wafer, die, coil | Intake, Conveyor, Saw, Coil press, Merger | dies, coils |
| Journeyman | circuit board, module, device | Solder station, Assembler, Encapsulation, Splitter, Bin | device |
| Engineer | plastic sheet, LED, motor, light bar | Molder, Overhead conveyor, Recycler | flashlight (housing + battery + LED), fan (housing + motor + board) |
| Plant Manager | display, controller, robot arm | Fabricator (3 inputs) | tablet (display + module + housing), robot kit (controller + 2 motors + housing) |

The robot kit gives a direct link to the grade 7 LEGO engineers unit. Shared parts (boards, motors, LEDs) are reused across products, so a well-built board line feeds several later products. That reuse is what makes scaling interesting.

---

## 8. Things not to do

- No shapez or Satisfactory code, art, names, level layouts or UI text. Patterns only. Keep a short note in `LICENSES.md` at release.
- No new machines or items outside a phase that asks for them.
- No external fonts, scripts or CDNs (must work in China).
- No em dashes in any text the player sees.
- Do not start Phase N+1 work while Phase N's automatic checks fail.

---

## 9. Working rules for the local model

1. Start each session by reading `STATUS.md` and the current phase in this file. Work on one numbered task at a time.
2. For bugs: write a failing test first, then fix it.
3. For features: write the automatic check named in the phase, then build until it passes. Run `npm test` and `npm run build` before ending.
4. Update `STATUS.md` at the end of every session: what changed, which tests were added, what is next, anything that went wrong.
5. **Never tick a human gate.** Write "ready for human gate" and stop. Only Paul marks gates passed.
6. If a task needs a design decision that is not in this file or `concepts.md`, stop and add it to the "Questions for Paul" list in `STATUS.md`. Do not guess.
7. Keep files under about 500 lines. Split by system when they grow.
8. Read the shapez files named in each phase for ideas. Do not copy code from them.

### `STATUS.md` template

```markdown
# Status
Current phase: N (name)
Current task: N.x

## Automatic checks
- [ ] check ... (passing / failing, test file)

## Human gate
- [ ] gate text (only Paul ticks this)

## Last session
- changed:
- tests added:
- problems:

## Questions for Paul
- ...
```
