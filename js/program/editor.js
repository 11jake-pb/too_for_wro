import { session } from "./session.js";
import { PALETTE, SPECS } from "./specs.js";
import { isValue, make, num, take } from "./ast.js";
import { generate } from "./codegen.js";
import { parseProgram } from "./parse.js";

export const paletteEl = document.getElementById("block-palette");
export const scriptEl = document.getElementById("block-script");
export const workspaceEl = document.getElementById("block-workspace");
export const codeText = document.getElementById("code-text");
export const codeError = document.getElementById("code-error");
export const btnBlocks = document.getElementById("code-mode-blocks");
export const btnText = document.getElementById("code-mode-text");
export const programScreen = document.getElementById("screen-program");

export function nameSelect(which, current) {
  const names = which === "vars" ? session.ws.vars : session.ws.lists;
  const sel = document.createElement("select");
  names.forEach((n) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    if (n === current) o.selected = true;
    sel.appendChild(o);
  });
  if (!names.includes(current) && current) {
    const o = document.createElement("option");
    o.value = current;
    o.textContent = current;
    o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

export function renderSlot(node, key, kind) {
  const wrap = document.createElement("span");
  wrap.className = "val-slot";
  wrap.dataset.slot = key;
  wrap.dataset.host = node.id;
  const child = node.values[key];
  if (child) wrap.appendChild(renderNode(child, true));
  else {
    wrap.classList.add("empty");
    wrap.textContent = kind === "COND" || !kind ? "■" : " ";
  }
  return wrap;
}

export function renderNode(node, asValue) {
  const spec = SPECS[node.kind];
  const el = document.createElement("div");
  el.className = "blk" + (asValue || spec.shape === "val" ? " blk-val" : " blk-stmt") + (spec.shape.startsWith("c") ? " blk-c" : "");
  el.dataset.id = node.id;
  el.dataset.kind = node.kind;
  el.style.setProperty("--blk", session.COLORS[spec.cat]);
  if (session.selected === node.id) el.classList.add("on");
  let row = document.createElement("div");
  row.className = "blk-row";
  const flushRow = () => {
    if (row.childNodes.length) el.appendChild(row);
  };
  for (const part of spec.parts) {
    if (typeof part === "string") {
      const t = document.createElement("span");
      t.textContent = part;
      row.appendChild(t);
      continue;
    }
    if (part.v) {
      row.appendChild(renderSlot(node, part.v, part.v));
      continue;
    }
    if (part.f) {
      if (part.options) {
        const sel = document.createElement("select");
        part.options.forEach(([label, val]) => {
          const o = document.createElement("option");
          o.value = val;
          o.textContent = label;
          if (String(node.fields[part.f]) === String(val)) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", () => {
          node.fields[part.f] = sel.value;
          persist();
        });
        sel.addEventListener("pointerdown", (e) => e.stopPropagation());
        row.appendChild(sel);
      } else if (part.vars || part.lists) {
        const sel = nameSelect(part.vars ? "vars" : "lists", node.fields[part.f]);
        sel.addEventListener("change", () => {
          node.fields[part.f] = sel.value;
          persist();
        });
        sel.addEventListener("pointerdown", (e) => e.stopPropagation());
        row.appendChild(sel);
      } else {
        const inp = document.createElement("input");
        inp.value = node.fields[part.f] ?? "";
        inp.size = Math.max(2, String(inp.value).length);
        inp.addEventListener("input", () => {
          node.fields[part.f] = inp.value;
          inp.size = Math.max(2, inp.value.length);
          persist();
        });
        inp.addEventListener("pointerdown", (e) => e.stopPropagation());
        row.appendChild(inp);
      }
      continue;
    }
    if (part.stack) {
      flushRow();
      const mouth = document.createElement("div");
      mouth.className = "blk-mouth";
      mouth.dataset.stack = part.stack;
      mouth.dataset.host = node.id;
      (node.stacks[part.stack] || []).forEach((ch, idx) => {
        mouth.appendChild(insertBar(node.stacks[part.stack], idx));
        mouth.appendChild(renderNode(ch, false));
      });
      mouth.appendChild(insertBar(node.stacks[part.stack], (node.stacks[part.stack] || []).length));
      el.appendChild(mouth);
      row = document.createElement("div");
      row.className = "blk-row blk-mid";
    }
  }
  flushRow();
  return el;
}

export function insertBar(arr, index) {
  const bar = document.createElement("div");
  bar.className = "insert-bar";
  bar.dataset.index = String(index);
  bar._arr = arr;
  return bar;
}

export function renderScript() {
  if (session.source === "text") {
    programScreen?.classList.add("text-source");
    return;
  }
  programScreen?.classList.remove("text-source");
  if (!scriptEl) return;
  scriptEl.innerHTML = "";
  session.ws.script.forEach((n, i) => {
    scriptEl.appendChild(insertBar(session.ws.script, i));
    scriptEl.appendChild(renderNode(n, false));
  });
  scriptEl.appendChild(insertBar(session.ws.script, session.ws.script.length));
  codeText.value = generate();
  codeError.textContent = "";
  syncSweepPreview();
}

export function ensureLayoutVars() {
  ["n", "i", "held", "unused", "gx", "gy"].forEach((name) => {
    if (!session.ws.vars.includes(name)) session.ws.vars.push(name);
  });
  if (!session.ws.lists.includes("colors")) session.ws.lists.unshift("colors");
}

export function getProgramSource() {
  if (session.source === "text") return codeText?.value || "";
  return generate();
}

export function syncSweepPreview() {
  const el = document.getElementById("sweep-preview");
  if (el) el.value = getProgramSource();
}

export function persist() {
  if (session.source === "blocks") codeText.value = generate();
  syncSweepPreview();
  try {
    localStorage.setItem(
      session.STORE,
      JSON.stringify({
        ws: session.ws,
        nid: session.nid,
        source: session.source,
        text: session.source === "text" ? codeText.value : generate(),
      })
    );
  } catch (_) {}
}

export function restore() {
  try {
    const raw = localStorage.getItem(session.STORE);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.ws) session.ws = data.ws;
    if (data.nid) session.nid = data.nid;
    if (data.source === "text" || data.source === "blocks") session.source = data.source;
    if (data.text && data.source === "text") codeText.value = data.text;
  } catch (_) {}
  ensureLayoutVars();
}

export function loadProgramText(text) {
  const src = String(text || "");
  codeText.value = src;
  ensureLayoutVars();
  try {
    session.ws.script = parseProgram(src);
    codeError.textContent = "";
    if (session.source === "blocks") {
      renderPalette();
      renderScript();
    }
  } catch (err) {
    session.source = "text";
    btnBlocks?.classList.remove("active");
    btnText?.classList.add("active");
    if (codeText) codeText.readOnly = false;
    programScreen?.classList.add("text-source");
    if (codeError) codeError.textContent = String(err.message || err);
  }
  persist();
}

export function renderPalette() {
  paletteEl.innerHTML = "";
  const title = document.createElement("p");
  title.className = "dock-title";
  title.textContent = "블록";
  paletteEl.appendChild(title);
  PALETTE.forEach((cat) => {
    const h = document.createElement("p");
    h.className = "pal-cat";
    h.textContent = cat.title;
    paletteEl.appendChild(h);
    if (cat.cat === "field") {
      const note = document.createElement("p");
      note.className = "hint pal-hint";
      note.textContent = "실행마다 colors·unused가 바뀝니다. 슬롯 i(1~4), 박물관은 held 색. 120배치 공통 프로그램용.";
      paletteEl.appendChild(note);
    }
    if (cat.cat === "vars" || cat.cat === "lists") {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "pal-new";
      add.textContent = cat.cat === "vars" ? "+ 변수" : "+ 리스트";
      add.addEventListener("click", () => {
        const name = prompt(cat.cat === "vars" ? "변수 이름" : "리스트 이름");
        if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return;
        const list = cat.cat === "vars" ? session.ws.vars : session.ws.lists;
        if (!list.includes(name)) list.push(name);
        renderPalette();
        renderScript();
        persist();
      });
      paletteEl.appendChild(add);
    }
    cat.kinds.forEach((kind) => {
      const proto = make(kind);
      const el = renderNode(proto, isValue(kind));
      el.classList.add("pal-item");
      el.dataset.palette = kind;
      paletteEl.appendChild(el);
    });
  });
}

export function closestDrop(x, y, movingIsValue) {
  const hits = [];
  if (movingIsValue) {
    workspaceEl.querySelectorAll(".val-slot").forEach((slot) => {
      const r = slot.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d < 56) hits.push({ d, type: "value", slot });
    });
  } else {
    workspaceEl.querySelectorAll(".insert-bar").forEach((bar) => {
      const r = bar.getBoundingClientRect();
      const d = Math.abs(y - (r.top + r.height / 2)) + Math.abs(x - (r.left + r.width / 2)) * 0.2;
      if (d < 48) hits.push({ d, type: "insert", bar });
    });
  }
  hits.sort((a, b) => a.d - b.d);
  return hits[0] || null;
}

export function clearMarks() {
  workspaceEl.querySelectorAll(".drop-on").forEach((el) => el.classList.remove("drop-on"));
}

export function onPalettePointer(e, kind) {
  if (e.button !== 0 || session.source === "text") return;
  e.preventDefault();
  const node = make(kind);
  beginDrag(e, node, true);
}

export function beginDrag(e, node, fromPalette) {
  session.drag = {
    node,
    fromPalette,
    value: isValue(node.kind),
    x: e.clientX,
    y: e.clientY,
    ghost: null,
  };
  const ghost = renderNode(node, session.drag.value);
  ghost.classList.add("blk-ghost");
  document.body.appendChild(ghost);
  session.drag.ghost = ghost;
  moveGhost(e.clientX, e.clientY);
  window.setPointerCapture?.(e.pointerId);
}

export function moveGhost(x, y) {
  if (!session.drag?.ghost) return;
  session.drag.ghost.style.left = x + 8 + "px";
  session.drag.ghost.style.top = y + 8 + "px";
}

workspaceEl.addEventListener("pointerdown", (e) => {
  if (session.source === "text") return;
  if (e.target.closest("input, select, button")) return;
  const blk = e.target.closest(".blk");
  if (!blk || blk.classList.contains("pal-item")) return;
  const id = blk.dataset.id;
  session.selected = id;
  const node = take(id);
  if (!node) return;
  renderScript();
  beginDrag(e, node, false);
  e.preventDefault();
});

paletteEl.addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".pal-item");
  if (!item) return;
  onPalettePointer(e, item.dataset.kind);
});

window.addEventListener("pointermove", (e) => {
  if (!session.drag) return;
  moveGhost(e.clientX, e.clientY);
  clearMarks();
  const drop = closestDrop(e.clientX, e.clientY, session.drag.value);
  if (drop?.type === "insert") drop.bar.classList.add("drop-on");
  if (drop?.type === "value") drop.slot.classList.add("drop-on");
});

window.addEventListener("pointerup", (e) => {
  if (!session.drag) return;
  const moving = session.drag;
  session.drag.ghost?.remove();
  session.drag = null;
  clearMarks();
  const overPal = paletteEl.contains(document.elementFromPoint(e.clientX, e.clientY));
  if (overPal && !moving.fromPalette) {
    session.selected = null;
    renderScript();
    persist();
    return;
  }
  const drop = closestDrop(e.clientX, e.clientY, moving.value);
  if (moving.value) {
    if (drop?.type === "value") {
      const hostId = drop.slot.dataset.host;
      const key = drop.slot.dataset.slot;
      const host = locateNode(session.ws.script, hostId);
      if (host) host.values[key] = moving.node;
    }
  } else if (drop?.type === "insert") {
    const arr = drop.bar._arr;
    const idx = Number(drop.bar.dataset.index);
    arr.splice(idx, 0, moving.node);
  } else if (workspaceEl.contains(document.elementFromPoint(e.clientX, e.clientY))) {
    session.ws.script.push(moving.node);
  } else if (!moving.fromPalette) {
    session.ws.script.push(moving.node);
  }
  session.selected = moving.node.id;
  renderPalette();
  renderScript();
  persist();
});

export function locateNode(arr, id) {
  for (const n of arr) {
    if (n.id === id) return n;
    for (const ch of Object.values(n.values || {})) {
      if (!ch) continue;
      if (ch.id === id) return ch;
      const hit = locateNode([ch], id);
      if (hit) return hit;
    }
    for (const st of Object.values(n.stacks || {})) {
      const hit = locateNode(st, id);
      if (hit) return hit;
    }
  }
  return null;
}

window.addEventListener("keydown", (e) => {
  if (session.source === "text") return;
  if (e.target.closest("input, textarea, select")) return;
  if ((e.key === "Delete" || e.key === "Backspace") && session.selected) {
    take(session.selected);
    session.selected = null;
    renderScript();
    persist();
  }
});

export function setSource(mode) {
  if (mode === "blocks" && session.source === "text") {
    try {
      session.ws.script = parseProgram(codeText.value);
      codeError.textContent = "";
    } catch (err) {
      codeError.textContent = String(err.message || err);
      return;
    }
  }
  session.source = mode;
  btnBlocks.classList.toggle("active", mode === "blocks");
  btnText.classList.toggle("active", mode === "text");
  codeText.readOnly = mode === "blocks";
  programScreen?.classList.toggle("text-source", mode === "text");
  if (mode === "blocks") {
    renderPalette();
    renderScript();
  }
  persist();
}

btnBlocks.addEventListener("click", () => setSource("blocks"));
btnText.addEventListener("click", () => setSource("text"));
codeText.addEventListener("input", () => {
  if (session.source === "text") persist();
});

restore();
ensureLayoutVars();
if (!session.ws.script.length && session.source === "blocks") {
  session.ws.script = [
    make("go_straight"),
    Object.assign(make("point_turn"), { values: { H: num(0) } }),
  ];
}
btnBlocks.classList.toggle("active", session.source === "blocks");
btnText.classList.toggle("active", session.source === "text");
codeText.readOnly = session.source === "blocks";
programScreen?.classList.toggle("text-source", session.source === "text");
if (session.source === "blocks") {
  renderPalette();
  renderScript();
} else if (!codeText.value.trim()) {
  codeText.value = generate();
}
