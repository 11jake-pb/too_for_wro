import {
  ART_H, ART_W, COLOR_ORDER, COLORS, CORRIDOR_X, GRAB_PAD, HANGAR, LIMIT, MAT, MOD, MUSEUM, SNAP_ART, SNAP_X, SWAP_ART, fieldSlotAt,
} from "./constants.js";
import { input, state } from "./state.js";
import {
  artsEl, artPosLabel, hangarPaint, hangarRobot, inputH, inputLen, inputModD, inputModW, inputModX, inputModY,
  inputW, inputWid, inputX, inputY, robotEl, runStatus, screenMission, snapGuides, snapXEl, swatchesEl, unusedLabel,
  inspectChassis, inspectClampSize, inspectModTitle, inspectModule,
} from "./dom.js";
import {
  clamp, faceAnchor, hullBoxes, inflate, legalize, livePose, localToWorld, moduleAabb, nearestFace,
  robotBounds, sizeOf, toolCenterLocal, toolPart, turnRadius, wrapHeading,
} from "./geom.js";
import { artSvg, refreshInspector, robotSvg, updateBbox } from "./draw.js";
import { lerpPose, pickupTarget, resolveHits } from "./collision.js";

export function applyLayout(unused, slots) {
  state.useUnused = false;
  state.unused = unused;
  state.slots = slots.slice();
  resetArtsHome();
  state.x = state.startX;
  state.y = state.startY;
  state.heading = state.startH;
  state.prevX = state.x;
  state.prevY = state.y;
  state.prevH = state.heading;
  applyLivePose();
}

export function scoreMuseum(tol = 40) {
  if (!state.arts.length || state.arts.some((a) => a.held)) return false;
  return state.arts.every((a) => {
    const mu = MUSEUM[a.color];
    return Boolean(mu) && Math.hypot(a.x - mu.x, a.y - mu.y) < tol;
  });
}

export function resetArtsHome() {
  state.arts = state.slots.map((color, i) => {
    const p = fieldSlotAt(i);
    return { color, x: p.x, y: p.y, held: null, struck: false };
  });
}

export function artSnapTargets() {
  const n = Math.max(4, state.slots.length);
  return Array.from({ length: n }, (_, i) => fieldSlotAt(i));
}

export function snapArtXY(x, y) {
  let nx = clamp(x, ART_W / 2, MAT.w - ART_W / 2);
  let ny = clamp(y, ART_H / 2, MAT.h - ART_H / 2);
  let best = SNAP_ART + 1;
  for (const p of artSnapTargets()) {
    const d = Math.hypot(p.x - nx, p.y - ny);
    if (d < best) {
      best = d;
      nx = p.x;
      ny = p.y;
    }
  }
  return { x: nx, y: ny };
}

export function updateArtLabel(i) {
  if (!artPosLabel) return;
  const art = Number.isInteger(i) ? state.arts[i] : null;
  if (art) {
    artPosLabel.textContent = `${art.color}  (${Math.round(art.x)}, ${Math.round(art.y)})`;
    return;
  }
  const moved = state.arts.some((a, n) => {
    const p = fieldSlotAt(n);
    return Math.hypot(a.x - p.x, a.y - p.y) > 2;
  });
  artPosLabel.textContent = moved
    ? "커스텀 배치 · 프로그램 시작으로 이 위치에서 실험"
    : "홈(발굴지) 배치";
}

export function setUseUnused(on) {
  state.useUnused = Boolean(on);
  if (state.useUnused) {
    COLOR_ORDER.forEach((c) => {
      if (!state.slots.includes(c)) state.slots.push(c);
    });
  } else {
    if (!state.unused || !COLOR_ORDER.includes(state.unused)) {
      state.unused = state.slots[state.slots.length - 1] || "yellow";
    }
    state.slots = state.slots.filter((c) => c !== state.unused);
    if (state.slots.length > 4) state.slots = state.slots.slice(0, 4);
    while (state.slots.length < 4) {
      const next = COLOR_ORDER.find((c) => c !== state.unused && !state.slots.includes(c));
      if (!next) break;
      state.slots.push(next);
    }
  }
  resetArtsHome();
  paintArts();
  saveMissionLayout();
  setRunStatus(state.useUnused ? "미사용 색도 필드에 두었습니다." : `미사용: ${state.unused}`);
}

export function swapArtsOnDrop(i, fromX, fromY) {
  const a = state.arts[i];
  if (!a) return false;
  const other = state.arts.find((b, j) => {
    if (j === i || b.held) return false;
    return Math.hypot(b.x - a.x, b.y - a.y) <= SWAP_ART;
  });
  if (!other) return false;
  other.x = fromX;
  other.y = fromY;
  other.struck = false;
  setRunStatus(`${a.color} ↔ ${other.color} 자리 바꿈`);
  return true;
}

export function swapUnused(name) {
  if (state.running || !name) return;
  if (state.useUnused) {
    state.unused = name;
    paintArts();
    saveMissionLayout();
    setRunStatus(`체크를 끄면 ${name} 이(가) 미사용이 됩니다.`);
    return;
  }
  if (name === state.unused) {
    setRunStatus(`${name} 은(는) 이미 미사용입니다. 필드에 있는 색을 클릭하세요.`);
    return;
  }
  const i = state.slots.indexOf(name);
  if (i < 0) return;
  const old = state.unused;
  state.slots[i] = old;
  if (state.arts[i]) state.arts[i].color = old;
  state.unused = name;
  paintArts();
  saveMissionLayout();
  setRunStatus(`미사용: ${name} (슬롯 ${i + 1}은 ${old})`);
}

export function saveMissionLayout() {
  try {
    localStorage.setItem(
      "artefact-mission",
      JSON.stringify({
        keepArts: state.keepArts,
        useUnused: state.useUnused,
        unused: state.unused,
        slots: state.slots,
        arts: state.arts.map((a) => ({ color: a.color, x: a.x, y: a.y })),
      })
    );
  } catch (_) {}
}

export function loadMissionLayout() {
  try {
    const raw = localStorage.getItem("artefact-mission");
    if (!raw) return;
    const d = JSON.parse(raw);
    if (typeof d.keepArts === "boolean") state.keepArts = d.keepArts;
    if (typeof d.useUnused === "boolean") state.useUnused = d.useUnused;
    if (d.unused && COLORS[d.unused]) state.unused = d.unused;
    if (Array.isArray(d.slots) && d.slots.length >= 4 && d.slots.every((c) => COLORS[c])) {
      state.slots = d.slots;
    }
    if (state.useUnused) {
      COLOR_ORDER.forEach((c) => {
        if (!state.slots.includes(c)) state.slots.push(c);
      });
    } else if (state.slots.length > 4) {
      state.slots = state.slots.filter((c) => c !== state.unused).slice(0, 4);
    }
    resetArtsHome();
  } catch (_) {}
}

export function syncHeldArts() {
  const pose = livePose();
  state.arts.forEach((art) => {
    if (!art.held) return;
    const part = toolPart(art.held.kind, art.held.index);
    if (!part) return;
    const c = toolCenterLocal(part);
    const w = localToWorld(c.x, c.y, pose);
    art.x = w.x;
    art.y = w.y;
  });
}

export function checkArtHits() {
  const pose = livePose();
  const prev = {
    x: state.prevX ?? pose.x,
    y: state.prevY ?? pose.y,
    heading: state.prevH ?? pose.heading,
  };
  let dh = Math.abs(((pose.heading - prev.heading + 540) % 360) - 180);
  const dist = Math.hypot(pose.x - prev.x, pose.y - prev.y);
  const steps = Math.max(1, Math.min(40, Math.ceil(dh / 5 + dist / 8)));
  let hit = false;
  for (let s = 1; s <= steps; s++) {
    if (resolveHits(lerpPose(prev, pose, s / steps))) hit = true;
  }
  state.prevX = pose.x;
  state.prevY = pose.y;
  state.prevH = pose.heading;
  if (hit) setRunStatus("충돌: 로봇 또는 아티팩트가 다른 아티팩트를 밀었습니다.", true);
  return hit;
}

export function tryPickup(kind, index) {
  const part = toolPart(kind, index);
  if (!part) {
    setRunStatus(`pickup 실패: ${kind} #${index} 없음`, true);
    return;
  }
  if (state.arts.some((a) => a.held && a.held.kind === kind && a.held.index === index)) {
    setRunStatus("이미 잡고 있습니다.", true);
    return;
  }
  const pose = livePose();
  const { target } = pickupTarget(kind, index, pose);
  if (!target) {
    setRunStatus("pickup 실패: 집게 범위에 아티팩트 없음", true);
    return;
  }
  target.held = { kind, index };
  target.struck = false;
  syncHeldArts();
  paintArts();
  setRunStatus(`${target.color} 집음 (${kind} #${index})`);
}

export function tryPutDown(kind, index) {
  const part = toolPart(kind, index);
  if (!part) {
    setRunStatus(`put_down 실패: ${kind} #${index} 없음`, true);
    return;
  }
  const art = state.arts.find((a) => a.held && a.held.kind === kind && Number(a.held.index) === Number(index));
  if (!art) {
    setRunStatus("put_down 실패: 잡고 있는 아티팩트 없음", true);
    return;
  }
  const pose = livePose();
  const c = toolCenterLocal(part);
  const drop = localToWorld(c.x, c.y, pose);
  art.x = drop.x;
  art.y = drop.y;
  art.held = null;
  art.struck = false;
  paintArts();
  updateDeadLayer();
  setRunStatus(`${art.color} 놓음 (${Math.round(art.x)}, ${Math.round(art.y)})`);
}

export function paintArts() {
  if (!artsEl) return;
  const needRebuild =
    artsEl.children.length !== state.arts.length ||
    [...artsEl.children].some((el, i) => el.dataset.color !== state.arts[i]?.color);
  if (needRebuild) {
    artsEl.innerHTML = state.arts
      .map(
        (a, i) =>
          `<div class="art${a.held ? " held" : ""}${a.struck ? " struck" : ""}" data-i="${i}" data-color="${a.color}" style="left:${a.x}px;top:${a.y}px">${artSvg(a.color)}</div>`
      )
      .join("");
  }
  if (needRebuild) {
    unusedLabel.textContent = state.useUnused ? `미사용 없음 · ${state.unused}도 필드에` : `미사용: ${state.unused}`;
    swatchesEl.innerHTML = COLOR_ORDER.map((name) => {
      const on = state.useUnused || state.slots.includes(name);
      return `<span class="${on ? "" : "off"}" data-color="${name}" style="background:${COLORS[name]}" title="${name}"></span>`;
    }).join("");
  }
  [...artsEl.children].forEach((el, i) => {
    const a = state.arts[i];
    el.dataset.i = String(i);
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    el.classList.toggle("held", Boolean(a.held));
    el.classList.toggle("struck", a.struck);
    el.classList.toggle("dragging", Boolean(input.artDrag && input.artDrag.i === i));
    el.style.transform = a.held ? `rotate(${state.heading}deg)` : "";
  });
  updateArtLabel();
}
export function updateDeadLayer() {
  const svg = document.getElementById("dead-layer");
  if (!svg) return;
  const pose = livePose();
  const polys = hullBoxes(true)
    .map((b) => {
      const pts = [
        [b.minX, b.minY],
        [b.maxX, b.minY],
        [b.maxX, b.maxY],
        [b.minX, b.maxY],
      ]
        .map(([x, y]) => {
          const w = localToWorld(x, y, pose);
          return `${w.x.toFixed(1)},${w.y.toFixed(1)}`;
        })
        .join(" ");
      const cls = b.role === "body" ? "dead-body" : "dead-tool";
      return `<polygon class="${cls}" points="${pts}"/>`;
    })
    .join("");
  svg.innerHTML = polys;
}
export function snapCorridorX(x) {
  if (Math.abs(x - CORRIDOR_X) <= SNAP_X) return CORRIDOR_X;
  return x;
}

export function showSnapGuide(on) {
  if (!snapGuides || !snapXEl) return;
  snapGuides.hidden = !on;
  if (on) snapXEl.style.left = `${CORRIDOR_X}px`;
}

export function setRunStatus(msg, warn) {
  const rec = { msg: String(msg || ""), warn: Boolean(warn) };
  if (typeof window !== "undefined") {
    window.__simLog = window.__simLog || [];
    if (msg) window.__simLog.push(rec);
    const box = document.getElementById("sim-log");
  if (!state.sweepBatch && box && msg) {
      const line = document.createElement("div");
      if (warn) line.className = "warn";
      line.textContent = rec.msg;
      box.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }
  }
  if (!runStatus) return;
  runStatus.textContent = msg || "";
  runStatus.classList.toggle("warn", Boolean(warn));
}

export function applyLivePose() {
  syncHeldArts();
  if (state.running) checkArtHits();
  if (state.tab !== "mission" && state.tab !== "sim") return;
  robotEl.style.left = `${state.x}px`;
  robotEl.style.top = `${state.y}px`;
  robotEl.style.transform = `rotate(${state.heading}deg)`;
  paintArts();
  if (!state.sweepBatch) updateDeadLayer();
}

export function commitStart() {
  if (state.poseLocked || state.running) return;
  state.startX = state.x;
  state.startY = state.y;
  state.startH = state.heading;
}

export function goToStartPose() {
  if (state.running) return false;
  state.x = state.startX;
  state.y = state.startY;
  state.heading = state.startH;
  state.arts.forEach((a) => {
    a.held = null;
  });
  state.prevX = state.x;
  state.prevY = state.y;
  state.prevH = state.heading;
  applyLivePose();
  syncInputs();
  setRunStatus("시작 위치로 이동했습니다.");
  return true;
}

export function resetToStart() {
  state.x = state.startX;
  state.y = state.startY;
  state.heading = state.startH;
  if (state.keepArts) {
    state.arts.forEach((a) => {
      a.held = null;
      a.struck = false;
    });
  } else {
    resetArtsHome();
  }
  state.prevX = state.x;
  state.prevY = state.y;
  state.prevH = state.heading;
  applyLivePose();
}

export function syncPoseLock() {
  const on = state.poseLocked;
  [inputX, inputY, inputH].forEach((el) => {
    el.disabled = on;
  });
  robotEl.classList.toggle("pose-locked", on);
}

export function updateLaunchBtn() {
  const btn = document.getElementById("btn-launch");
  const toStart = document.getElementById("btn-to-start");
  if (toStart) {
    toStart.hidden = state.tab !== "mission";
    toStart.disabled = state.running;
  }
  if (state.tab === "mission") {
    btn.textContent = state.running ? "정지" : "프로그램 시작";
    btn.title = state.running ? "실행 중지" : "고정된 시작 위치에서 프로그램 실행";
  } else if (state.tab === "sim") {
    btn.textContent = state.running ? "정지" : "120 실행";
    btn.title = state.running ? "스윕 중지" : "120가지 배치로 프로그램 실행";
  } else if (state.tab === "hangar") {
    btn.textContent = "▶ 미션";
    btn.title = "미션 필드로";
  } else {
    btn.textContent = "▶ 미션";
    btn.title = "미션 필드로";
  }
}

export const Field = {
  getPose() {
    return { x: state.x, y: state.y, heading: state.heading, W: state.W };
  },
  setLivePose(x, y, h) {
    state.x = x;
    state.y = y;
    state.heading = wrapHeading(h);
    applyLivePose();
  },
  applyLayout,
  scoreMuseum,
  resetToStart,
  setRunning(on) {
    state.running = Boolean(on);
    screenMission?.classList.toggle("is-running", state.running);
    document.getElementById("screen-sim")?.classList.toggle("is-running", state.running);
    updateLaunchBtn();
  },
  useTool(action, kind, index) {
    if (action === "pickup") tryPickup(kind, index);
    else tryPutDown(kind, index);
  },
  setRunStatus,
};

export function applyRobot() {
  updateBbox();
  hangarRobot.style.left = `${HANGAR / 2}px`;
  hangarRobot.style.top = `${HANGAR / 2}px`;
  hangarPaint.innerHTML = robotSvg(true);
  refreshInspector();
  if (state.tab !== "mission" && state.tab !== "sim") return;
  robotEl.style.width = `${LIMIT}px`;
  robotEl.style.height = `${LIMIT}px`;
  robotEl.style.marginLeft = `${-LIMIT / 2}px`;
  robotEl.style.marginTop = `${-LIMIT / 2}px`;
  applyLivePose();
  robotEl.innerHTML = robotSvg(false);
}

export function syncInputs() {
  inputX.value = (state.poseLocked ? state.startX : state.x).toFixed(0);
  inputY.value = (state.poseLocked ? state.startY : state.y).toFixed(0);
  inputH.value = wrapHeading(state.poseLocked ? state.startH : state.heading).toFixed(0);
  inputW.value = state.W.toFixed(0);
  inputLen.value = state.length.toFixed(0);
  inputWid.value = state.width.toFixed(0);
}

export function addPart(kind, x = 0, y = 0) {
  const def = MOD[kind];
  const face = nearestFace(x, y);
  const along = face === "front" || face === "back" ? x : y;
  const placed = legalize(kind, { ...faceAnchor(kind, face, along, def.d), w: def.w, d: def.d }, -1);
  if (!placed) return null;
  const part = { id: state.nextId++, kind, ...placed, w: def.w, d: def.d };
  state.parts.push(part);
  state.selected = { type: "part", id: part.id };
  return part;
}

export function toolIndex(part) {
  const key = part.kind === "clamp" ? "arm" : "gripper";
  let n = 0;
  for (const p of state.parts) {
    if ((p.kind === "clamp" ? "arm" : "gripper") !== key) continue;
    n += 1;
    if (p.id === part.id) return n;
  }
  return n;
}

window.Field = Field;
