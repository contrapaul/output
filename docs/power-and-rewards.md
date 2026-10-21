# Power and Rewards (design in progress)

Status: ready to build (Paul, 2026-10-21: "Proceed to phase 3"). Decisions in section 6.
Source: Paul's answer to D6 in `roadmap.md`, plus D1 (level-ups expand the plot) and D3 (credits buy upgrades).

The local model must not build anything from this file until Paul changes the status line above to "ready to build".

---

## 1. What we want from these systems

- **Power** gives the player a second thing to plan around besides belts and recipes. It limits how big the factory can get, gives credits a second use, and supports a story about a growing company.
- **Level-up rewards** make each milestone exciting and give the player a choice that fits their own factory. A player short on power is glad to see a free solar panel. A player with plenty of power picks faster machines instead.
- Both must stay readable for grade 7: one number to watch, one clear reason when something is blocked, no hidden penalties.

---

## 2. Power: options

### 2.1 What happens when you need more power than you have

| Option | How it plays | Good | Risk |
|---|---|---|---|
| A. Block placement | You cannot place a machine that would go over your power limit. The ghost shows "Needs 3 power, you have 1 free." | Very clear. Matches "gates how many machines can be built". Nothing breaks. | Can feel like a wall if the player cannot afford a generator. |
| B. Slow down | You can place anything. Over the limit, every machine runs slower in proportion (120% demand means everything runs at 83%). | Teaches load and balance. Soft, never stuck. | Harder to notice. A slow factory looks like a bug. |
| C. Trip and reset | Over the limit, power cuts out until you fix it (Satisfactory's fuse). | Dramatic, memorable. | Punishing. Against the "no fail state" rule in the brief. |

**Recommendation: A**, with a safety net: the shop always sells a cheap solar panel, and the first contract after any level-up pays enough to buy one. Option B could come back later as an upgrade or challenge mode.

### 2.2 What uses power

| Thing | Power | Why |
|---|---|---|
| Belts, mergers, splitters | 0 | Keeps early building free. Logistics should never be blocked by power. |
| Hoppers | 0 | They are part of the map, not something you build. |
| Simple machines (modify, split) | 1 | Cheap, so the first few are easy. |
| Combine and encase machines | 2 to 3 | Complex steps cost more, which makes them a real choice. |
| Storage depots | 0 (small) to 1 (large) | A large depot is a big investment. |

Machines draw their power whenever they are placed, working or not. This keeps the number simple: placed machines add up to your demand.

### 2.3 Where power comes from

| Generator | Output | Cost | Placement rule | Notes |
|---|---|---|---|---|
| Starter grid | 6 | free | none (built in) | Enough for the first few contracts |
| Solar panel | 2 | cheap | 1x1, anywhere | Small and easy. A perk can give one free. |
| Wind turbine | 6 | medium | 1x1, needs empty tiles around it (no machines within 1 tile) | Space becomes a cost, which fits the expanding plot |
| ~~Generator (later tier)~~ | ~~15~~ | | | Dropped (Paul, 2026-10-21): power is bought with credits only |

Questions for Paul are in section 5.

### 2.4 How power is shown

- A power bar in the top bar: "Power 14 / 20". It turns amber at 90% and stays amber at 100%. No red, because nothing is wrong.
- The ghost of a machine shows its power cost before you place it.
- The shop shows the power each generator adds.

---

## 3. Level-ups and rewards: options

### 3.1 What a level is

| Option | How it works |
|---|---|
| A. Milestone contracts | Paul marks certain contracts as milestones in the contract data. Finishing one is a level-up. |
| B. Experience bar | Every delivered part adds experience. A level comes when the bar fills. |
| C. Every N contracts | A level-up after every 3 to 5 contracts. |

**Recommendation: A.** Paul is writing the progression by hand (D4), so he should place the level-ups where they fit the story. It also lines up with plot expansion at milestones (D1).

### 3.2 What a level-up gives

Every level-up, in this order:
1. A short celebration.
2. **Plot expansion:** the camera pulls out and new land and hoppers appear (D1).
3. **Unlocks** listed in the milestone (new machine, new shop items).
4. **Perk choice:** pick 1 of 3.

### 3.3 How the three perks are picked

| Option | How it works |
|---|---|
| A. Random | Three random perks from the pool. |
| B. Smart | One perk always targets the player's weakest area (power above 85% used: a power perk; a hopper always backed up: a supply perk). The other two are random from different categories. |
| C. Fixed | Each milestone lists its own three perks in the data. |

**Recommendation: B, with C allowed.** Smart offers make the choice feel personal, which is the feeling Paul described. A milestone may still list fixed perks when the story needs a certain reward.

### 3.4 Perk pool (brainstorm, to trim together)

All perks are permanent for the save. A perk can be offered again if it stacks.

**Power**
- Free solar panel (placed wherever you click).
- Efficient motors: one machine type uses 1 less power.
- Calm winds: wind turbines no longer need empty space around them.
- Free power (rare): one machine type uses no power. Offered at most once per type, only after the city cap.

**Speed**
- Faster machines of one type: +25% speed.
- Faster belts: +10% belt speed everywhere (stacks).

**Supply** (fits Paul's "delivery of a limited-supply node")
- Rich hopper: one hopper of your choice emits 50% faster.
- Supply drop: a quantity of an item from a list of level-appropriate reward items is delivered in a container to an open grid space.

**Storage**
- Bigger depots: +50% capacity.
- Free medium depot.

**Production**
- Bonus cut: modify machines sometimes make one extra part (for example 1 in 10). Must be deterministic: every 10th part, not random.
- ~~Lucky combine~~: dropped (a combiner with one input is confusing).

**Economy**
- Credit bonus: +10% credits from contracts.
- Discount: shop prices -15%.

Rules for good perks:
- Each one changes one number or one rule that the player can see.
- No perk is ever required to finish a contract.
- Every perk can be explained in one short sentence at grade 7.
- Deterministic only: no random outcomes, so factories stay predictable.

---

## 4. How power and rewards connect

- Credits from contracts pay for generators, so the more you deliver, the more you can build.
- Power limits how many machines you have, so it becomes the reason to choose upgrades (faster machines) over more machines. This is a natural lesson about efficiency.
- Smart perk offers spot a power shortage and offer help.
- Plot expansion gives room for wind turbines and new hoppers, so each level-up opens new options for power and supply.

---

## 5. Questions for Paul

Answered 1 to 4 (see section 6). Still open: 

Answers: 
5: They would not refill. Normal nodes do not run out, but have a baseline speed (which can be improved by upgrades and level-up choices) The idea is as one option for the level-up rewards a loaded storage crate/depot/container could be delivered containing a load of a specific (more valuable) part or material. This would provide a boost to production, and could mean that the player is happy to not need to build that specific item. 
6: The story outline mentioned is what I imagined. Effectively 'we've maxed out how much power the city will give us, so we have to start making our own!' This would happen after a 'reasonable' amount of progress, but power use would be a visible (but not important) part of the UI, until it suddenly DOES become important. 
7: 

5. **Limited-supply hoppers:** your D6 answer mentions "delivery of a limited-supply node". Do some hoppers run slowly or run out? If they run out, do they refill over time?
6. **Story:** is power part of the company story (for example, the town only gives you so much power until you build your own)? This could shape the names and the first power contract.
7. **Perk pool:** which of the perks in 3.4 do you like, which should go, and what is missing?

## 6. Answers and decisions

Decided by Paul, 2026-10-21:

| # | Decision | Effect on the design |
|---|---|---|
| P1 | Over the limit: **block placement** | Option 2.1 A. The ghost shows the power cost and why it cannot be placed. Keep the safety net: a cheap solar panel is always in the shop. |
| P2 | Generators: **solar and wind only** | Power is bought with credits, never made from products. The fuel generator is dropped. Wind's spacing rule is the main spatial cost. |
| P3 | Level-ups: **milestone contracts Paul marks** | `milestone: true` on a contract triggers the celebration, plot expansion, unlocks and perk choice. |
| P4 | Perk offers: **smart, fixed allowed** | One offer targets the weakest area, two are random from other categories. A milestone may list its own three perks. |
| P5 | Hoppers **never run out**. Each has a base rate that upgrades and perks can raise. | No limited hoppers. The "Rich hopper" perk stays. |
| P6 | **Supply drop:** a container full of a level-appropriate, more valuable part arrives on an open tile. Once empty it becomes a normal depot the player keeps (roadmap R4). | Built on Phase 2's pre-filled depots. Needs a list of reward items per level in data (Paul writes it with the progression). |
| P7 | **Power story:** the city supplies the power at first. At a milestone, "we've maxed out what the city will give us, so we have to start making our own." Power is visible but unimportant until then. | The power meter shows from the start. The cap milestone unlocks solar and wind in the shop. |

Follow-up from P2: since power never connects to production, credits are the only path to more power. That makes Q2 in the roadmap (should old lines keep earning?) more important. There is one possible dead end to design out: a contract needs a new machine, the player has no free power, and has no credits for a solar panel. Two guards: (a) every contract pays out part of its credits as it fills, not only at the end, and (b) a test that simulates the cheapest path through all contracts and checks the player can always afford the power the next contract needs.


Side orders (roadmap Q2 answer, R2, R3) also ease the dead end above: they pay credits from parts the player already makes.

## 7. Phase 3 decisions (2026-10-21)

| # | Decision | How it is built |
|---|---|---|
| P8 | City cap: **a fixed number from data** | A contract can set `cityPower`. Before any contract sets it, the city covers all demand. If the player is already over the new cap, everything keeps running, but nothing new that needs power can be placed until they add power or remove machines. |
| P9 | Belt perk: **global +10% belt speed**, stacks | `data/perks.json` |
| P10 | **Free power** perk for one machine type: rare, once per type, only after the city cap | `data/perks.json` |

Choices Claude made while building (check these):
- Solar panels and wind turbines are tools in the toolbar. Each costs credits when placed and gives them back when removed (so undo stays fair). This is the Phase 3 "shop". Upgrades come in Phase 4.
- The milestone that sets the city cap also unlocks solar and wind and gives two free solar panels, so a player is never stuck with no power and no credits.
- Wind turbines need their 8 neighbouring tiles free of machines (belts are fine). The rule works both ways: a machine cannot be placed next to a turbine either. Calm winds removes it.
- Perks that name "one machine type" or "one hopper" choose it when offered, using what the player has built most of (shown on the card), so there is no extra picking step.
- Supply drop: a medium depot filled with 50 of a part used in the next contract, placed on a free tile near the dock. A contract can name its own drop with `supplyDrop: { item, amount }`.
- The level-up card does not pause the game and stays until a perk is picked. It survives a reload.
