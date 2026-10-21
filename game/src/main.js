// Output: app shell (Phase 2).
//
// One factory that keeps growing. Boots a Campaign (contracts in order,
// unlocks, plot stages) from the save, or a sandbox. The contract panel
// always shows the current order; when it is filled, a toast shows the
// reward and the next order appears with no menu in between. Milestones
// grow the plot and the camera eases out to show the new land.
//
// Menu: Continue, New game, Sandbox, Settings, Export, Import.
// Dev pages: ?art=1 (every item at belt and order size), ?perf=1 (frame time).

import { GameLoop } from "./core/loop.js";
import { CONFIG } from "./core/config.js";
import { Campaign, sandboxGame, ALL_TOOLS } from "./game/campaign.js";
import { GENERATORS } from "./game/root.js";
import { upgrades as UPGRADES } from "./data/index.js";
import { Camera } from "./game/camera.js";
import { Renderer } from "./game/renderer.js";
import { Input } from "./game/input.js";
import { Toolbar } from "./ui/toolbar.js";
import { SaveSystem } from "./game/save.js";
import { itemName, recipeSteps } from "./game/items.js";
import { drawItem } from "./game/art.js";
import { MACHINE_NAMES, HANDLERS } from "./game/systems/process.js";
import { showArtSheet } from "./ui/artsheet.js";

const params = new URLSearchParams(window.location.search);
const canvas = document.getElementById("playfield");
const toolbarEl = document.getElementById("toolbar");
const statusEl = document.getElementById("statusbar");
const status = (msg) => { statusEl.textContent = msg; };
const saveSys = new SaveSystem();

let campaign = null; // null in sandbox
let game, camera, renderer, input, toolbar, loop;
let mode = "menu"; // "campaign" | "sandbox" | "menu"
let cardTimer = null;
let autosave = null;
let ticker = null;
const renderShopIfOpen = () => { const el = document.getElementById("shop"); if (el && !el.matches(":hover")) renderShop(el); };
const perf = params.has("perf") ? makePerfOverlay() : null;

// ---- boot ----------------------------------------------------------------

function stopGame() {
  if (loop) loop.stop();
  if (input) input.detach();
  if (toolbar) toolbar.detach();
  if (autosave) clearInterval(autosave);
  if (ticker) clearInterval(ticker);
  document.getElementById("shop")?.remove();
  document.getElementById("stats")?.remove();
  hideCard();
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
}

function startCampaign(c) {
  stopGame();
  campaign = c;
  mode = "campaign";
  attach(c.game, c.tools());
  const sig = game.signals;
  sig.on("itemAccepted", refreshOrder);
  sig.on("contractComplete", onContractComplete);
  sig.on("expanded", onExpanded);
  sig.on("allContractsDone", () => toast("Every contract is done!", "Great work. Your factory keeps running. More contracts are coming."));
  sig.on("cityCapped", ({ cityPower }) => {
    toast("The city is out of power", `We have used all the power the city can give us (${cityPower}). From now on, build solar panels and wind turbines to power new machines. Here are 2 free solar panels to start.`, 12000);
    refreshTopbar();
  });
  sig.on("perkOffer", showPerkCard);
  sig.on("sideOrder", ({ slot }) => { toast("New side order", `${slot.amount} ${itemName(slot.item)} for ${slot.creditEach} credits each. It does not count toward the contract.`); sidesKey = ""; refreshOrder(); });
  sig.on("sideOrderDone", ({ credits }) => { toast("Side order done", `+${credits} credits`); sidesKey = ""; refreshOrder(); persist(); });
  sig.on("sideOrderExpired", () => { sidesKey = ""; refreshOrder(); });
  if (c.pendingOffer) showPerkCard({ offers: c.pendingOffer });
  autosave = setInterval(persist, 10000);
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => { refreshOrder(); renderShopIfOpen(); renderStats(); }, 1000);
  refreshOrder();
  if (!c.current) status("Your factory keeps running.");
  else if (c.index === 0) status("Build a line from a hopper to the dock. Pick a tool with 1, drag to build.");
  else status(`Welcome back. The dock needs ${orderText(c.current)}.`);
}

function startSandbox() {
  stopGame();
  campaign = null;
  mode = "sandbox";
  attach(sandboxGame({ settings: currentSettings() }), ALL_TOOLS);
  refreshOrder();
  status("Sandbox: every machine, every hopper, no orders. Nothing here is saved.");
}

function attach(g, tools) {
  const settings = currentSettings();
  game = g;
  game.settings = settings;
  camera = new Camera(canvas, game.world.zone);
  renderer = new Renderer(canvas, camera, game);
  renderer.theme = document.documentElement.dataset.theme || "light";
  buildToolbar(tools);
  input = new Input(canvas, camera, game, renderer, {
    onToolChange: (id) => {
      toolbar.mark(id);
      status(id ? `${MACHINE_NAMES[id] || id}: click or drag to build. F rotates. Right-click to put it away.` : "Drag to move around. Right-drag to remove things.");
    },
    onStatus: status,
    onSelect: (sel) => (sel ? showCard(sel) : hideCard()),
    onHover: showTooltip,
    onChange: () => { game.jam = null; persist(); refreshTopbar(); },
    canUseTool: (t) => (campaign ? campaign.unlocked.has(t) : true),
  });
  input.attach();
  loop = new GameLoop({
    hz: CONFIG.SIM_HZ,
    tick: () => game.tick(),
    render: (dt, alpha) => {
      camera.update(dt);
      const t0 = performance.now();
      renderer.render(game.paused ? 1 : alpha);
      if (perf) perf.sample(performance.now() - t0, game);
    },
  });
  loop.start();
  buildHud();
}

// short toolbar labels; the hover card and messages use the full names
const SHORT = { belt_high: "Overhead", depot_s: "Depot S", depot_m: "Depot M", depot_l: "Depot L", solar: "Solar", wind: "Wind", belt: "Belt" };

function buildToolbar(tools) {
  if (toolbar) toolbar.detach();
  toolbar = new Toolbar(toolbarEl, tools.map((id) => ({ id, name: SHORT[id] || MACHINE_NAMES[id] || id, title: MACHINE_NAMES[id] || id })), {
    onToolChange: (id) => input?.setTool(id),
  });
}

function persist() {
  if (mode === "campaign" && campaign) saveSys.save(campaign);
  refreshTopbar();
}

function currentSettings() {
  if (game?.settings) return game.settings;
  const saved = saveSys.load()?.settings;
  return Object.assign({ sound: false, theme: document.documentElement.dataset.theme || "light", motion: true, colorblind: false }, saved || {});
}

// ---- contract flow -------------------------------------------------------------

function onContractComplete({ contract, next, unlocked, earned }) {
  const lines = [`+${Math.round(earned)} credits`];
  for (const t of unlocked) {
    const h = HANDLERS[t];
    lines.push(`New: ${MACHINE_NAMES[t] || t}${h ? `. Takes ${h.inText}, makes ${h.outText}.` : "."}`);
  }
  toast(`Contract done: ${contract.title}`, lines.join("<br>"));
  if (unlocked.length) buildToolbar(campaign.tools());
  refreshOrder();
  if (next) status(`Next order: ${orderText(next)}.`);
  persist();
}

function onExpanded({ zone, hoppers }) {
  camera.easeToZone(zone, 2000);
  const names = hoppers.map((h) => itemName(h.item)).join(", ");
  toast("New land!", `Your plot just grew.${names ? ` New hoppers: ${names}.` : ""}`);
}

// ---- HUD: order panel, top bar, toasts -------------------------------------------

function buildHud() {
  document.getElementById("order")?.remove();
  document.getElementById("topbar")?.remove();
  const order = document.createElement("div");
  order.id = "order";
  order.className = "hud";
  document.getElementById("app").appendChild(order);

  const bar = document.createElement("div");
  bar.id = "topbar";
  bar.className = "hud";
  bar.innerHTML = `
    <span id="tb-coins" style="font-weight:600;"></span>
    <span id="tb-power" title="Power used / power you have"></span>
    <span id="tb-boost" class="muted"></span>
    <button class="btn sm" id="tb-shop">upgrades</button>
    <button class="btn sm" id="tb-stats">stats</button>
    <button class="btn sm" id="tb-pause">pause</button>
    <button class="btn sm" id="tb-speed">1x</button>
    <button class="btn sm" id="tb-hint">hint (H)</button>
    <button class="btn sm" id="tb-menu">menu</button>`;
  document.getElementById("app").appendChild(bar);
  bar.querySelector("#tb-pause").addEventListener("click", togglePause);
  bar.querySelector("#tb-shop").addEventListener("click", () => togglePanel("shop", renderShop));
  bar.querySelector("#tb-stats").addEventListener("click", () => togglePanel("stats", renderStats));
  bar.querySelector("#tb-speed").addEventListener("click", () => setSpeed(loop?.speed === 2 ? 1 : 2));
  bar.querySelector("#tb-hint").addEventListener("click", fireHint);
  bar.querySelector("#tb-menu").addEventListener("click", () => showMenu());
  orderKey = null;
  refreshTopbar();
}

function refreshTopbar() {
  const bar = document.getElementById("topbar");
  if (!bar || !game) return;
  bar.querySelector("#tb-coins").textContent = mode === "sandbox" ? "Sandbox" : `${Math.floor(game.coins)} credits`;
  const boosts = Object.entries(UPGRADES.boosts).filter(([id]) => game.boostLeft(id) > 0);
  bar.querySelector("#tb-boost").textContent = boosts.map(([id, b]) => `${b.name} ${clock(game.boostLeft(id))}`).join(", ");
  bar.querySelector("#tb-shop").hidden = mode === "sandbox";
  const used = game.powerUsed();
  const supply = game.powerSupply();
  const pw = bar.querySelector("#tb-power");
  pw.textContent = supply === Infinity ? `Power ${used} (city)` : `Power ${used} / ${supply}`;
  pw.classList.toggle("high", supply !== Infinity && used >= 0.9 * supply);
  if (toolbar) {
    for (const id of Object.keys(GENERATORS)) {
      const free = game.freeBuilds[id] || 0;
      toolbar.setNote(id, free ? `${free} free` : `${game.priceOf(id)} credits`);
    }
  }
  bar.querySelector("#tb-pause").textContent = game.paused ? "resume" : "pause";
  bar.querySelector("#tb-speed").textContent = `${loop?.speed || 1}x`;
}

let orderKey = null;
/** "10 M1 half", or "6 M1 half a minute for 2:00" for a standing order. */
const orderText = (c) => (c.rate ? `${c.rate.perMinute} ${itemName(c.item)} a minute for ${c.rate.minutes}:00` : `${c.amount} ${itemName(c.item)}`);
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function refreshOrder() {
  refreshTopbar();
  const el = document.getElementById("order");
  if (!el) return;
  if (mode === "sandbox") {
    el.innerHTML = `<div class="title">Sandbox</div><div class="label">Every machine and hopper. No orders. Not saved.</div>`;
    orderKey = null;
    return;
  }
  const c = campaign?.current;
  const main = game.dock?.main;
  if (!c || !main) {
    if (orderKey !== "done") {
      el.innerHTML = `<div class="title">All contracts done</div><div class="label">Your factory keeps running. More contracts are coming.</div><div class="sides"></div>`;
      orderKey = "done";
    }
    refreshSides(el);
    return;
  }
  // rebuild only when the contract changes; otherwise update the numbers
  if (orderKey !== c.id) {
    orderKey = c.id;
    const reward = [];
    if (c.unlock?.length) reward.push(`unlocks ${c.unlock.map((t) => MACHINE_NAMES[t] || t).join(", ")}`);
    if (c.milestone) reward.push("new land and a level-up");
    const ask = main.rate
      ? `Keep ${main.rate.perMinute} a minute coming for ${clock(main.rate.seconds)}`
      : `${main.amount} ${itemName(main.item)}`;
    el.innerHTML = `
      <div class="row">
        <canvas width="144" height="144" aria-hidden="true"></canvas>
        <div>
          <div class="title">${c.title}</div>
          <div class="label">${main.rate ? itemName(main.item) + "<br>" : ""}${ask}</div>
        </div>
      </div>
      <div class="bar"><div></div></div>
      <div class="meta"><span class="count"></span><span>${c.creditEach || 0} credits each</span></div>
      ${main.rate ? `<div class="meta rate"></div>` : ""}
      ${reward.length ? `<div class="meta" style="margin-top:2px;"><span>Reward: ${reward.join(", ")}</span></div>` : ""}
      <details><summary>How to make it</summary><ol>${recipeSteps(main.item).map((s) => `<li>${s}</li>`).join("") || "<li>Send it straight from a hopper.</li>"}</ol></details>
      <div class="sides"></div>`;
    const ctx = el.querySelector("canvas").getContext("2d");
    drawItem(ctx, main.item, 72, 72, 128, { detail: 4, cb: game.settings.colorblind });
  }
  if (main.rate) {
    const now = game.dock.ratePerMinute(main);
    el.querySelector(".bar > div").style.width = `${Math.min(100, (main.held / main.rate.seconds) * 100)}%`;
    el.querySelector(".count").textContent = `${clock(main.held)} of ${clock(main.rate.seconds)}`;
    const ok = now >= main.rate.perMinute;
    el.querySelector(".rate").innerHTML = `<span>Now: ${now} a minute ${ok ? "(on target)" : `(need ${main.rate.perMinute})`}</span>`;
  } else {
    el.querySelector(".bar > div").style.width = `${Math.min(100, (main.accepted / main.amount) * 100)}%`;
    el.querySelector(".count").textContent = `${main.accepted} of ${main.amount}`;
  }
  refreshSides(el);
}

/** Side orders under the main order: icon, amount, credits, time left. */
let sidesKey = "";
function refreshSides(el) {
  const box = el.querySelector(".sides");
  if (!box) return;
  const sides = game.dock.slots.slice(1).filter(Boolean);
  const key = sides.map((s) => s.item + s.expiresAt).join("|");
  if (key !== sidesKey || !box.childElementCount) {
    sidesKey = key;
    box.innerHTML = sides.map((s, i) => `
      <div class="side" data-i="${i}" style="display:flex;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--grid);">
        <canvas width="64" height="64" style="width:32px;height:32px;flex:none;"></canvas>
        <div style="flex:1;font-size:0.8rem;">
          <div><strong>Side order</strong>: ${s.amount} ${itemName(s.item)}</div>
          <div class="sline" style="color:var(--muted);"></div>
        </div>
      </div>`).join("");
    box.querySelectorAll("canvas").forEach((cv, i) => drawItem(cv.getContext("2d"), sides[i].item, 32, 32, 56, { detail: 2 }));
  }
  box.querySelectorAll(".side").forEach((row, i) => {
    const s = sides[i];
    row.querySelector(".sline").textContent = `${s.accepted} of ${s.amount}, ${s.creditEach} credits each, ${clock(Math.max(0, s.expiresAt - game.time))} left`;
  });
}

// ---- upgrades panel and stats panel ------------------------------------------------

function togglePanel(id, build) {
  const old = document.getElementById(id);
  document.getElementById(id === "shop" ? "stats" : "shop")?.remove();
  if (old) { old.remove(); return; }
  const el = document.createElement("div");
  el.id = id;
  el.className = "hud side-panel";
  document.getElementById("app").appendChild(el);
  build(el);
}

function renderShop(el = document.getElementById("shop")) {
  if (!el) return;
  const tracks = Object.entries(UPGRADES.tracks);
  const boosts = Object.entries(UPGRADES.boosts);
  el.innerHTML = `<div class="row-between"><strong>Upgrades</strong><button class="btn sm" data-close>close</button></div>
    <p class="muted">Upgrades work on the whole factory. Credits: <strong>${Math.floor(game.coins)}</strong></p>
    ${tracks.map(([id, t]) => {
      const lvl = game.upgradeLevels[id];
      const next = game.nextUpgrade(id);
      return `<div class="shop-row">
        <div><strong>${t.name}</strong> <span class="muted">level ${lvl + 1} of ${t.levels.length + 1}</span><div class="muted">${t.what} Now x${game.upgradeMult(id)}.</div></div>
        ${next ? `<button class="btn sm" data-up="${id}" ${game.coins < next.price ? "disabled" : ""}>${next.name}: ${next.price}</button>` : `<span class="muted">top level</span>`}
      </div>`;
    }).join("")}
    <p style="margin:10px 0 4px;"><strong>Boosts</strong> <span class="muted">(one use)</span></p>
    ${boosts.map(([id, b]) => {
      const left = game.boostLeft(id);
      return `<div class="shop-row">
        <div><strong>${b.name}</strong>${left ? ` <span class="muted">${clock(left)} left</span>` : ""}<div class="muted">${b.what}</div></div>
        <button class="btn sm" data-boost="${id}" ${game.coins < b.price ? "disabled" : ""}>${left ? "Add time" : "Use"}: ${b.price}</button>
      </div>`;
    }).join("")}
    <p class="muted" style="margin-top:10px;">Solar panels and wind turbines are on the toolbar once the city runs out of power.</p>`;
  el.querySelector("[data-close]").addEventListener("click", () => el.remove());
  el.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => {
    const why = game.buyUpgrade(b.dataset.up);
    status(why ? `Cannot buy: ${why}.` : "Upgrade bought.");
    renderShop(el);
    persist();
  }));
  el.querySelectorAll("[data-boost]").forEach((b) => b.addEventListener("click", () => {
    const why = game.buyBoost(b.dataset.boost);
    status(why ? `Cannot use: ${why}.` : `${UPGRADES.boosts[b.dataset.boost].name} is running.`);
    renderShop(el);
    persist();
  }));
}

function renderStats(el = document.getElementById("stats")) {
  if (!el) return;
  const items = new Set();
  for (const k of game.rates.keys()) items.add(k.slice(k.indexOf(":") + 1));
  const rows = [...items].map((item) => ({
    item,
    made: game.rates.perMinute(`made:${item}`, game.time, 60),
    made5: game.rates.perMinute(`made:${item}`, game.time, 300),
    del: game.rates.perMinute(`delivered:${item}`, game.time, 60),
  })).filter((r) => r.made5 > 0 || r.del > 0).sort((a, b) => b.made - a.made);
  const f = (n) => (n >= 10 ? Math.round(n) : n.toFixed(1));
  el.innerHTML = `<div class="row-between"><strong>Production</strong><button class="btn sm" data-close>close</button></div>
    <p class="muted">Parts per minute. "Last 5 min" smooths out bumps.</p>
    <table><thead><tr><th></th><th>Part</th><th>Made</th><th>Last 5 min</th><th>Delivered</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td><canvas data-i="${i}" width="40" height="40" style="width:20px;height:20px;"></canvas></td><td>${itemName(r.item)}</td><td>${f(r.made)}</td><td>${f(r.made5)}</td><td>${f(r.del)}</td></tr>`).join("") || `<tr><td></td><td colspan="4" class="muted">Nothing made yet.</td></tr>`}
    </tbody></table>`;
  el.querySelectorAll("canvas").forEach((cv) => drawItem(cv.getContext("2d"), rows[cv.dataset.i].item, 20, 20, 36, { detail: 1 }));
  el.querySelector("[data-close]").addEventListener("click", () => el.remove());
}

/** Level-up: pick 1 of 3 perks. The game keeps running behind the card. */
function showPerkCard({ offers }) {
  document.getElementById("perk-card")?.remove();
  const el = document.createElement("div");
  el.id = "perk-card";
  el.className = "hud";
  el.innerHTML = `<h3>Level up! Choose one</h3>
    <div style="color:var(--muted);font-size:0.85rem;">Your factory keeps running while you choose.</div>
    <div class="perks">${offers.map((o, i) => `
      <button class="btn" data-i="${i}">
        <div class="cat">${o.category}</div>
        <div class="pname">${o.name}</div>
        <div class="ptext">${o.text}</div>
      </button>`).join("")}</div>`;
  document.getElementById("app").appendChild(el);
  el.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
    const card = campaign.choosePerk(Number(b.dataset.i));
    el.remove();
    if (card) {
      toast(`Perk: ${card.name}`, card.text);
      if (card.id === "free_depot") buildToolbar(campaign.tools());
    }
    persist();
  }));
}

function toast(title, body, ms = 6000) {
  const box = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<strong>${title}</strong>${body || ""}`;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---- menu and overlays -----------------------------------------------------------

function overlayShell(title) {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const o = document.createElement("div");
  o.className = "overlay";
  o.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:200;";
  o.innerHTML = `<div class="panel" style="background:var(--panel);padding:1.5rem;border-radius:12px;min-width:280px;max-width:420px;max-height:85vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.35);">
    <h2 style="margin:0 0 1rem;">${title}</h2>
    <div class="body"></div>
  </div>`;
  document.body.appendChild(o);
  return o;
}

function showMenu() {
  if (game) game.paused = true;
  const saved = saveSys.load();
  const hasSave = !!saved?.campaign;
  const o = overlayShell("Output");
  const body = o.querySelector(".body");
  const inGame = mode !== "menu";
  body.innerHTML = `
    <p style="margin:0 0 1rem;color:var(--muted);">Build a factory. Fill the orders. Watch it grow.</p>
    ${inGame ? `<button class="btn" data-act="resume">Back to the factory</button>` : ""}
    ${hasSave && mode !== "campaign" ? `<button class="btn" data-act="continue">Continue</button>` : ""}
    <button class="btn" data-act="new">New game</button>
    <button class="btn" data-act="sandbox">Sandbox</button>
    <button class="btn" data-act="settings">Settings</button>
    <div class="row-between" style="margin-top:0.5rem;">
      <button class="btn sm" data-act="export" ${hasSave || mode === "campaign" ? "" : "disabled"}>Export save</button>
      <button class="btn sm" data-act="import">Import save</button>
    </div>`;
  const on = (act, fn) => body.querySelector(`[data-act="${act}"]`)?.addEventListener("click", fn);
  on("resume", () => { o.remove(); game.paused = false; refreshTopbar(); });
  on("continue", () => { o.remove(); startCampaign(saveSys.restore(saveSys.load())); });
  on("new", () => {
    if ((hasSave || mode === "campaign") && !confirm("Start a new factory? Your saved factory will be replaced.")) return;
    o.remove();
    saveSys.clear();
    startCampaign(new Campaign({}, { settings: currentSettings() }));
    persist();
  });
  on("sandbox", () => { o.remove(); startSandbox(); });
  on("settings", renderSettings);
  on("export", () => {
    if (mode === "campaign") persist();
    const blob = new Blob([JSON.stringify(saveSys.load(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "output-save.json";
    a.click();
  });
  on("import", () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json";
    inp.addEventListener("change", () => {
      const file = inp.files?.[0];
      if (!file) return;
      file.text().then((txt) => {
        const data = saveSys.import(txt);
        if (data) { o.remove(); startCampaign(saveSys.restore(data)); }
        else status("That save file could not be read.");
      });
    });
    inp.click();
  });
}

function renderSettings() {
  const o = overlayShell("Settings");
  const body = o.querySelector(".body");
  const s = currentSettings();
  const apply = () => {
    if (game) game.settings = s;
    document.documentElement.dataset.theme = s.theme;
    if (renderer) renderer.theme = s.theme;
    orderKey = null;
    refreshOrder();
    persist();
  };
  body.innerHTML = `
    <label style="display:block;padding:0.4rem 0;">Theme
      <select id="set-theme">
        <option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option>
        <option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark</option>
      </select>
    </label>
    <label style="display:block;padding:0.4rem 0;"><input type="checkbox" id="set-motion" ${s.motion ? "checked" : ""} /> Motion (pulsing machines and smooth parts)</label>
    <label style="display:block;padding:0.4rem 0;"><input type="checkbox" id="set-cb" ${s.colorblind ? "checked" : ""} /> Colorblind patterns (stronger part markings)</label>
    <div style="text-align:right;margin-top:0.75rem;"><button class="btn sm" data-act="close">Back</button></div>`;
  body.querySelector("#set-theme").addEventListener("change", (e) => { s.theme = e.target.value; apply(); });
  body.querySelector("#set-motion").addEventListener("change", (e) => { s.motion = e.target.checked; apply(); });
  body.querySelector("#set-cb").addEventListener("change", (e) => { s.colorblind = e.target.checked; apply(); });
  body.querySelector('[data-act="close"]').addEventListener("click", () => showMenu());
}

// ---- machine card + hover tooltip -------------------------------------------------

const STATE_TEXT = {
  working: "working",
  waiting: "waiting for parts",
  blocked: "stuck: it cannot send its parts out",
};

function hoverLines(x, y) {
  const lines = [];
  for (const w of game.world.stackAt(x, y).reverse()) {
    if (w.t === "belt" || w.t === "belt_high") {
      const line = game.world.lines.lineForTile(x, y, w.z);
      const fl = line && game.flowLines.get(line.id);
      const key = line?.tiles.find((t) => t.x === x && t.y === y)?.key;
      const idx = line && key ? line.index(key) : null;
      const here = fl && idx !== null ? fl.items.filter((it) => Math.floor(it.d) === idx) : [];
      lines.push(`<strong>${MACHINE_NAMES[w.t]}</strong>`, here.length ? `Carrying ${here.map((it) => itemName(it.item)).join(", ")}.` : "Moves parts the way the arrow points.");
    } else if (w.t === "hopper") {
      const h = game.hoppers.find((hp) => hp.x === x && hp.y === y);
      lines.push(`<strong>Hopper</strong>`, `Gives ${itemName(h.item)} every ${Math.round(1 / h.rate)} seconds. It never runs out.`);
    } else if (GENERATORS[w.t]) {
      const g = GENERATORS[w.t];
      lines.push(`<strong>${g.name}</strong>`, `Makes ${g.output} power.`, w.paid ? `You get ${w.paid} credits back if you remove it.` : "It was free.");
      if (w.t === "wind" && !game.mods.calmWinds) lines.push("Needs empty space around it. Belts are fine.");
    } else if (w.t === "dock") {
      const m = game.dock?.main;
      lines.push(`<strong>${MACHINE_NAMES.dock}</strong>`, m ? `Needs ${itemName(m.item)}: ${m.accepted} of ${m.amount}. Parts from earlier orders are taken for free.` : "No order right now.");
    } else {
      const m = game.machines.get(x + "," + y);
      const h = m?.handler;
      if (!h) continue;
      lines.push(`<strong>${MACHINE_NAMES[w.t] || w.t}</strong>`, `Takes ${h.inText}.`, `Makes ${h.outText}.`);
      const pw = game.powerOf(w.t);
      if (pw) lines.push(`Uses ${pw} power.`);
      if (!h.buffer) {
        const jobs = game.jobsPerMinute(m);
        const outs = { cutter: 2, recycler: 0 }[w.t] ?? 1;
        if (jobs > 0) lines.push(`Rate: takes ${Math.round(jobs * (h.needs || 1))} and makes ${Math.round(jobs * outs)} parts a minute.`);
      }
      if (h.buffer) lines.push(m.stored ? `Holds ${m.buffer.length + m.outputs.length} ${itemName(m.stored)}.` : "Empty.");
      else if (m.inputs.length) lines.push(`Has ${m.inputs.map(itemName).join(", ")}.`);
      lines.push(`Now: ${STATE_TEXT[game.machineState(m)]}.`);
    }
  }
  return lines;
}

function showTooltip(tile, sx, sy) {
  let el = document.getElementById("tooltip");
  if (!tile || !game) { if (el) el.hidden = true; return; }
  const lines = hoverLines(tile.x, tile.y);
  if (!lines.length) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "tooltip";
    el.style.cssText = "position:absolute;pointer-events:none;background:var(--panel);color:var(--ink);padding:6px 9px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);font-size:0.8rem;line-height:1.35;max-width:260px;z-index:60;";
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.innerHTML = lines.join("<br>");
  const rect = canvas.getBoundingClientRect();
  el.style.left = `${Math.min(rect.left + sx + 16, window.innerWidth - el.offsetWidth - 8)}px`;
  el.style.top = `${Math.min(rect.top + sy + 16, window.innerHeight - el.offsetHeight - 8)}px`;
}

function showCard(sel) {
  hideCard();
  const el = document.createElement("div");
  el.id = "machine-card";
  el.className = "hud";
  el.style.cssText = "bottom:10px;right:12px;padding:0.75rem 1rem;max-width:280px;font-size:0.85rem;";
  document.getElementById("app").appendChild(el);
  const update = () => {
    if (!game) return;
    const lines = hoverLines(sel.x, sel.y);
    if (!lines.length) { hideCard(); return; }
    el.innerHTML = lines.join("<br>") + `<div style="color:var(--muted);margin-top:0.3rem;">F rotates. Delete removes.</div>`;
  };
  update();
  cardTimer = setInterval(update, 400);
}

function hideCard() {
  document.getElementById("machine-card")?.remove();
  if (cardTimer) { clearInterval(cardTimer); cardTimer = null; }
}

// ---- controls ---------------------------------------------------------------------

function togglePause() {
  if (!game) return;
  game.paused = !game.paused;
  status(game.paused ? "Paused. Space to resume." : "Running.");
  refreshTopbar();
}

function setSpeed(n) {
  if (!loop) return;
  loop.speed = n;
  status(`Speed ${n}x.`);
  refreshTopbar();
}

function fireHint() {
  if (!game) return;
  const jam = game.findJam();
  if (jam) {
    game.jam = jam;
    status(jam.msg);
    setTimeout(() => { if (game) game.jam = null; }, 10000);
  } else {
    game.jam = null;
    const c = campaign?.current;
    status(c ? `Nothing is stuck. The dock needs ${itemName(c.item)}. Open "How to make it" in the order panel.` : "Nothing is stuck right now.");
  }
}

// ---- perf overlay (?perf=1) ---------------------------------------------------------

function makePerfOverlay() {
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;right:12px;top:56px;background:rgba(0,0,0,0.7);color:#fff;font:12px ui-monospace,monospace;padding:6px 8px;border-radius:6px;z-index:80;white-space:pre;";
  document.body.appendChild(el);
  let samples = [];
  let last = performance.now();
  return {
    sample(ms, g) {
      samples.push(ms);
      const now = performance.now();
      if (now - last < 500) return;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const max = Math.max(...samples);
      const fps = (samples.length * 1000) / (now - last);
      el.textContent = `render avg ${avg.toFixed(2)} ms  max ${max.toFixed(2)} ms\nfps ${fps.toFixed(0)}  items ${g.itemCount()}`;
      window.__perf = { avg, max, fps, items: g.itemCount() };
      samples = [];
      last = now;
    },
  };
}

// ---- theme + keyboard ---------------------------------------------------------------

const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = saveSys.load()?.settings?.theme || (prefersDark ? "dark" : "light");

window.addEventListener("keydown", (e) => {
  if (!game || document.querySelector(".overlay")) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === " ") { e.preventDefault(); togglePause(); }
  else if (e.key === "h" || e.key === "H") fireHint();
  else if (e.key === ".") setSpeed(loop?.speed === 2 ? 1 : 2);
});

window.addEventListener("beforeunload", persist);

// ---- start ----------------------------------------------------------------------------

if (params.has("art")) {
  showArtSheet(document.getElementById("app"));
} else if (params.has("sandbox")) {
  startSandbox();
} else {
  const saved = saveSys.load();
  if (saved?.campaign) startCampaign(saveSys.restore(saved));
  else showMenu();
}

window.__output = {
  get game() { return game; }, get camera() { return camera; }, get input() { return input; },
  get campaign() { return campaign; }, saveSys, startSandbox, startCampaign, Campaign, showMenu, status,
};
