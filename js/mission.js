import { COLOR_ORDER, CORRIDOR_X, MAT } from "./constants.js";
import { input, state } from "./state.js";
import {
  artsEl, artPosLabel, hangar, inputH, inputX, inputY, keepArtsEl, lockStart, robotEl, swatchesEl, useUnusedEl, viewport, world,
  zoomLabel,
} from "./dom.js";
import { clamp, wrapHeading } from "./geom.js";
import {
  applyLivePose, applyRobot, commitStart, paintArts,
  resetArtsHome, saveMissionLayout, setRunStatus, setUseUnused, showSnapGuide, snapArtXY, snapCorridorX,
  swapArtsOnDrop, swapUnused, syncInputs, syncPoseLock, updateArtLabel, updateDeadLayer,
} from "./field.js";

export function applyWorldTransform() {
  world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
  zoomLabel.textContent = `줌 ${Math.round(state.scale * 100)}%`;
}

export function renderArts() {
  if (!state.arts.length) resetArtsHome();
  paintArts();
  updateDeadLayer();
}

export function randomLayout() {
  const all = [...COLOR_ORDER];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  if (state.useUnused) {
    state.slots = all;
  } else {
    state.unused = all[4];
    state.slots = all.slice(0, 4);
  }
  resetArtsHome();
  renderArts();
  saveMissionLayout();
}

export function fitView() {
  const rect = viewport.getBoundingClientRect();
  const pad = 24;
  const sx = (rect.width - pad * 2) / MAT.w;
  const sy = (rect.height - pad * 2) / MAT.h;
  state.scale = clamp(Math.min(sx, sy), 0.08, 8);
  state.panX = (rect.width - MAT.w * state.scale) / 2;
  state.panY = (rect.height - MAT.h * state.scale) / 2;
  applyWorldTransform();
}

export function zoomAt(factor, cx, cy) {
  const prev = state.scale;
  const next = clamp(prev * factor, 0.08, 12);
  const rect = viewport.getBoundingClientRect();
  const mx = cx - rect.left;
  const my = cy - rect.top;
  const wx = (mx - state.panX) / prev;
  const wy = (my - state.panY) / prev;
  state.scale = next;
  state.panX = mx - wx * next;
  state.panY = my - wy * next;
  applyWorldTransform();
}

viewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  },
  { passive: false }
);
export function setSpace(on) {
  input.spaceDown = on;
  hangar.classList.toggle("can-input.pan", on);
  viewport.classList.toggle("can-input.pan", on);
}

window.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, [contenteditable]")) return;
  if (e.code === "Space") {
    e.preventDefault();
    setSpace(true);
    return;
  }
  if (state.tab !== "mission" || state.running || state.poseLocked) return;
  const step = e.shiftKey ? 10 : 1;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    state.x = snapCorridorX(clamp(state.x - step, 0, MAT.w));
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    state.x = snapCorridorX(clamp(state.x + step, 0, MAT.w));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.y = clamp(state.y - step, 0, MAT.h);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    state.y = clamp(state.y + step, 0, MAT.h);
  } else if (e.key === "[" || e.key === ",") {
    e.preventDefault();
    state.heading = wrapHeading(state.heading - step);
  } else if (e.key === "]" || e.key === ".") {
    e.preventDefault();
    state.heading = wrapHeading(state.heading + step);
  } else {
    return;
  }
  commitStart();
  applyLivePose();
  syncInputs();
});
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  setSpace(false);
  if (input.pan) {
    input.pan = null;
    input.hangarPan = null;
    hangar.classList.remove("panning");
    viewport.classList.remove("panning");
  }
});
window.addEventListener("blur", () => setSpace(false));

viewport.addEventListener("pointerdown", (e) => {
  if (!input.spaceDown || e.button !== 0) return;
  if (e.target.closest(".robot") && !input.spaceDown) return;
  e.preventDefault();
  input.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
  viewport.setPointerCapture(e.pointerId);
  viewport.classList.add("panning");
});
viewport.addEventListener("pointermove", (e) => {
  if (!input.pan || e.pointerId !== input.pan.id) return;
  state.panX = input.pan.px + (e.clientX - input.pan.x);
  state.panY = input.pan.py + (e.clientY - input.pan.y);
  applyWorldTransform();
});
export function endPan(e) {
  if (input.pan && e.pointerId === input.pan.id) {
    input.pan = null;
    viewport.classList.remove("panning");
  }
}
viewport.addEventListener("pointerup", endPan);
viewport.addEventListener("pointercancel", endPan);

export function worldFromPointer(e) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - state.panX) / state.scale,
    y: (e.clientY - rect.top - state.panY) / state.scale,
  };
}

robotEl.addEventListener("pointerdown", (e) => {
  if (input.spaceDown || state.poseLocked || state.running) return;
  e.stopPropagation();
  const worldPt = worldFromPointer(e);
  if (e.shiftKey) {
    input.fieldDrag = {
      kind: "rotate",
      id: e.pointerId,
      originH: state.heading,
      originA: (Math.atan2(worldPt.x - state.x, worldPt.y - state.y) * 180) / Math.PI,
    };
  } else {
    input.fieldDrag = { kind: "move", id: e.pointerId, dx: worldPt.x - state.x, dy: worldPt.y - state.y };
  }
  robotEl.setPointerCapture(e.pointerId);
});
robotEl.addEventListener("pointermove", (e) => {
  if (!input.fieldDrag || e.pointerId !== input.fieldDrag.id) return;
  const worldPt = worldFromPointer(e);
  if (input.fieldDrag.kind === "rotate") {
    const ang = (Math.atan2(worldPt.x - state.x, worldPt.y - state.y) * 180) / Math.PI;
    state.heading = wrapHeading(input.fieldDrag.originH + (ang - input.fieldDrag.originA));
  } else {
    state.x = snapCorridorX(clamp(worldPt.x - input.fieldDrag.dx, 0, MAT.w));
    state.y = clamp(worldPt.y - input.fieldDrag.dy, 0, MAT.h);
    showSnapGuide(state.x === CORRIDOR_X);
  }
  applyLivePose();
  commitStart();
  syncInputs();
});
robotEl.addEventListener("pointerup", () => {
  input.fieldDrag = null;
  showSnapGuide(false);
});
robotEl.addEventListener("pointercancel", () => {
  input.fieldDrag = null;
  showSnapGuide(false);
});

if (artsEl) {
  artsEl.addEventListener("pointerdown", (e) => {
    if (input.spaceDown || state.running) return;
    const el = e.target.closest(".art");
    if (!el) return;
    const i = Number(el.dataset.i);
    const art = state.arts[i];
    if (!art || art.held) return;
    e.stopPropagation();
    e.preventDefault();
    const worldPt = worldFromPointer(e);
    input.artDrag = { i, id: e.pointerId, dx: worldPt.x - art.x, dy: worldPt.y - art.y, x0: art.x, y0: art.y };
    el.classList.add("dragging");
    el.setPointerCapture(e.pointerId);
  });
  artsEl.addEventListener("pointermove", (e) => {
    if (!input.artDrag || e.pointerId !== input.artDrag.id) return;
    const art = state.arts[input.artDrag.i];
    if (!art) return;
    const worldPt = worldFromPointer(e);
    const snapped = snapArtXY(worldPt.x - input.artDrag.dx, worldPt.y - input.artDrag.dy);
    art.x = snapped.x;
    art.y = snapped.y;
    art.struck = false;
    paintArts();
    updateDeadLayer();
    updateArtLabel(input.artDrag.i);
  });
  const endArtDrag = (e) => {
    if (!input.artDrag || (e && e.pointerId !== input.artDrag.id)) return;
    const { i, x0, y0 } = input.artDrag;
    const el = artsEl.children[i];
    el?.classList.remove("dragging");
    swapArtsOnDrop(i, x0, y0);
    paintArts();
    updateDeadLayer();
    saveMissionLayout();
    input.artDrag = null;
    updateArtLabel();
  };
  artsEl.addEventListener("pointerup", endArtDrag);
  artsEl.addEventListener("pointercancel", endArtDrag);
}
export function readPose() {
  if (state.poseLocked) {
    syncInputs();
    return;
  }
  state.x = snapCorridorX(clamp(Number(inputX.value) || 0, 0, MAT.w));
  state.y = clamp(Number(inputY.value) || 0, 0, MAT.h);
  state.heading = wrapHeading(Number(inputH.value) || 0);
  commitStart();
  applyRobot();
}

export function bindMission() {
  document.getElementById("btn-zoom-in").addEventListener("click", () => {
    const r = viewport.getBoundingClientRect();
    zoomAt(1.2, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.getElementById("btn-zoom-out").addEventListener("click", () => {
    const r = viewport.getBoundingClientRect();
    zoomAt(1 / 1.2, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.getElementById("btn-fit").addEventListener("click", fitView);
  document.getElementById("btn-random").addEventListener("click", randomLayout);
  if (swatchesEl) {
    swatchesEl.addEventListener("click", (e) => {
      const span = e.target.closest("span[data-color]");
      if (!span) return;
      swapUnused(span.dataset.color);
    });
  }
  if (keepArtsEl) {
    keepArtsEl.checked = state.keepArts;
    keepArtsEl.addEventListener("change", () => {
      state.keepArts = keepArtsEl.checked;
      saveMissionLayout();
      setRunStatus(
        state.keepArts
          ? "프로그램 시작 시 아티팩트 위치를 유지합니다."
          : "프로그램 시작 시 아티팩트를 홈으로 리셋합니다."
      );
    });
  }
  if (useUnusedEl) {
    useUnusedEl.checked = state.useUnused;
    useUnusedEl.addEventListener("change", () => setUseUnused(useUnusedEl.checked));
  }
  if (lockStart) {
    lockStart.addEventListener("change", () => {
      state.poseLocked = lockStart.checked;
      if (state.poseLocked) {
        state.startX = state.x;
        state.startY = state.y;
        state.startH = state.heading;
      }
      syncPoseLock();
      syncInputs();
    });
  }
  inputX.addEventListener("change", readPose);
  inputY.addEventListener("change", readPose);
  inputH.addEventListener("change", readPose);
}
