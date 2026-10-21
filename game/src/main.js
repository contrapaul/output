// Output (M3) — app shell.
// Boots: GameRoot + camera + renderer + input + toolbar + save.
// Adds: level registry (JSON files + free contracts), shop, settings,
// machine card + dock recipe, jam hints (H), stars, autosave + resume,
// speed control, level select grouped by tier.

import { GameLoop } from "./core/loop.js";
import { CONFIG } from "./core/config.js";
import { GameRoot } from "./game/root.js";
import { Camera } from "./game/camera.js";
import { Renderer } from "./game/renderer.js";
import { Input } from "./game/input.js";
import { Toolbar } from "./ui/toolbar.js";
import { SaveSystem } from "./game/save.js";
import { getItem } from "./game/items.js";
import { MACHINE_NAMES } from "./game/systems/process.js";

// ---- level registry ------------------------------------------------------

import tA from "../levels/t-a.json";
import tB from "../levels/t-b.json";
import tC from "../levels/t-c.json";
import u1 from "../levels/u1.json";
import u2 from "../levels/u2.json";
import u3 from "../levels/u3.json";
import u4 from "../levels/u4.json";
import u5 from "../levels/u5.json";
import u6 from "../levels/u6.json";
import u7 from "../levels/u7.json";
import u8 from "../levels/u8.json";
import u9 from "../levels/u9.json";
import u10 from "../levels/u10.json";
import sandbox from "../levels/sandbox.json";

const LEVELS = {
  "t-a": tA, "t-b": tB, "t-c": tC,
  u1, u2, u3, u4, u5, u6, u7, u8, u9, u10,
  sandbox,
};

const LEVEL_ORDER = ["t-a", "t-b", "t-c", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10"];
const TIERS = [
  { id: "novice", name: "Novice" },
  { id: "journeyman", name: "Journeyman" },
  { id: "engineer", name: "Engineer" },
  { id: "plant-manager", name: "Plant Manager" },
];

const ALL_MACHINES = ["belt", "belt_high", "saw", "press", "solder", "mounter", "encap", "merger", "splitter", "bin", "recycler"];

function freeContract(item, amount) {
  const hoppers = [
    { t: "hopper_ingot", x: 1, y: 1, r: 0 },
    { t: "hopper_wire", x: 1, y: 4, r: 0 },
    { t: "hopper_cell", x: 1, y: 7, r: 0 },
    { t: "hopper_case", x: 1, y: 10, r: 0 },
  ];
  const name = getItem(item)?.name || item;
  return {
    id: `free-${amount}-${item.split("(")[0]}`,
    tier: "free-contract",
    name: `Free contract: ${amount}x ${name}`,
    zone: { w: 16, h: 12 },
    fixed: [...hoppers, { t: "dock", x: 14, y: 5, r: 0, target: item, amount }],
    unlocked: ALL_MACHINES,
    target: { item, amount },
    stars: { time2: amount * 60, machines3: amount * 2 + 12 },
    hint: "Free contract: you chose the product and the amount. Build any factory you like.",
    learn: "open design",
  };
}

const FREE_CONTRACTS = [
  freeContract("solder(copper_coil|silicon_die)", 10),
  freeContract("mount(battery_cell|solder(copper_coil|silicon_die))", 12),
  freeContract("encap(housing|mount(battery_cell|solder(copper_coil|silicon_die)))", 8),
];

const UPGRADES = [
  { id: "motor2x", name: "Fast motors", price: 100, desc: "All machines work twice as fast." },
  { id: "bin20", name: "Big bins", price: 80, desc: "Bins store 20 parts instead of 10." },
  { id: "dock_express", name: "Express dock", price: 120, desc: "Earn 10 credits per delivery instead of 5." },
];

// ---- DOM refs -------------------------------------------------------------

const canvas = document.getElementById("playfield");
const toolbarEl = document.getElementById("toolbar");
const statusEl = document.getElementById("statusbar");
const status = (msg) => { statusEl.textContent = msg; };
const saveSys = new SaveSystem();
let save = saveSys.load(); // may be null; refreshed by persist()

let game, camera, renderer, input, toolbar, loop;
const perf = new URLSearchParams(window.location.search).has("perf") ? makePerfOverlay() : null;
let currentLevelId = null;
let cardTimer = null;

const profile = () => ({
  coins: save?.profile?.coins || 0,
  upgrades: save?.profile?.upgrades || [],
  contracts: save?.profile?.contracts || {},
  settings: save?.settings,
  stats: save?.stats,
});

// ---- boot ----------------------------------------------------------------

function bootLevel(levelId, opts = {}) {
  const contract = LEVELS[levelId] || FREE_CONTRACTS.find((f) => f.id === levelId);
  if (!contract) { showLevelSelect(); return; }
  currentLevelId = levelId;
  hideCard();
  document.querySelectorAll(".overlay").forEach((o) => o.remove());

  if (loop) loop.stop();
  if (input) input.detach();
  if (toolbar) toolbar.detach();
  game = new GameRoot(contract, profile());
  camera = new Camera(canvas, game.world.zone);
  renderer = new Renderer(canvas, camera, game);
  renderer.theme = document.documentElement.dataset.theme || "light";

  const tools = contract.unlocked.map((id) => ({ id, name: MACHINE_NAMES[id] || id }));
  toolbar = new Toolbar(toolbarEl, tools, { onToolChange: (id) => input?.setTool(id) });

  input = new Input(canvas, camera, game, renderer, {
    onToolChange: (id) => {
      toolbar.mark(id);
      status(id ? `${MACHINE_NAMES[id] || id}: click or drag to build. F rotates. Right-click to put it away.` : "Drag to move around. Right-drag to remove things.");
    },
    onStatus: status,
    onSelect: (sel) => (sel ? showCard(sel) : hideCard()),
    onHover: showTooltip,
    onChange: () => { game.jam = null; persist(); },
    canUseTool: (t) => contract.unlocked.includes(t),
  });
  input.attach();

  game.signals.on("itemAccepted", () => persist());
  game.signals.on("contractComplete", (info) => showComplete(contract, info));
  game.signals.on("upgradeBought", () => { persist(); renderShop(); });

  loop = new GameLoop({
    hz: CONFIG.SIM_HZ,
    tick: () => game.tick(),
    render: (dt, alpha) => {
      const t0 = performance.now();
      renderer.render(game.paused ? 1 : alpha);
      if (perf) perf.sample(performance.now() - t0, game);
    },
  });
  loop.start();

  // resume saved progress on this level (skipped on a fresh restart)
  if (!opts.fresh && save?.active?.level === levelId && save.active.machines?.length) {
    for (const m of save.active.machines) {
      if (game.world.machineAt(m.x, m.y, m.z || 0)) continue;
      if (contract.unlocked.includes(m.t)) game.placeMachine(m.t, m.x, m.y, m.r, m.z || 0);
    }
    game.placedCount = save.active.placedCount || 0;
    if (game.dock) {
      game.dock.accepted = Math.min(save.active.accepted || 0, game.dock.amount);
      game._completed = game.dock.accepted >= game.dock.amount;
    }
    game.time = save.active.time || 0;
    status("resumed your saved factory");
  } else {
    status(`${contract.name}: deliver ${contract.target ? contract.target.amount + "x " + (getItem(contract.target.item)?.name || "") : "nothing (sandbox)"}. Press H for a hint if stuck.`);
  }
}

function persist() {
  if (game) {
    saveSys.save(game);
    save = saveSys.serialize(game); // keep the in-memory copy current
  }
  refreshTopbar();
}

// ---- overlays ------------------------------------------------------------

function overlayShell(title) {
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

function showComplete(contract, info) {
  const o = overlayShell("Contract complete!");
  const starStr = ["", "★", "★★", "★★★"][info.stars] || "";
  const body = o.querySelector(".body");
  body.innerHTML = `
    <p style="font-size:2rem;letter-spacing:0.2rem;color:var(--accent);">${starStr}</p>
    <p style="margin:0 0 0.25rem;">${info.accepted}x ${getItem(contract.target.item)?.name || ""} delivered</p>
    <p style="margin:0 0 1rem;color:var(--muted);">earned ${info.earned} credits (total ${info.coins})</p>
    <div style="display:flex;gap:0.5rem;justify-content:center;">
      <button class="btn" data-act="restart">Restart</button>
      <button class="btn" data-act="next">Next level</button>
      <button class="btn" data-act="menu">Menu</button>
    </div>`;
  body.querySelector('[data-act="restart"]').addEventListener("click", () => { o.remove(); bootLevel(currentLevelId, { fresh: true }); });
  body.querySelector('[data-act="next"]').addEventListener("click", () => {
    o.remove();
    const idx = LEVEL_ORDER.indexOf(currentLevelId);
    if (idx >= 0 && idx < LEVEL_ORDER.length - 1) bootLevel(LEVEL_ORDER[idx + 1]);
    else showLevelSelect();
  });
  body.querySelector('[data-act="menu"]').addEventListener("click", () => { o.remove(); showLevelSelect(); });
}

function starsFor(levelId) {
  return profile().contracts[levelId]?.stars || 0;
}

function showLevelSelect() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const o = overlayShell("Output: choose a contract");
  const body = o.querySelector(".body");
  const coins = profile().coins;

  let html = `<div class="row-between" style="margin-bottom:1rem;">
      <span style="color:var(--muted);">credits: <strong>${coins}</strong></span>
      <div>
        <button class="btn sm" data-act="shop">Shop</button>
        <button class="btn sm" data-act="settings">Settings</button>
        <button class="btn sm" data-act="save">Export</button>
        <button class="btn sm" data-act="load">Import</button>
      </div>
    </div>`;
  for (const tier of TIERS) {
    const ids = LEVEL_ORDER.filter((id) => LEVELS[id].tier === tier.id);
    if (!ids.length) continue;
    html += `<h3 style="margin:0.8rem 0 0.3rem;color:var(--muted);text-transform:uppercase;font-size:0.75rem;">${tier.name}</h3>`;
    for (const id of ids) {
      const l = LEVELS[id];
      const s = starsFor(id);
      html += `<button class="btn level" data-level="${id}" style="text-align:left;">
        <span>${l.name}</span>
        <span style="color:var(--muted);font-size:0.8rem;">${l.target ? l.target.amount + "x" : "free"}</span>
        <span style="color:var(--accent);">${["", "★", "★★", "★★★"][s]}</span>
      </button>`;
    }
  }
  html += `<h3 style="margin:0.8rem 0 0.3rem;color:var(--muted);text-transform:uppercase;font-size:0.75rem;">Sandbox</h3>`;
  html += `<button class="btn level" data-level="sandbox" style="text-align:left;"><span>Sandbox</span><span style="color:var(--muted);font-size:0.8rem;">all machines, no order</span><span></span></button>`;
  html += `<h3 style="margin:0.8rem 0 0.3rem;color:var(--muted);text-transform:uppercase;font-size:0.75rem;">Free contracts</h3>`;
  for (const f of FREE_CONTRACTS) {
    html += `<button class="btn level" data-level="${f.id}" style="text-align:left;"><span>${f.name}</span><span style="color:var(--muted);font-size:0.8rem;">you design it</span><span></span></button>`;
  }

  body.innerHTML = html;
  body.querySelectorAll("[data-level]").forEach((btn) =>
    btn.addEventListener("click", () => { o.remove(); bootLevel(btn.dataset.level); })
  );
  body.querySelector('[data-act="shop"]').addEventListener("click", () => renderShop());
  body.querySelector('[data-act="settings"]').addEventListener("click", () => renderSettings());
  body.querySelector('[data-act="save"]').addEventListener("click", () => {
    const text = saveSys.exportString(game);
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "output-save.json";
    a.click();
  });
  body.querySelector('[data-act="load"]').addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json";
    inp.addEventListener("change", () => {
      const file = inp.files?.[0];
      if (!file) return;
      file.text().then((txt) => {
        const data = saveSys.import(txt);
        if (data) location.reload();
        else status("that save file could not be read");
      });
    });
    inp.click();
  });
}

function renderShop() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const o = overlayShell("Shop (optional upgrades)");
  const body = o.querySelector(".body");
  const draw = () => {
    const coins = game ? game.coins : profile().coins;
    const ups = game ? game.upgrades : new Set(profile().upgrades);
    body.innerHTML = `<p style="margin:0 0 0.5rem;color:var(--muted);">credits: <strong>${coins}</strong>. Upgrades help, but no level needs them.</p>` +
      UPGRADES.map((u) => {
        const owned = ups.has(u.id);
        return `<div class="shop-item" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid var(--grid);">
          <div><strong>${u.name}</strong><div style="color:var(--muted);font-size:0.85rem;">${u.desc}</div></div>
          <button class="btn sm" data-up="${u.id}" ${owned ? "disabled" : ""}>${owned ? "owned" : u.price + " cr"}</button>
        </div>`;
      }).join("") + `<div style="text-align:right;margin-top:0.75rem;"><button class="btn" data-act="close">Close</button></div>`;
    body.querySelectorAll("[data-up]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const u = UPGRADES.find((x) => x.id === btn.dataset.up);
        if (game && !game.buyUpgrade(u.id, u.price)) status("not enough credits");
        draw();
      })
    );
    body.querySelector('[data-act="close"]').addEventListener("click", () => o.remove());
  };
  draw();
}

function renderSettings() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const o = overlayShell("Settings");
  const body = o.querySelector(".body");
  const s = game ? game.settings : Object.assign({ theme: "light", motion: true, colorblind: false }, save?.settings || {});
  const apply = () => {
    if (game) game.settings = s;
    document.documentElement.dataset.theme = s.theme;
    if (renderer) renderer.theme = s.theme;
    persist();
  };
  body.innerHTML = `
    <label style="display:block;padding:0.4rem 0;">Theme
      <select id="set-theme">
        <option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option>
        <option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark</option>
      </select>
    </label>
    <label style="display:block;padding:0.4rem 0;"><input type="checkbox" id="set-motion" ${s.motion ? "checked" : ""} /> Motion (pulsing highlights and smooth items)</label>
    <label style="display:block;padding:0.4rem 0;"><input type="checkbox" id="set-cb" ${s.colorblind ? "checked" : ""} /> Colorblind patterns (stronger item markings)</label>
    <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:0.75rem;">
      <button class="btn" data-act="wipe">Wipe save</button>
      <button class="btn" data-act="close">Close</button>
    </div>`;
  body.querySelector("#set-theme").addEventListener("change", (e) => { s.theme = e.target.value; apply(); });
  body.querySelector("#set-motion").addEventListener("change", (e) => { s.motion = e.target.checked; apply(); });
  body.querySelector("#set-cb").addEventListener("change", (e) => { s.colorblind = e.target.checked; apply(); });
  body.querySelector('[data-act="close"]').addEventListener("click", () => o.remove());
  body.querySelector('[data-act="wipe"]').addEventListener("click", () => {
    saveSys.clear();
    save = null;
    location.reload();
  });
}

// ---- machine card + dock recipe -------------------------------------------

function showCard(sel) {
  hideCard();
  const el = document.createElement("div");
  el.id = "machine-card";
  el.className = "panel";
  el.style.cssText = "position:absolute;bottom:10px;right:12px;background:var(--panel);padding:0.75rem 1rem;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.2);max-width:280px;font-size:0.85rem;";
  document.body.appendChild(el);
  const update = () => {
    if (!game) return;
    const w = game.world.machineAt(sel.x, sel.y, 0);
    if (!w) { hideCard(); return; }
    if (w.t === "dock") {
      const item = game.dock?.target;
      const def = item ? getItem(item) : null;
      el.innerHTML = `<strong>${MACHINE_NAMES.dock}</strong>
        <div style="margin:0.3rem 0;">needs: <strong>${def?.name || "?"}</strong> (${game.dock.accepted}/${game.dock.amount})</div>
        ${def?.steps?.length ? `<div style="color:var(--muted);">how to make it:<ol style="margin:0.2rem 0 0 1.1rem;padding:0;">${def.steps.map((s) => `<li>${s}</li>`).join("")}</ol></div>` : ""}`;
      return;
    }
    const m = game.machines.get(sel.x + "," + sel.y);
    const h = m?.handler;
    if (!h) { hideCard(); return; }
    let state = "idle";
    if (m.isFull) state = "full (exit blocked)";
    else if (h.buffer) state = `storing ${m.buffer.length}/${game.binCapacity()}`;
    else if (m.outputs.length) state = "waiting to send out";
    else if (m.inputs.length >= (h.needs || 1)) state = "working";
    else if (m.inputs.length) state = `has ${m.inputs.length} of ${h.needs} parts`;
    el.innerHTML = `<strong>${MACHINE_NAMES[w.t] || w.t}</strong>
      <div style="margin:0.3rem 0;">in: ${h.inText || "?"}</div>
      <div style="margin:0.3rem 0;">out: ${h.outText || "?"}</div>
      <div style="color:var(--muted);">state: ${state}</div>
      <div style="color:var(--muted);margin-top:0.3rem;">F rotate, Del remove</div>`;
  };
  update();
  cardTimer = setInterval(update, 400);
}

function hideCard() {
  const el = document.getElementById("machine-card");
  if (el) el.remove();
  if (cardTimer) { clearInterval(cardTimer); cardTimer = null; }
}

// ---- hover tooltip ---------------------------------------------------------

const STATE_TEXT = {
  working: "working",
  waiting: "waiting for parts",
  blocked: "stuck: it cannot send its parts out",
};

function hoverLines(x, y) {
  const lines = [];
  const hopper = game.hoppers.find((h) => h.x === x && h.y === y);
  if (hopper) {
    lines.push(`<strong>Hopper</strong>`, `Gives a ${getItem(hopper.item)?.name || hopper.item} every ${Math.round(1 / hopper.rate)} seconds.`);
  }
  for (const w of game.world.stackAt(x, y).reverse()) {
    if (w.t === "belt" || w.t === "belt_high") {
      const line = game.world.lines.lineForTile(x, y, w.z);
      const fl = line && game.flowLines.get(line.id);
      const idx = line ? line.index(line.tiles.find((t) => t.x === x && t.y === y)?.key) : null;
      const n = fl && idx !== null ? fl.items.filter((it) => Math.floor(it.d) === idx).length : 0;
      lines.push(`<strong>${MACHINE_NAMES[w.t]}</strong>`, n ? `Carrying ${n} ${n === 1 ? "part" : "parts"}.` : "Moves parts the way the arrow points.");
    } else if (w.t === "dock") {
      const d = game.dock;
      lines.push(`<strong>${MACHINE_NAMES.dock}</strong>`, d ? `Needs ${getItem(d.target)?.name || d.target}: ${d.accepted} of ${d.amount}.` : "Takes finished products.");
    } else {
      const m = game.machines.get(x + "," + y);
      const h = m?.handler;
      if (!h) continue;
      lines.push(`<strong>${MACHINE_NAMES[w.t] || w.t}</strong>`, `Takes ${h.inText}.`, `Makes ${h.outText}.`, `Now: ${STATE_TEXT[game.machineState(m)]}.`);
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
    el.style.cssText = "position:absolute;pointer-events:none;background:var(--panel);color:var(--ink);padding:6px 9px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);font-size:0.8rem;line-height:1.35;max-width:240px;z-index:60;";
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.innerHTML = lines.join("<br>");
  const rect = canvas.getBoundingClientRect();
  const left = Math.min(rect.left + sx + 16, window.innerWidth - el.offsetWidth - 8);
  const top = Math.min(rect.top + sy + 16, window.innerHeight - el.offsetHeight - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

// ---- perf overlay (?perf=1) ------------------------------------------------

function makePerfOverlay() {
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;right:12px;top:12px;background:rgba(0,0,0,0.7);color:#fff;font:12px ui-monospace,monospace;padding:6px 8px;border-radius:6px;z-index:80;white-space:pre;";
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

// ---- top bar ---------------------------------------------------------------

function refreshTopbar() {
  const bar = document.getElementById("topbar");
  if (!bar || !game) return;
  const coins = game.coins;
  bar.querySelector("#tb-coins").textContent = `${coins} cr`;
  bar.querySelector("#tb-level").textContent = game.contract.name;
  bar.querySelector("#tb-speed").textContent = `speed ${loop?.speed || 1}x`;
}

function buildTopbar() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const bar = document.createElement("div");
  bar.id = "topbar";
  bar.style.cssText = "position:absolute;top:12px;left:12px;display:flex;gap:0.5rem;align-items:center;background:var(--panel);padding:6px 10px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.15);font-size:0.85rem;z-index:50;";
  bar.innerHTML = `
    <span id="tb-level" style="font-weight:600;"></span>
    <span id="tb-coins" style="color:var(--muted);"></span>
    <span id="tb-speed" style="color:var(--muted);"></span>
    <button class="btn sm" id="tb-pause">pause</button>
    <button class="btn sm" id="tb-speed2">2x</button>
    <button class="btn sm" id="tb-reset">reset</button>
    <button class="btn sm" id="tb-shop">shop</button>
    <button class="btn sm" id="tb-hint">hint (H)</button>
    <button class="btn sm" id="tb-menu">menu</button>`;
  document.body.appendChild(bar);
  bar.querySelector("#tb-pause").addEventListener("click", togglePause);
  bar.querySelector("#tb-speed2").addEventListener("click", () => setSpeed(loop?.speed === 2 ? 1 : 2));
  bar.querySelector("#tb-reset").addEventListener("click", () => { game.reset(); status("level reset"); });
  bar.querySelector("#tb-shop").addEventListener("click", renderShop);
  bar.querySelector("#tb-hint").addEventListener("click", fireHint);
  bar.querySelector("#tb-menu").addEventListener("click", showLevelSelect);
  refreshTopbar();
}

function togglePause() {
  if (!game) return;
  game.paused = !game.paused;
  status(game.paused ? "paused (Space to resume)" : "running");
}

function setSpeed(n) {
  if (!loop) return;
  loop.speed = n;
  status(`speed ${n}x`);
  refreshTopbar();
}

function fireHint() {
  if (!game) return;
  const jam = game.findJam();
  if (jam) {
    game.jam = jam;
    status(jam.msg);
    setTimeout(() => { game.jam = null; }, 10000);
  } else {
    game.jam = null;
    status(game.contract.hint || "Nothing is stuck right now.");
  }
}

// ---- theme + keyboard ------------------------------------------------------

const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = save?.settings?.theme || (prefersDark ? "dark" : "light");

window.addEventListener("keydown", (e) => {
  if (!game) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) return;
  if (e.key === " ") { e.preventDefault(); togglePause(); }
  else if (e.key === "h" || e.key === "H") fireHint();
  else if (e.key === ".") setSpeed(loop?.speed === 2 ? 1 : 2);
});

window.addEventListener("beforeunload", () => { if (game) saveSys.save(game); });

// ---- start -----------------------------------------------------------------

const urlLevel = new URLSearchParams(window.location.search).get("level");
buildTopbar();
if (urlLevel && (LEVELS[urlLevel] || FREE_CONTRACTS.some((f) => f.id === urlLevel))) {
  bootLevel(urlLevel);
} else if (save?.active?.level && (LEVELS[save.active.level] || FREE_CONTRACTS.some((f) => f.id === save.active.level))) {
  bootLevel(save.active.level);
} else {
  showLevelSelect();
}

window.__output = { get game() { return game; }, get camera() { return camera; }, get input() { return input; }, saveSys, bootLevel, showLevelSelect, status, LEVELS, FREE_CONTRACTS };
