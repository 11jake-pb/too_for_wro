import { HANGAR, LIMIT, MOD } from "./constants.js";
import { input, state } from "./state.js";
import {
  hangar, hangarRobot, hangarWorld, inputLen, inputModD, inputModW, inputModX, inputModY, inputW, inputWid,
} from "./dom.js";
import { clamp, clampW, faceAnchor, gapOk, legalize, nearestFace, selectedPart, sizeOf, snap } from "./geom.js";
import { refreshInspector, updateBbox, updateHangarChassis, updateHangarPart } from "./draw.js";
import { addPart, applyRobot, syncInputs } from "./field.js";

const ghost = document.createElement("div");
ghost.className = "drag-ghost";
ghost.hidden = true;
document.body.appendChild(ghost);

export function applyHangarTransform() {
  hangarWorld.style.transform = `translate(${state.hangarPanX}px, ${state.hangarPanY}px) scale(${state.hangarScale})`;
}

export function fitHangar() {
  const rect = hangar.getBoundingClientRect();
  const pad = 40;
  const s = clamp(Math.min((rect.width - pad * 2) / HANGAR, (rect.height - pad * 2) / HANGAR), 0.2, 4);
  state.hangarScale = s;
  state.hangarPanX = (rect.width - HANGAR * s) / 2;
  state.hangarPanY = (rect.height - HANGAR * s) / 2;
  applyHangarTransform();
}

export function hangarZoomAt(factor, cx, cy) {
  const prev = state.hangarScale;
  const next = clamp(prev * factor, 0.2, 6);
  const rect = hangar.getBoundingClientRect();
  const mx = cx - rect.left;
  const my = cy - rect.top;
  const wx = (mx - state.hangarPanX) / prev;
  const wy = (my - state.hangarPanY) / prev;
  state.hangarScale = next;
  state.hangarPanX = mx - wx * next;
  state.hangarPanY = my - wy * next;
  applyHangarTransform();
}

export function hangarWorldFromPointer(e) {
  const rect = hangar.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - state.hangarPanX) / state.hangarScale,
    y: (e.clientY - rect.top - state.hangarPanY) / state.hangarScale,
  };
}

export function hangarToLocal(wx, wy) {
  return { x: wx - HANGAR / 2, y: HANGAR / 2 - wy };
}

export function resizeFromLocal(local, handle) {
  const hx = handle || "";
  const both = hx === "";
  if (both || hx.includes("e") || hx.includes("w")) {
    const blocked = (hx.includes("e") && local.x < 12) || (hx.includes("w") && local.x > -12);
    if (both || !blocked) state.width = clamp(snap(Math.abs(local.x) * 2), 40, LIMIT);
  }
  if (both || hx.includes("n") || hx.includes("s")) {
    const blocked = (hx.includes("n") && local.y < 12) || (hx.includes("s") && local.y > -12);
    if (both || !blocked) state.length = clamp(snap(Math.abs(local.y) * 2), 40, LIMIT);
  }
  state.W = clampW(state.W);
}
export function scheduleLive(fn) {
  if (!input.hangarDrag) return;
  input.hangarDrag.tick = fn;
  if (input.liveRaf) return;
  input.liveRaf = requestAnimationFrame(() => {
    input.liveRaf = 0;
    if (input.hangarDrag && input.hangarDrag.tick) input.hangarDrag.tick();
  });
}

hangar.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    hangarZoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  },
  { passive: false }
);

hangar.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest(".hangar-tools")) return;
  if (input.spaceDown) {
    e.preventDefault();
    input.hangarPan = { id: e.pointerId, x: e.clientX, y: e.clientY, px: state.hangarPanX, py: state.hangarPanY };
    hangar.setPointerCapture(e.pointerId);
    hangar.classList.add("panning");
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    state.selected = { type: "chassis" };
    input.hangarDrag = { kind: "resize", handle: "", id: e.pointerId };
    hangar.setPointerCapture(e.pointerId);
    refreshInspector();
  }
});
hangar.addEventListener("pointermove", (e) => {
  if (input.hangarPan && e.pointerId === input.hangarPan.id) {
    state.hangarPanX = input.hangarPan.px + (e.clientX - input.hangarPan.x);
    state.hangarPanY = input.hangarPan.py + (e.clientY - input.hangarPan.y);
    applyHangarTransform();
    return;
  }
  if (input.hangarDrag && input.hangarDrag.kind === "resize" && e.pointerId === input.hangarDrag.id && e.currentTarget === hangar) {
    const local = hangarToLocal(hangarWorldFromPointer(e).x, hangarWorldFromPointer(e).y);
    scheduleLive(() => {
      resizeFromLocal(local, input.hangarDrag.handle);
      updateHangarChassis();
      syncInputs();
    });
  }
});
hangar.addEventListener("pointerup", (e) => {
  if (input.hangarPan && e.pointerId === input.hangarPan.id) {
    input.hangarPan = null;
    hangar.classList.remove("panning");
  }
  if (input.hangarDrag && e.pointerId === input.hangarDrag.id && input.hangarDrag.kind === "resize") {
    input.hangarDrag = null;
    applyRobot();
    syncInputs();
  }
});

export function resizeWheel(local, drag) {
  const dx = local.x - drag.x0;
  const signed = drag.side === "left" ? -dx : dx;
  state.W = clampW(snap(drag.w0 + signed * 2));
}

export function startHangarDrag(e) {
  if (input.spaceDown) return;
  if (e.button !== 0) return;
  e.stopPropagation();
  const handle = e.target.closest("[data-h]");
  const wheel = e.target.closest("[data-wheel]");
  const mod = e.target.closest("[data-part-id]");
  const local = hangarToLocal(hangarWorldFromPointer(e).x, hangarWorldFromPointer(e).y);
  const ctrl = e.ctrlKey || e.metaKey;

  if (wheel && !handle) {
    e.preventDefault();
    state.selected = { type: "chassis" };
    input.hangarDrag = {
      kind: "wheel",
      side: wheel.getAttribute("data-wheel"),
      id: e.pointerId,
      x0: local.x,
      y0: local.y,
      w0: state.W,
    };
  } else if (handle || ctrl) {
    e.preventDefault();
    state.selected = { type: "chassis" };
    input.hangarDrag = { kind: "resize", handle: handle ? handle.dataset.h : "", id: e.pointerId };
  } else if (mod) {
    const id = Number(mod.getAttribute("data-part-id"));
    const part = state.parts.find((p) => p.id === id);
    state.selected = { type: "part", id };
    input.hangarDrag = {
      kind: "module",
      id: e.pointerId,
      partId: id,
      dx: local.x - part.x,
      dy: local.y - part.y,
    };
  } else {
    state.selected = { type: "chassis" };
    input.hangarDrag = null;
    refreshInspector();
    return;
  }
  hangarRobot.setPointerCapture(e.pointerId);
  refreshInspector();
}

hangarRobot.addEventListener("pointerdown", startHangarDrag);

hangarRobot.addEventListener("pointermove", (e) => {
  if (!input.hangarDrag || e.pointerId !== input.hangarDrag.id) return;
  const local = hangarToLocal(hangarWorldFromPointer(e).x, hangarWorldFromPointer(e).y);
  if (input.hangarDrag.kind === "resize") {
    scheduleLive(() => {
      resizeFromLocal(local, input.hangarDrag.handle);
      updateHangarChassis();
      syncInputs();
    });
    return;
  }
  if (input.hangarDrag.kind === "wheel") {
    scheduleLive(() => {
      resizeWheel(local, input.hangarDrag);
      updateHangarChassis();
      syncInputs();
    });
    return;
  }
  const part = state.parts.find((p) => p.id === input.hangarDrag.partId);
  if (!part) return;
  const nx = snap(local.x - input.hangarDrag.dx);
  const ny = snap(local.y - input.hangarDrag.dy);
  const face = nearestFace(nx, ny);
  const along = face === "front" || face === "back" ? nx : ny;
  const sz = sizeOf(part);
  const trial = { ...faceAnchor(part.kind, face, along, sz.d), kind: part.kind, w: sz.w, d: sz.d };
  if (gapOk(trial, part.id)) {
    Object.assign(part, trial);
    scheduleLive(() => {
      updateHangarPart(part);
      updateHangarChassis();
      if (selectedPart() && selectedPart().id === part.id) {
        inputModX.value = part.x.toFixed(0);
        inputModY.value = part.y.toFixed(0);
      }
    });
  }
});

hangarRobot.addEventListener("pointerup", () => {
  if (!input.hangarDrag) return;
  input.hangarDrag = null;
  updateBbox();
  refreshInspector();
});

document.querySelectorAll(".part-card").forEach((card) => {
  const kind = card.dataset.part;
  card.addEventListener("pointerdown", (e) => {
    if (kind === "chassis") return;
    input.paletteDrag = { kind, x: e.clientX, y: e.clientY, moved: false };
    ghost.innerHTML = card.querySelector("svg").outerHTML;
    ghost.hidden = false;
    ghost.style.left = `${e.clientX - 28}px`;
    ghost.style.top = `${e.clientY - 28}px`;
  });
  card.addEventListener("click", (e) => {
    e.preventDefault();
    if (kind === "chassis") {
      state.selected = { type: "chassis" };
      refreshInspector();
      return;
    }
    if (input.skipPartClick) {
      input.skipPartClick = false;
      return;
    }
    addPart(kind, 0, kind === "clamp" ? 80 : -80);
    applyRobot();
    syncInputs();
  });
});

window.addEventListener("pointermove", (e) => {
  if (!input.paletteDrag) return;
  if (Math.hypot(e.clientX - input.paletteDrag.x, e.clientY - input.paletteDrag.y) > 6) input.paletteDrag.moved = true;
  ghost.style.left = `${e.clientX - 28}px`;
  ghost.style.top = `${e.clientY - 28}px`;
});

window.addEventListener("pointerup", (e) => {
  if (!input.paletteDrag) return;
  ghost.hidden = true;
  const { kind, moved } = input.paletteDrag;
  input.paletteDrag = null;
  if (!moved) return;
  input.skipPartClick = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el && hangar.contains(el)) {
    const local = hangarToLocal(hangarWorldFromPointer(e).x, hangarWorldFromPointer(e).y);
    addPart(kind, local.x, local.y);
    applyRobot();
    syncInputs();
  }
});

document.querySelectorAll("#inspect-sides button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const part = selectedPart();
    if (!part) return;
    const along = part.face === "front" || part.face === "back" ? part.x : part.y;
    const sz = sizeOf(part);
    const next = legalize(part.kind, { ...faceAnchor(part.kind, btn.dataset.side, along, sz.d), face: btn.dataset.side, w: sz.w, d: sz.d }, part.id);
    if (next) Object.assign(part, next);
    applyRobot();
  });
});

document.getElementById("btn-detach").addEventListener("click", () => {
  const part = selectedPart();
  if (!part) return;
  state.parts = state.parts.filter((p) => p.id !== part.id);
  state.selected = { type: "chassis" };
  applyRobot();
});

export function readChassis() {
  state.length = clamp(Number(inputLen.value) || 200, 40, LIMIT);
  state.width = clamp(Number(inputWid.value) || 180, 40, LIMIT);
  state.W = clampW(Number(inputW.value) || 130);
  applyRobot();
  syncInputs();
}

export function readModuleSize() {
  const part = selectedPart();
  if (!part || (part.kind !== "clamp" && part.kind !== "gripper")) return;
  const def = part.kind === "gripper" ? MOD.gripper : MOD.clamp;
  part.w = clamp(Number(inputModW.value) || def.w, 16, 120);
  part.d = clamp(Number(inputModD.value) || def.d, 20, 160);
  applyRobot();
}

export function readModulePos() {
  const part = selectedPart();
  if (!part) return;
  const x = snap(Number(inputModX.value) || 0);
  const y = snap(Number(inputModY.value) || 0);
  const face = nearestFace(x, y);
  const along = face === "front" || face === "back" ? x : y;
  const sz = sizeOf(part);
  const next = legalize(part.kind, { ...faceAnchor(part.kind, face, along, sz.d), face, w: sz.w, d: sz.d }, part.id);
  if (next) Object.assign(part, next);
  applyRobot();
}

export function bindHangar() {
  document.getElementById("hangar-zoom-in").addEventListener("click", () => {
    const r = hangar.getBoundingClientRect();
    hangarZoomAt(1.2, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.getElementById("hangar-zoom-out").addEventListener("click", () => {
    const r = hangar.getBoundingClientRect();
    hangarZoomAt(1 / 1.2, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.getElementById("hangar-fit").addEventListener("click", fitHangar);
  inputLen.addEventListener("change", readChassis);
  inputWid.addEventListener("change", readChassis);
  inputW.addEventListener("change", readChassis);
  inputModX.addEventListener("change", readModulePos);
  inputModY.addEventListener("change", readModulePos);
  inputModW.addEventListener("change", readModuleSize);
  inputModD.addEventListener("change", readModuleSize);
}
