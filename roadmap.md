# Output: Roadmap v3 (from engine prototype to a fun game)

Status: active (updated 2026-10-21 after Paul's decisions D1 to D9)
Replaces: the milestone section of `development-plan.md` (sections 8 and 11) and `game/MILESTONES.md`.
Still valid: `concepts.md` (design intent, Paul's brief), `development-plan.md` sections 1 to 7 except where this document overrides them.
Companion: `docs/power-and-rewards.md` (design in progress, Paul and Claude).

This plan is written for two readers:

- **Paul** decides direction, writes the product tree and progression, plays the builds, and signs off on human gates.
- **The local model** writes all game code, one task at a time, following the working rules in section 9.

---

## 1. Where we are

- **Phase 0 (repair) is done.** Items survive edits, the splitter no longer duplicates, credits are real numbers, conservation is tested (86 tests). Paul played it on 2026-10-21: "it works but of course is extremely barebones." Human gate passed.
- **Deploys work.** Cloudflare Workers Builds (root directory `game`, `wrangler.jsonc` at the repo root) has been green since commit `b5068e6`.
- **Phase 1 (building feels good) is done** (gate passed 2026-10-21).
- **Phase 2 (one growing factory) is built** and waiting for the human gate (see `STATUS.md`).
- **Phase 3 (power and rewards) is built** and waiting for the human gate (see `STATUS.md`).
- **Phase 4 (scale) is built** and waiting for the human gate (see `STATUS.md`). Paul's first playtest (2026-10-22) did not pass the gate: build interactions and the look need a polish pass (section 3b). The polish passes come **before** Phase 5 content.

**Still wrong by design (fixed in Phases 1 and 2):**

- "Choose a contract" level select. The game should hand out the next contract when the last one is done, as in Satisfactory.
- Each level is a separate small factory that freezes when the order is filled. Nothing carries forward.
- No click-and-drag placement. Machines take parts from any side and have no visible ports.
- Items and recipes are hard-coded, so content cannot be changed without code.

---

## 2. The target game

You run one factory that keeps growing. The Order Dock always shows the current contract. Deliver it and you earn credits, and the next contract arrives. At milestones you level up: the plot expands, the camera pulls back to reveal new land and new hoppers, and you choose one of three perks. Credits buy upgrades and power. Machines need power, so growing the factory means growing your power supply too. Storage depots let you stockpile parts and move supply closer to where you need it, which becomes important as products get more complex. A 30-minute class session moves you forward a level or two, and the save carries over.

### Satisfactory and shapez ideas we use (patterns only, no assets)

| Idea | Source | How Output uses it |
|---|---|---|
| Next goal assigned when the last is done | shapez hub levels, Satisfactory HUB milestones | Contract queue in data, auto-advance |
| Rewards unlock capabilities | shapez `tutorial_goals.js` rewards | Contracts and level-ups name their reward |
| Storage that becomes a source | Satisfactory storage containers | Storage depots (D2, D9) |
| Power as a building limit | Satisfactory power grid | Power budget (see `docs/power-and-rewards.md`) |
| Belt speed tiers | both games | Conveyor Mk1, Mk2, Mk3 bought with credits |
| Land that opens up as you progress | Satisfactory exploration | Plot expansions at level-up (D1) |
| Operations on any item | shapez cutter, rotater, stacker | Generic operations with abstract items while building (D5) |
| Production stats | shapez `production_analytics.js` | Items per minute on machine cards and a stats panel |

---

## 3. Decisions (Paul's answers, 2026-10-21)

Paul's words, kept as written:

- **D1:** Expanding plot, grows to a size where the player must zoom out a fair bit to see everything. Expands at completion/leveling milestones. The camera should gently pull out each time, to reveal the new nodes and expanded area.
- **D2:** Fixed hoppers. We'll borrow Satisfactory's storage depots as a way to "create nodes" by routing materials to better locations and having them stack up in different size storage depots.
- **D3:** Credits pay for upgrades, delivered parts reward credits and unlock progression.
- **D4:** Once the game contains all building blocks, most machines, etc I will hand-write the actual sequence of progression and story. The old levels can go, as they are not likely to be useful for testing as we build.
- **D5:** I will draft the entire product tree and sequence as noted. While building and testing it is 100% acceptable, and indeed likely beneficial, to use variables or numbers, IE material 1 and material 2 combine to create item 1, or other even more streamlined process. As long as we have the ability to modify, combine, and other functions then the specific items only matter near the end.
- **D6:** When players level up I'd like them to have a choice of perks adding a secondary reward to the progression. The choices are simple modifiers, but we need to brainstorm the best options for them. One direction we can go is adding a power component that gates how many machines can be built. This adds another way to spend credits (buying solar panels, wind turbines) and also adds to the story element. A player who struggles with power would be thrilled to have a solar panel offered as a level-up choice, and players who have invested in power might instead choose an increase in production speed or "delivery" of a limited-supply node.
- **D7:** There is no sharing of laptops, and 3 slots are not needed. A 'new game' is enough, but we can include challenge modes and achievements to keep it fresh.
- **D8:** Vector art as noted is good. Ideally the materials and products are scalable such that the 'order' received following each completion can show larger products but we can still make out what they are on the conveyor belts as they are processed and combined.
- **D9:** The dock cannot store items, but storage crates/depots can. As players realize that they will be processing materials into more and more complex items they should organically realize the benefits of storing produced items to save for future production.

### What the decisions change in the plan

| Decision | Change |
|---|---|
| D1 | Phase 2 adds plot expansion with a camera pull-out. Rendering must stay fast and readable when zoomed far out (draw only what is visible, simpler drawing at low zoom). |
| D2 | No Intakes. Hoppers are fixed, and new ones appear in expanded land. Storage depots (small, medium, large) arrive in Phase 2: they take parts in, stack them, and feed them out like a hopper. |
| D3 | Credits come from contract deliveries. The shop (credits) sells upgrades, generators and depots. The Market tile is dropped. |
| D4 | Old levels and the level select are deleted in Phase 2. Placeholder contracts drive testing until Paul writes the real progression. Onboarding moves after content (Phase 6), because it is written into Paul's contracts. |
| D5 | Recipes and items move into data in Phase 2 (not Phase 5). Development uses abstract materials (M1, M2...) and operations (modify, combine). Real names and art are a data layer added on top. |
| D6 | New Phase 3: power and rewards, designed together first (`docs/power-and-rewards.md`). Perks are offered at level-up. |
| D7 | One save, plus export and import. Main menu: Continue, New game, Settings, Sandbox. Challenges and achievements go in "Later". |
| D8 | Item icons are built from the recipe tree, so any item can be drawn at belt size (small, simplified) or order size (large, full detail). Needed from Phase 2. |
| D9 | The dock accepts only the current contract's item. Anything else stops at the dock (the jam is the feedback). Depots are the only storage. |

### Open questions (new)

Answers: 
Q1: Operations are open- and once we have a list of the total set of parts and combinations we'll work out recipes.
Q2: We can add dynamic orders that are time-gated to allow for output of stored items or shuffling production to earn extra credits that won't contribute to leveling up. This will keep the game fun.
Q3: Updated.

### Decisions round 2 (Paul, 2026-10-21, before Phase 2)

| # | Decision | Effect on the plan |
|---|---|---|
| R1 | Operations are open (Q1). Phase 2 builds **Cut, Press, Combine, Encase**. Cut and Press work on single parts only, not assemblies. | Phase 2 task 1. Recipes come later, once Paul has the full set of parts. |
| R2 | Side orders (Q2) share **one dock with several slots**: the main contract plus 1 or 2 side orders. | Phase 2 builds the slots. Side orders themselves arrive in Phase 4. |
| R3 | Side orders **appear on a timer and expire gently** (for example a new one every few minutes, gone after about 5 minutes if not filled). No penalty. They pay credits only and never count toward level-ups. | Phase 4 task 2. |
| R4 | A **supply drop** is a full container placed on an open tile. When empty it **becomes a normal depot** the player keeps. | Phase 2 builds depots that can start pre-filled. Phase 3 delivers them as a perk. |
| R5 | Normal hoppers never run out. They have a base rate that upgrades and perks can raise. There are no limited hoppers. | Phase 3 (perks) and Phase 4 (upgrades). |
| R6 | Power story: the city supplies power until a milestone where "we've maxed out what the city will give us". Before that, power shows in the UI but never blocks anything. | Phase 3. Phase 2 does not build power. |

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| Q1 | Should the operations be open (any part can be cut, pressed or joined, like shapez) or limited to a recipe list (like Satisfactory)? | Build the engine open, with an optional recipe list that limits which operations each machine allows. Paul chooses per machine when writing content. | Phase 2 |
| Q2 | Once a contract is filled, extra copies of that product earn nothing. Should old lines keep earning somehow? | Yes, a small amount: the dock pays a reduced rate for any product from a past contract. Without this, old lines become dead weight. | Phase 3 |
| Q3 | Power, level-ups and perk design | Being worked out together in `docs/power-and-rewards.md` | Phase 3 |

---

## 3b. Polish interlude (Paul's playtest, 2026-10-22)

Paul played the Phase 4 build and did not pass its gate. His report (kept as written):

> "machines cannot allow placing and dragging like belts. Machines frequently face the wrong direction, and tapping and dragging to attempt to change direction (may do nothing) results in placing multiple machines at once. The belt design needs updating to 'snake', curving when turning, rather than > awkwardly hitting ^. If you drag to build it- that works. If you delete one piece, then add a belt going the same way, it doesn't connect. I can't seem to get the pressed circles to go through a cutter. We need a polish pass or 3 before I write the story and sequence. I'd like to see belts that appear to move and are smaller than the grid squares, smarter machine directions, rotatable placement via keyboard, new designs/visuals, more of a factory feel than the sterile space it currently is- and graphics that feel more appropriate for an electronics manufacturer."

### Reported defects (fix in P1, each with a regression test first)

1. **Machine drag placing.** Machines do not support drag-to-place the way belts do; tap-dragging to change direction places several machines at once and often does nothing.
2. **Machine direction is wrong on placement.** No smart orientation. Rotatable placement via keyboard is expected while placing and while a machine is selected.
3. **Belt corners render as two straight pieces meeting at a right angle ("> hitting ^").** Corners must be drawn as one curving snake segment.
4. **Belt repair gap.** Delete a belt, then place a new belt continuing in the same direction: the two do not connect. A newly placed belt must auto-connect to a neighbouring belt (or machine input port) that feeds it.
5. **Pressed circles will not enter a Cutter, with no visible reason.** Current rule (`src/game/items.js:13`, `isPart`/`canCut`): "pressing is the last step for a part: a pressed part cannot be cut or pressed again". Q4 answer (Paul, 2026-10-22): **keep the rule**. Fix = the refusal must be visible: an in-game alert naming why the machine cannot process the item (P2).

### Polish wishes (Paul)

- Belts that appear to move (animated tread/chevrons), drawn smaller than the grid square.
- Smarter machine directions.
- Rotatable placement via keyboard.
- New designs and visuals: more of a factory feel, less sterile; graphics appropriate for an electronics manufacturer.

### Draft passes (for Paul to approve or reshape)

- **P1: Build feel.** Items 1, 2, 4 above. Machine drag-to-place with a single ghost, F/R rotate while placing and on selection, smart default direction (face the next placed thing / dock, keep the last rotation like belts), patch-up belts connect. Failing tests first (working rules 2). **Built 2026-10-22** (`src/game/autoDir.js`, `src/game/input.js`, `test/polish-p1.test.js`, 17 tests): smart direction (feeders/followers by port fit, hand rotation with F/R always wins), 8 px drag slop so a jittery tap places one machine, patch-up belts continue the feeding belt, `ghostDir` carries over after single taps.
- **P2: Belt and item look.** Items 3 and 5 above, plus moving belts and under-size belts: snake corners as one curve, belt width about 70% of the tile with the grid visible around it, animated tread, and the accept/reject alert from Q4: a machine that refuses an item says why on the machine, the hover card and a toast.
- **P3: Factory atmosphere.** New visual language in `art/style.js`: floor plate with painted safety markings, grid as a painted factory floor instead of open space, industrial palette, machine bodies with bolts/grilles/status lights, an electronics-manufacturer read (PCB-green parts, copper belts, clean-room steel). Review sheet `?art=1` must cover every machine and item after the change. **Built 2026-10-22** (`src/game/art/style.js` owns all tile art; renderer delegates to it; hoppers/dock/solar/wind redrawn; working-machine animation respects `settings.motion`; `?art=1` now draws every machine idle|working and both generators).

Each pass: automatic checks plus a short human check from Paul. Phase 5 (content) waits until P1 to P3 are done, per Paul's "before I write the story and sequence".

### Open questions (new)

| # | Question | Answer (Paul, 2026-10-22) | Needed by |
|---|---|---|---|
| Q4 | Should a pressed part be cuttable? Current data rule says pressing is terminal. | **No.** Keep the rule (`src/game/items.js`: a pressed part cannot be cut or pressed again). The game must instead show an in-game alert naming why a machine cannot process an item. | P2 |

Paul also approved the pass split: **P1 / P2 / P3 as drafted is the right split.**

---

## 4. Phases

Each phase has: a goal, tasks, **automatic checks** (the model must make these pass) and a **human gate** (only Paul can mark it). A phase is not done until both pass. Sizes are relative: S, M, L.

### Phase 0: Repair and re-baseline (S) ✅ done 2026-10-21

### Phase 1: Building feels good (M) ✅ done 2026-10-21

Goal: placing and fixing a factory is quick and satisfying. This matters more than any new content.

Read first (patterns only): shapez `hud/parts/building_placer_logic.js` (drag, direction lock), `hud/parts/building_placer.js` (ghost preview), `hud/parts/mass_selector.js` (area delete).

Tasks:
1. **Drag to place belts.** Hold left mouse and drag. The path locks to one axis, then turns at the corner when the mouse turns. Each belt points toward the next tile in the drag. Preview the whole path as ghosts before release. Invalid tiles show red with a reason.
2. **Drag to place machines** repeats the machine along the drag (useful for rows of saws).
3. **Delete by right-drag** over an area (box select), plus the existing Delete key. Deleting should be as fast as building.
4. **Rotate before and after placing.** F (and R) rotates the ghost; the last rotation is kept for the next placement. Selecting a placed machine and pressing F rotates it in place without losing its parts.
5. **Pipette.** Middle-click over a placed thing picks that tool with that rotation.
6. **Ports.** Every machine defines input ports and output ports by side (back, left, right, front). Draw them as small arrows on the machine. Parts can only enter through input ports. Belts that end at a wrong side show a red marker.
7. **Smooth motion.** Interpolate item positions between ticks (render alpha from the loop). No jitter at 60 fps.
8. **Undo and redo** with a stack of at least 50 actions, including drags and area deletes as single steps.
9. **Hover info.** Hovering any tile shows a small tooltip: name, what it takes, what it makes, state (working, waiting for input, output blocked).
10. **Machine states at a glance.** Working: gentle pulse. Waiting for input: dim. Output blocked: amber outline. These replace the "!" badge.

Not in this phase: the level select and old levels stay as they are until Phase 2 removes them. Do not build power, perks or contracts yet.

Automatic checks: unit tests for the drag path builder (straight, one corner, back-tracking, through blocked tiles), ports accept and reject, undo/redo round trips, rotating a machine in place keeps its parts. Frame time under 8 ms with 300 items on screen (logged by a `?perf=1` overlay).
Human gate: Paul draws a 20-tile belt with two corners in one drag, rebuilds a broken line in under 30 seconds, and says it "feels right".

### Phase 2: One growing factory (L)

Goal: the structural change. One plot that grows, contracts that arrive on their own, content in data.

Read first: shapez `hub_goals.js`, `modes/regular.js` (goal list with growing amounts and rewards), `hud/parts/unlock_notification.js`, `hud/parts/pinned_shapes.js`, `game/map_chunk_view.js` (drawing only what is visible).

Tasks:
1. **Abstract items and open operations (D5, R1).** Raw materials `m1` to `m4`, each with a color. Four operation machines:
   - **Cutter:** one part in, two halves out (`cut(m1)`). Parts only, not assemblies.
   - **Press:** one part in, one reshaped part out (`press(m1)`). Parts only, not assemblies.
   - **Combiner:** any two items in, one assembly out (`join(a|b)`, children sorted as today).
   - **Encaser:** one assembly plus one shell part in, one product out (`case(assembly|shell)`). Which parts count as shells is a list in data.

   Item ids stay canonical strings. A `data/items.json` name layer can give any id a real name and art later; ids without a name show a generated label (for example "M1, cut twice"). Set a depth limit in config (for example 4 levels) so the item space stays testable.
2. **Operations in data.** `data/operations.json` describes each operation (inputs, rule, time, power cost for later). Remove the hard-coded handlers for each item. Leave a hook for an optional recipe list per machine, but do not build recipes yet (R1).
3. **Icons from the recipe tree (D8).** One drawing function builds any item from its tree: material color plus form shape for parts, nested layout for assemblies. Two levels of detail: belt size (simple silhouette plus color) and order size (full tree visible). Test page `?art=1` shows every item at both sizes.
4. **Contracts as data** in `data/contracts.json`: `{ id, title, brief, requires: { item, amount }, credits, unlock?, milestone? }`. Ordered list. Validate on load. Ship about 15 placeholder contracts using abstract items, enough to test the loop. Paul replaces them later (D4).
5. **Order Dock.** A fixed 2x2 building with order slots (R2): one main contract slot and up to 2 side order slots. It accepts an item only if an open slot needs it; anything else stops at the dock (D9). The dock panel shows each slot (large icon from task 3), progress, and credits on offer. When the main contract is filled: short celebration, credits paid, next contract appears. No menu in between. In Phase 2 only the main slot is used; build the slot list so side orders (Phase 4) need no dock changes.
6. **Plot expansion (D1).** Contracts marked `milestone` grow the plot. The camera eases out over about 2 seconds to show the new area and its new hoppers. Hoppers are fixed (D2) and placed by the expansion data.
7. **Storage depots (D2, D9, R4).** Small, medium and large depots (for example 50, 200, 1000 parts, one item type each). Parts go in from any input port and come out of the output port when there is room, so a full depot works like a hopper placed wherever you need it. The panel shows contents and fill level. A depot can be created pre-filled (item and amount) on any open tile; this is how supply drops will arrive in Phase 3. An empty pre-filled depot is just a normal depot.
8. **Zoomed-out play.** Draw only visible tiles. Below a zoom threshold, draw belts as lines and items as dots of their color. Must hold 50 fps at the largest plot size with 1000 items.
9. **One save (D7).** Save v3: plot size, machines, belts, items in transit, depot contents, contract index, credits, unlocks. Export and import stay. Main menu: Continue, New game, Settings, Sandbox. Delete the level select and `levels/*.json` (D4).

Automatic checks: a headless run of all placeholder contracts using reference layouts in `test/fixtures/`; save, reload and continue gives the same state; depot conservation (parts in = parts stored + parts out); operation rules (Cutter and Press refuse assemblies, Encaser refuses non-shell parts, depth limit enforced, `join(a|b)` equals `join(b|a)`); every item id in contracts can be made from raw materials with the machines unlocked by then; frame time check at the largest plot.
Human gate: Paul plays from a new game through the first expansion without opening a menu, and wants to see the next contract.

**Fun checkpoint.** After Phase 2, Paul and one or two students play for 20 minutes. If it is not fun yet, fix that before adding systems. Write what was learned in `STATUS.md`.

### Phase 3: Power and rewards (M)

Goal: a second thing to manage and a reason to look forward to level-ups.

**Design:** `docs/power-and-rewards.md` (ready to build, 2026-10-21). Built 2026-10-21; see `STATUS.md`.

Likely tasks (to be confirmed by the design doc): power meter from the start with city supply (R6), the city cap milestone, solar and wind in the credits shop, placement blocked over the limit, level-ups with a perk choice of 1 of 3, the perk list as data, supply drops as pre-filled depots (R4), power and perk tests.

### Phase 4: Scale (M)

Goal: bigger numbers, faster lines, real choices.

Read first: shapez `hud/parts/shop.js`, `hud/parts/statistics.js`, `production_analytics.js`.

Tasks:
1. **Upgrades** bought with credits (D3): Conveyor Mk2 and Mk3 (2, 4, 8 parts per second), machine speed tiers, hopper rate tiers, bigger depots.
2. **Side orders (R2, R3).** A new side order appears in a free dock slot every few minutes and expires gently after about 5 minutes. It asks for an item the player can already make, pays credits only, and never counts toward level-ups. This gives stored parts and old lines a use.
3. **Standing orders.** Some contracts ask for a rate ("6 per minute for 3 minutes"). The dock shows a live rate meter.
4. **One-use boosts** bought with credits: "Overdrive: all machines 2x for 60 seconds".
5. **Stats panel:** items per minute made and delivered for each item, last 5 minutes.
6. **Machine card shows rates:** "Cutter: 30 in per minute, 60 out per minute". This is where ratios get taught without a lesson.

Automatic checks: each upgrade changes exactly what it says; rate meter accuracy against a known layout; economy simulation shows the first upgrade is affordable within 2 contracts of appearing; side orders never offer an item the player cannot make yet and never add level progress.
Human gate: Paul upgrades belts and feels the factory speed up. A standing order makes him rebuild a line for more throughput.

### Phase 5: Content (Paul writes, the model builds) (L)

Goal: the real game. Paul writes the product tree, names, story and contract sequence (D4, D5). The model turns it into data and proves every contract can be done.

Tasks:
1. Paul delivers the product tree and sequence (any format: a table or list is fine).
2. The model fills `data/items.json` (names and art notes), `data/recipes.json`, `data/contracts.json`, and the expansion and hopper layout.
3. A reference solution for every contract in `test/fixtures/`, run headless.
4. Item art for every named product (the generated icons from Phase 2 are the fallback).

Automatic checks: every contract solvable by its reference layout; every item reachable; no recipe makes an item nothing uses (except final products).
Human gate: Paul plays from the start to the middle of the game across two or three sessions and still wants to continue.

### Phase 6: Onboarding inside the contracts (M)

Goal: a grade 7 student learns by playing, with almost no reading. This comes after Phase 5 because the guidance is written into Paul's contracts.

Read first: shapez `hud/parts/interactive_tutorial.js`, `hud/parts/tutorial_hints.js`.

Tasks:
1. Early contracts carry **guided steps** in their data: `steps: [{ when, show, highlight }]`. Example: "Drag a conveyor from the hopper to the dock" with pulsing arrows. Each step disappears when done.
2. Steps appear only for the first contract that teaches each idea.
3. **Jam help** (the H key, plus a button after 20 seconds with no progress): highlights the stuck machine and traces upstream to the cause in plain words.
4. **Recipe view** on the dock: the target product as a tree of icons with the machine for each step.
5. Every line of text checked: grade 7, short sentences, no em dashes (automated test on all data files).

Automatic checks: a scripted player that follows only the highlights completes every guided contract.
Human gate: a student who has never seen the game finishes the first five contracts in 10 minutes without adult help.

### Phase 7: Art, audio and UI polish (M)

Tasks:
1. **Art kit:** all colors, shapes and line weights in `game/src/art/style.js`. Every item and machine drawn from it.
2. **HUD redesign:** contract panel (top left), toolbar with machine icons and key labels (bottom center), credits and power (top right), pause and speed. No text-only buttons in the playfield.
3. **Animations:** parts slide into machines and pop out, the dock accepts with a small bounce, contract and level-up celebrations, expansion reveal.
4. **Audio:** Web Audio placeholders for every event through one `sound.js` with a manifest. Deliver `AUDIO.md` listing every sound, when it plays, suggested length, and the file name Paul should use (for example `belt_place.ogg`). Dropping files into `public/audio/` replaces the placeholders.
5. Light and dark themes from the style file. Colorblind mode checked with a simulator.

Automatic checks: every item and machine id has a drawing; bundle under 250 KB JS.
Human gate: Paul shows it to someone who has not seen it, and they think it is a real game.

### Phase 8: Pilot and release (M)

Tasks: performance on a low-spec Chromebook (50 fps at the largest plot), keyboard play, motion setting, save export and import across machines, teacher notes (`docs/TEACHER.md`), class playtest, fixes from it, link from edu/tools with no external requests.

Human gate: one class plays for 30 minutes, no data loss, students ask to keep playing.

### Later (after release, not before)

Challenge modes and achievements (D7), logic tier (sensors, relays, gates), blueprints (copy and paste areas), teacher level editor, shareable factories.

---

## 5. What changes in the code structure

| Now | After |
|---|---|
| `levels/*.json` + level select | `data/contracts.json` + auto-advance, one save |
| `HANDLERS` with hard-coded recipes | Operations + `data/recipes.json` + `data/items.json` name layer |
| Hand-drawn icons per item | Icons generated from the recipe tree, two levels of detail |
| Single-tile dock with exact target | 2x2 Order Dock, current contract only |
| Bin (10 parts) | Storage depots, three sizes, act as sources |
| Fixed zone per level | One plot that expands at milestones |
| Inputs from any side | Port definitions per machine |
| Save v2 per level | Save v3, one factory |

---

## 6. Art direction and control

Vector art stays (D8). Control comes from data, not PNGs:

- **One style file** (`art/style.js`): palette tokens, outline width, corner radius, shadow, the color for every material and the shape for every form. Change a value, every sprite follows.
- **Fixed sizes:** a tile is 64 logical px. Items draw in a 28 px box on the belt. Order panel icons are 96 px. Machines fill the tile with a 4 px inset. Ports are 10 px arrows on the edge.
- **Two levels of detail (D8):** at belt size an item shows its outer silhouette and main color, enough to tell it apart from neighbors. At order size the whole tree is visible (the parts inside the assembly).
- **Recognition rule:** every material has one color and one pattern. Every processed form keeps its material's color and changes shape.
- **Review sheet:** `?art=1` draws every item and machine at both sizes, in both themes and in colorblind mode.

---

## 7. Product tree

Paul writes this (D5). Until then the game uses abstract materials `m1` to `m4` and the operations in Phase 2 task 1. The earlier draft (silicon, copper, boards, robot kit) is kept only as an example of the shape the tree should have: shared intermediate parts used by several products, so a well-built line feeds more than one product.

---

## 8. Things not to do

- No shapez or Satisfactory code, art, names, level layouts or UI text. Patterns only. Keep a short note in `LICENSES.md` at release.
- No new machines or items outside a phase that asks for them.
- No external fonts, scripts or CDNs (must work in China).
- No em dashes in any text the player sees.
- Do not start Phase N+1 work while Phase N's automatic checks fail.
- Do not start Phase 3 until `docs/power-and-rewards.md` is marked "ready to build" by Paul.

---

## 9. Working rules for the local model

1. Start each session by reading `STATUS.md` and the current phase in this file. Work on one numbered task at a time.
2. For bugs: write a failing test first, then fix it.
3. For features: write the automatic check named in the phase, then build until it passes. Run `npm test` and `npm run build` before ending.
4. Update `STATUS.md` at the end of every session: what changed, which tests were added, what is next, anything that went wrong.
5. **Never tick a human gate.** Write "ready for human gate" and stop. Only Paul marks gates passed.
6. If a task needs a design decision that is not in this file, `concepts.md` or a design doc in `docs/`, stop and add it to the "Questions for Paul" list in `STATUS.md`. Do not guess.
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
