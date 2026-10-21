// Art review sheet (?art=1): every part form, plus every contract item and
// the items inside it, drawn at belt size and at order-panel size, with
// labels. Add &cb=1 for colorblind patterns, &theme=dark for the dark theme.

import { RAW, make, itemName, parseItem, isPart } from "../game/items.js";
import { drawItem } from "../game/art.js";
import { CONTRACTS } from "../game/campaign.js";

function subItems(id, out) {
  out.add(id);
  for (const a of parseItem(id).args) if (!isPart(a) || a.includes("(")) subItems(a, out);
  return out;
}

export function showArtSheet(root) {
  const params = new URLSearchParams(window.location.search);
  const cb = params.has("cb");
  if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");
  root.innerHTML = "";
  root.style.cssText = "overflow:auto;height:100%;padding:16px;box-sizing:border-box;";

  const parts = [];
  for (const m of RAW) {
    let p = m;
    for (let c = 0; c <= 3; c++) {
      parts.push(p, make.press(p));
      p = make.cut(p);
    }
  }
  const assemblies = new Set();
  for (const c of CONTRACTS) subItems(c.item, assemblies);
  for (const p of parts) assemblies.delete(p);

  const section = (title, ids) => {
    const h = document.createElement("h2");
    h.textContent = title;
    h.style.cssText = "font:600 1rem system-ui;margin:16px 0 8px;";
    root.appendChild(h);
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;";
    for (const id of ids) {
      const card = document.createElement("div");
      card.style.cssText = "background:var(--panel);border-radius:8px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:4px;font:12px system-ui;text-align:center;";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;";
      for (const size of [25, 96]) {
        const cv = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        cv.width = cv.height = size * dpr;
        cv.style.width = cv.style.height = `${size}px`;
        const ctx = cv.getContext("2d");
        ctx.scale(dpr, dpr);
        drawItem(ctx, id, size / 2, size / 2, size, { cb, detail: size > 50 ? 4 : 1 });
        row.appendChild(cv);
      }
      const label = document.createElement("div");
      label.textContent = itemName(id);
      const code = document.createElement("code");
      code.textContent = id;
      code.style.cssText = "color:var(--muted);font-size:10px;word-break:break-all;";
      card.append(row, label, code);
      grid.appendChild(card);
    }
    root.appendChild(grid);
  };
  section("Parts: each material, cut 0 to 3 times, plain and pressed", parts);
  section("Assemblies and products used by the contracts", [...assemblies]);
}
