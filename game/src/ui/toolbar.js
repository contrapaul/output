// Toolbar: the machine palette. M0 has only `belt`.
// Each button shows a keyboard shortcut (Q..O) for fast selection.

const TOOL_KEYS = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a"];

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
      btn.setAttribute("aria-label", `${tool.name}${key ? ` (key ${key.toUpperCase()})` : ""}`);
      btn.innerHTML = `<span class="key">${key ? key.toUpperCase() : ""}</span><span class="name">${tool.name}</span>`;
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

  _bindKeys() {
    this._onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
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
