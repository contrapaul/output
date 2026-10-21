// Toolbar: the machine palette.
// Each button shows a keyboard shortcut (1..9, 0, -, =, [, ]) for fast selection.
// Letters are kept free for actions (F/R rotate, Q pipette, C center, H hint).

const TOOL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "[", "]"];

export class Toolbar {
  /**
   * @param {HTMLElement} el  the #toolbar div
   * @param {Array<{id:string,name:string,keys?:string}>} tools
   * @param {object} hooks { onToolChange(id) }
   */
  constructor(el, tools, hooks = {}) {
    this.el = el;
    this.tools = tools;
    this.hooks = hooks;
    this.active = null;
    this._build();
    this._bindKeys();
  }

  _build() {
    this.el.innerHTML = "";
    this.buttons = new Map();
    this.tools.forEach((tool, i) => {
      const key = TOOL_KEYS[i] || "";
      const btn = document.createElement("button");
      btn.className = "tool";
      btn.dataset.id = tool.id;
      btn.setAttribute("aria-label", `${tool.title || tool.name}${key ? ` (key ${key.toUpperCase()})` : ""}`);
      btn.title = tool.title || tool.name;
      btn.innerHTML = `<span class="key">${key ? key.toUpperCase() : ""}</span><span class="name">${tool.name}</span><span class="note"></span>`;
      btn.addEventListener("click", () => this.setActive(tool.id));
      this.el.appendChild(btn);
      this.buttons.set(tool.id, btn);
    });
  }

  setActive(id) {
    if (id === this.active) {
      // toggle off
      id = null;
    }
    this.active = id;
    for (const [tid, btn] of this.buttons) {
      btn.classList.toggle("active", tid === id);
    }
    this.hooks.onToolChange?.(id);
  }

  /** Small text under a tool's name (price, free builds). */
  setNote(id, text) {
    const btn = this.buttons.get(id);
    if (btn) btn.querySelector(".note").textContent = text || "";
  }

  /** Show `id` as active without telling anyone (used by the pipette). */
  mark(id) {
    this.active = id;
    for (const [tid, btn] of this.buttons) btn.classList.toggle("active", tid === id);
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      const idx = TOOL_KEYS.indexOf(k);
      if (idx === -1) return;
      const tool = this.tools[idx];
      if (!tool) return;
      e.preventDefault();
      this.setActive(tool.id);
    };
    window.addEventListener("keydown", this._onKey);
  }

  detach() {
    if (this._onKey) window.removeEventListener("keydown", this._onKey);
  }
}
