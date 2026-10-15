// Vector item icons drawn on canvas.
// Each item gets a unique shape + color + pattern.

import { ITEM_REGISTRY } from "./items.js";

export function drawItem(ctx, itemId, cx, cy, size, opts = {}) {
  const item = ITEM_REGISTRY[itemId];
  if (!item) {
    // unknown item: draw a question mark
    ctx.fillStyle = "#999";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const icon = item.icon;
  const s = size * 0.4; // half-size of the icon

  // base shape
  ctx.fillStyle = icon.color;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;

  switch (icon.base) {
    case "hex":
      drawHex(ctx, cx, cy, s);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "square":
      ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
      break;
    case "rect":
      ctx.fillRect(cx - s * 1.2, cy - s * 0.8, s * 2.4, s * 1.6);
      ctx.strokeRect(cx - s * 1.2, cy - s * 0.8, s * 2.4, s * 1.6);
      break;
    case "line":
      ctx.strokeStyle = icon.color;
      ctx.lineWidth = s * 0.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx + s, cy);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  }

  // pattern (stronger when colorblind mode is on: shape + pattern carry the
  // distinction, never color alone)
  ctx.strokeStyle = opts.cb ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)";
  ctx.lineWidth = opts.cb ? 2.2 : 1;
  if (icon.pattern === "rings") {
    for (let r = s * 0.3; r < s; r += s * 0.3) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (icon.pattern === "grid") {
    ctx.strokeRect(cx - s * 0.5, cy - s * 0.5, s, s);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.lineTo(cx, cy + s * 0.5);
    ctx.moveTo(cx - s * 0.5, cy);
    ctx.lineTo(cx + s * 0.5, cy);
    ctx.stroke();
  } else if (icon.pattern === "spiral") {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const r = (a / (Math.PI * 4)) * s * 0.8;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // sub-icons (assemblies)
  for (const sub of icon.sub) {
    drawItem(ctx, sub.part, cx + sub.at[0] * size, cy + sub.at[1] * size, size * 0.4, opts);
  }
}

function drawHex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
