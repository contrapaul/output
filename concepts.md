
# Educational Shape-Factory Puzzle Game — Planning Template

> Use this worksheet to turn the initial idea into a buildable game plan. Replace the prompts in brackets, keep what is useful, and remove sections that do not apply. The goal is an original game that uses approachable shape-manipulation and factory-puzzle ideas—not a copy of another game's name, art, levels, UI, or other distinctive material.

## 1. One-sentence pitch

**Working title:** Output

**Elevator description:** shapez.io with a Shenzhen spin- more focused on (fake) electronics devices, while retaining the scaling complexity but inherent approachability. Includes elements of how Satisfactory works. 

## 2. Purpose and audience

- **Website / course context:** games repo, linked on edu/tools. Used as a fun device during grade 7 lego engineers unit to help understand production lines or machines working with other machines to automate production. 
- **Primary players:** Middle and high school students
- **Optional secondary audience:** Teachers, visitors to the site
- **Player need or problem:** A worksheet shows a finished production line as a static diagram. This game lets students build the line themselves, watch parts move through it, and see instantly when a wrong machine, wrong order, or a dead end stops the flow. It is worth playing because it is interactive (you can break things and fix them), low stakes (a messy first attempt costs nothing), and replayable (the same idea can be tried faster or cleaner).
- **Play setting:** Anytime for fun, during specific classes, during recess
- **Typical session length:** 30 minutes

## 3. Player experience

- **Player fantasy / role:** Player is constructing the factory to grow their company, then expand the scale to address new contracts.
- **Setting and premise:** More and more complicated products are made as the player proves how suitable they are and how they can be trusted to produce products as ordered. Products ordered grow from simple modified elements to complex builds. IE 'cut in half', grows to 'combine silicon and copper, run through soldering machine, add battery, place in enclosure', grows even more. 
- **Desired feelings:** Player feels like a clever planner and efficient at managing the processing.
- **Progression payoff:** Customization elements and items detailed below. 
- **Theme, tone, and content boundaries:** Game is not realistic, and provides an abstract/stylized UI without attempting to immitate reality. 

## 4. Core gameplay loop

Complete the loop in plain language:

1. **See a goal:** Move a component from source to output. "How do I make the material into that product?" (Simple recipe shown on screen at the output location)
2. **Plan:** How to move the component, how to manipulate and connect, etc.
3. **Build or act:** Placing conveyor belts, planning machines, etc. 
4. **Observe:** Are their mistakes visible? 
5. **Evaluate and adjust:** Easy method for deleting incorrect or improperly placed machines/factory elements.
6. **Progress:** Customization options at each level up, new machines, single use boosts, and more. 

**What makes this loop satisfying?** Watching a chain reaction work. Place a machine, a part flows in, comes out changed, and lands in the next machine. Small decisions (belt direction, machine order, where to branch) have visible consequences within one or two seconds. The peak moment is the first time a full line delivers the ordered product, and the follow-up urge to make the line faster, cleaner, or cheaper. Jams are readable too: a full machine is obvious at a glance, and the player can trace the flow backwards to find the cause, which is where the learning happens.

## 5. Game rules and systems

**Item model (what moves through the game):**

- Everything on a belt is either a **part** or an **assembly**.
- A **part** is one material in one form. Examples: silicon ingot, silicon wafer, silicon die, copper wire, copper coil, plastic sheet, battery cell, housing.
- An **assembly** is a set of parts joined together, with a bond state and an optional shell. Examples: circuit board (silicon die + copper coil, soldered), module (board + battery cell, mounted), finished device (module placed in a housing).
- An item is defined by its exact recipe, so a wrong item is always clearly wrong (wrong part, wrong order, missing shell). This makes rejection feedback unambiguous.
- Items are drawn as original vector icons with shape, color, and pattern, so they stay distinguishable without relying on color alone.

**Player actions:**

- Place a machine or belt on the grid. Rotate while placing (F key or right click).
- Move a placed machine by dragging. Delete any placed object with one click. No cost, no friction.
- Select any machine to inspect it: shows what it takes in, what it makes, and whether it is full.
- Pause, 1x speed, 2x speed. Zoom and pan. Undo the last placement (Ctrl+Z).

**Transformation rules (machines):**

| Machine | In | Out | Rule |
|---|---|---|---|
| Feed hopper | none | 1 part | Emits one fixed part type at a slow rate. Different hopper tiers emit more refined forms (ingot, wire, battery, housing). |
| Conveyor belt | 1 part | 1 part | Moves parts tile by tile at a fixed rate. Parts keep spacing and cannot pass through each other. |
| Splitter | 1 in | 2 out | Sends each part to whichever output has room. Used to feed one source into two stations. |
| Merger | 2 in | 1 out | Takes parts from either input and forwards them. Used to combine two sources into one line. |
| Saw | 1 part | 2 parts | Cuts one form into two of the next form (ingot to 2 wafers, wafer to 2 dies). Teaches ratios naturally. |
| Coil press | 1 part | 1 part | Transforms a form (copper wire to copper coil). One job per machine. |
| Solder station | 2 items | 1 assembly | Joins exactly two matching items into an assembly (die + coil to board). Rejects anything else. |
| Assembler | 2 items | 1 assembly | Adds a part to an assembly (board + battery to module). Rejects anything else. |
| Encapsulation | 2 items | 1 product | Places an assembly into a housing (module + housing to device). The final step of a product. |
| Bin | 1 in | 1 out | Stores up to 10 parts. Releases them when the downstream side has room. Smooths out mismatched speeds. |
| Recycler | 1 in | nothing | Safely removes parts or assemblies. The clean way to fix a mistake. |
| Overhead conveyor | 1 in | 1 out | Carries parts on a second layer, crossing belts and machines without merging them. |
| Order dock | 1 in | accepted | Accepts only the exact ordered product. Wrong items bounce back and back up the line. The dock shows what it needs. |

**Movement and timing:**

- Grid-based placement, real-time flow. Belts move parts at a fixed rate (2 per second). Machines process at their own rate. Hoppers are the slowest.
- If a machine's output is blocked, it stops taking input. Backups propagate upstream and are always visible: parts line up behind the full machine.

**Constraints:**

- Puzzle levels: a bounded build zone, a limited set of unlocked machines, and just enough supply to finish.
- Placing base machines is free. Currency is earned only from accepted products and spent only on optional upgrades (faster motors, bigger bins, dual output stations). No upgrade is ever required to finish a level.
- No time limit by default. Optional timed "rush orders" come later.

**Win condition:**

- Deliver the ordered amount of the target product to the order dock (for example, 10 circuit boards). The dock only accepts the exact target; everything else bounces back.

**Retry / undo behavior:**

- Delete and re-place anything at any time. Parts already on the line are not lost (they stay on belts or in bins).
- "Reset level" restores the starting layout. Ctrl+Z undoes the last placement.

**Difficulty variables (introduced one at a time):**

1. Number of machine steps in the recipe (1, then 2, 3, 4).
2. Order sensitivity (solder before mount, mount before encapsulate).
3. Branching (one source feeding two stations).
4. Throughput (deliver 30 instead of 10, or deliver within a short time).
5. Space pressure (tight zones, long lines, need for overhead conveyors).
6. Distraction (two products ordered at once, or wrong parts in the supply).

**Hints and explanations:**

- Every machine shows a plain in-out card when selected (example: "Saw: silicon ingot in, 2 silicon wafers out").
- The order dock always shows the target product with its recipe broken into steps (example: "board = die + coil, soldered").
- After a jam, a hint button highlights the full machine and suggests tracing upstream.
- All text is grade 7 reading level, short sentences, no em dashes, no unexplained jargon.

**Example challenge (rough draft):**

- Starting state: A silicon feed hopper on the left edge, a 10x8 build zone, an order dock on the right edge asking for 10 silicon wafers. Only belts, the saw, and delete are available.
- Goal state: 10 wafers delivered to the dock.
- Available tools / rules: Place and rotate belts, place the saw, delete anything. The hopper and dock cannot be moved.
- Intended learning: A production line is a chain of machines, each doing one job, and order and placement matter.
- Likely misconception: Expecting ingots to become wafers without the saw, placing the belt in the wrong direction, or putting the saw after the dock.
- Helpful feedback: Parts visibly queue up behind a full or wrong machine. The dock shows "needs: wafer, got: ingot" while ingots bounce back. A hint highlights the missing link.

## 6. Levels and content

- **Structure:** Tutorial (3 short guided levels) → 8 themed units (one new machine or idea per unit) → open sandbox plus free contracts.
- **Level length:** 3 to 8 minutes per level. One full unit fits a 30 to 45 minute class period.
- **How new rules are taught:** Short demo (30 to 60 seconds, auto-play or guided) → first guided challenge (small zone, only the new machine matters) → free challenge that combines the new machine with earlier ones.
- **How challenge escalates:** More recipe steps, order sensitivity, branching, throughput targets, and space pressure (see difficulty variables above).
- **Replay / sandbox mode:** Yes. A sandbox with all machines unlocked and infinite supply, plus a free contract mode where the player picks the target product.
- **Content authoring:** Levels are data files (JSON), not code. A built-in level editor (later milestone) lets teachers place hoppers, machines, and the dock, then save the level. Level format: `{ id, name, zone, supplies, machines, dock: { product, amount }, unlockedMachines }`.
- **Content review:** A teacher checklist per level (recipe accuracy, age appropriate text, solvable in the given zone, one clear learning focus). Playtest with a small student group before publishing.

| Stage / unit | Learning focus | New mechanic | Sample challenge | Completion criteria |
|---|---|---|---|---|
| Tutorial A | Parts move on belts | Belt placement, rotate, delete | Move 10 silicon ingots from the hopper to the dock | 10 ingots delivered |
| Tutorial B | One machine, one job | Saw | Cut ingots into wafers, deliver 10 wafers | 10 wafers delivered |
| Tutorial C | One station, two sources | Merger | Feed two copper hoppers into one coil press | 10 coils delivered |
| Unit 1 | Refining in steps | Saw (wafer to die) | Deliver 8 silicon dies | 8 dies delivered |
| Unit 2 | Combining two parts | Solder station | Deliver 10 circuit boards (die + coil) | 10 boards delivered |
| Unit 3 | Adding a part | Assembler | Deliver 8 modules (board + battery) | 8 modules delivered |
| Unit 4 | Finishing a product | Encapsulation | Deliver 6 devices (module in housing) | 6 devices delivered |
| Unit 5 | Branching a line | Splitter | One saw feeds two solder stations, deliver 20 boards | 20 boards delivered |
| Unit 6 | Buffering mismatched speeds | Bin | Slow saw, fast dock, use a bin to keep the flow steady | 40 boards in 5 minutes |
| Unit 7 | Crossing lines | Overhead conveyor | Cross two lines without merging them, deliver 12 devices | 12 devices delivered |
| Unit 8 | Full chain, own choices | All machines + upgrades | Build the fastest line for 30 devices and spend earned currency on one upgrade | 30 devices delivered, 1 upgrade purchased |
| Sandbox | Free play | All machines, infinite supply | Player picks any target product | No failure state |

## 7. Motivation and assessment

- **Progress indicators:** Steady introduction of new parts and components- more complex products. 
- **Rewards:** Persistent customization unlocks- including rogue-like choices for special machines. (All will be unlocked by a certain level, but each can modify production early while not being 'required'- IE speed boosts, multipliers, storage options.)
- **Mastery model:** Contract tiers (Novice, Journeyman, Engineer, Plant Manager). Each tier is a set of contracts. Finishing all contracts in a tier unlocks the next tier. Currency from accepted products can be spent on optional upgrades at any time (faster motors, bigger bins, dual output stations). Upgrades help but are never required. A star rating per contract (speed and clean build) gives a mastery goal without punishing a slow first attempt.
- **Scoring / stars / timers:** Currency is earned by successful outputs.
- **Teacher or learner reporting:** None by default. The save file already holds local play statistics (levels completed, time played, machines built) that a student can keep or share themselves. An opt in class level dashboard is listed under later possibilities.
- **Avoiding harmful pressure:** Elements which cannot pass through specific machines become backed up, including attemting to deliver the wrong products to specific outputs. 

## 8. User experience and accessibility

- **Primary input:** Touchpad, mouse
- **Small-screen behavior:** Not primary focus- poor function not a concern initially.
- **Keyboard and assistive technology:** Keyboard assists with play- rotating pieces, shortcuts, etc.
- **Color accessibility:** Colors, patterns, shapes
- **Motion and animation controls:** smooth motion, speed control.
- **Reading level and language:** English, clear, simple explanation. No emdashes anywhere. 
- **Save and resume:** Save is retained in local data, players are encouraged to download save files in the event of cache clearing. 
- **Onboarding:** Basics explained through first few minutes as players begin- but limited- players encouraged to experiment. 

## 9. Website and technical fit

- **Host page / launch point:** Lives on the edu site (tools page). Static files, no external requests.
- **Target browsers and devices:** Chrome, Firefox, Safari- desktop browsers.
- **Framework / rendering approach:** Plain modern JavaScript (ES modules) with Canvas 2D for the playfield and DOM plus CSS for the interface. No game engine and no framework. A small Vite dev server for development, shipped as static files so it runs on any host and works offline. All art is drawn in code as vector shapes, so there is no image pipeline and no external asset license risk.
- **Loading and offline expectations:** Lightweight, able to load in a few seconds- then fast once initial load is complete. 
- **Account / identity integration:** Guest play, downloadable/uploadable save games. Data saved locally. No accounts. 
- **Data exchanged with the website:** Likely none
- **Persistence:** Local save, save file download and upload. 
- **Analytics events:** None by default. Optional local only play statistics inside the save file (levels completed, time played, machines built). If the site later wants anonymous counters, add an opt in page level event (level started, level finished) with no identifiers.
- **Privacy and retention:** No user data retained. 
- **Security / moderation considerations:** No specific concerns.

## 10. Visual and audio direction

- **Visual principles:** Large readable icons. Each part type gets one shape plus one color plus one pattern. High contrast between grid, belts, machines, and parts. Machines show input and output arrows. Full and empty states are obvious at a glance (a full machine glows and shows its queue).
- **Original art direction:** A stylized workshop look. Soft rounded machines, bright material colors (silicon is grey blue, copper is orange, batteries are green, housings are yellow). Light and dark theme. All icons are original vector drawings inspired by the general idea of a parts factory, not taken from any existing game.
- **Animation principles:** Motion shows the rule. Parts move at a constant speed. Machines pulse while working. A full machine visibly blocks. Nothing moves through another object. A smooth motion toggle exists for players sensitive to animation.
- **Sound:** Optional subtle cues (machine hum, accept chime, jam thud), a global mute, and sound off by default when autoplay is blocked. All audio generated in code or CC0 licensed. No voice.
- **Reference boundaries:** Broad inspiration from factory automation games in general (belts, machines, products, automation). Avoid: copying any specific game's names, sprites, level layouts, UI text, or shape system. Machine names, part names, icons, and recipes in this game are all original.

## 11. Scope and roadmap

### Minimum viable game

- **Must have:** expanding scope and trickle of new components, discoveries by students
- **Explicitly out of scope:** Nothing specific
- **Prototype question:** Can shapes and elements be modified and stuck together cleanly
- **Prototype success signal:** No clipping

### Later possibilities
To be addressed after play and student feedback. 

- Control tier: sensors, relays, and toggles to automate lines (a logic unit for grades 9 to 12)
- Dual product contracts: make two different products at once (multi line planning)
- Rush orders: timed contracts with a bonus multiplier
- Teacher dashboard: opt in class level completion statistics
- Shareable factories: export a factory layout as a file a friend can open

| Milestone | Deliverable | Owner | Estimate / target date | Definition of done |
|---|---|---|---|---|
| Prototype | Grid, belt, hopper, saw, dock, one contract, no clipping or ghost parts | Dev (you + assistant) | 1 to 2 weeks | A student places a saw, cuts an ingot, and delivers 10 wafers with no bugs |
| First playable | Tutorial (3 levels) plus Units 1 to 4, save and resume, delete and undo | Dev | 3 to 4 weeks cumulative | A new player completes Unit 4 (6 devices delivered) without help |
| Pilot | All 8 units, sandbox, upgrades, color blind mode, keyboard support | Dev + one teacher | 6 to 8 weeks cumulative | A class plays a 30 minute session, all levels are completable, no data loss |
| Release | Polished UI, save file export and import, teacher docs, hosted on the site | Dev + site owner | 10 to 12 weeks cumulative | Live on the tools page. A student on a school laptop completes a contract |

## 12. Testing and success measures

- **Playtest participants:** Students in grade 9-12
- **Learning measure:** Feedback and discussion. Learning will follow the fun.
- **Usability measure:** Is the game close to Shapez in onboarding/new player experience?
- **Engagement measure:** Students remain focused and share new learnings with friends.
- **Technical measure:** Lightweight, bug-free, games can be saved.
- **Success thresholds:** Students play it outside of class for fun. 

## 13. Risks and open decisions

| Risk or unanswered question | Likelihood / impact | Next step to resolve | Owner |
|---|---|---|---|
| Reusing shapez.io code (GPLv3) or art would create a license problem for the site | medium | Build all code and art from scratch. Keep a short list of patterns borrowed versus assets used (none) in the repo | Dev |
| Scope creep: too many machines before the core loop is fun | high | Freeze the machine list at the MVP set (hopper, belt, splitter, merger, saw, coil press, solder, assembler, encapsulation, bin, recycler, overhead, dock). Defer the control tier | Dev |
| Backups frustrate younger players | medium | Make jams very readable (highlight the full machine, trace hint). Keep tutorial zones small | Dev + teacher |
| Save format breaks between versions | low | Version the save file from day one, one migration step per change, test loading old saves | Dev |
| Performance on old school laptops | low | Canvas 2D, vector art, low entity counts. Test on a low spec Chromebook | Dev |
| Text drifts above grade 7 reading level | low | Copy review pass against a grade 7 standard. No em dashes, no unexplained jargon | Teacher |
| Sound or music assets with unclear licenses | low | Generate sounds in code or use CC0 only. Keep a license note in the repo | Dev |
| Rejected parts feel like a penalty | medium | Frame rejection as information (the dock shows what it needs), never as a fail state | Dev |

## 14. Immediate next steps

1. Expand plan via Copilot 
2. Develop expanded plan to actually build the game
3. Begin work on production 