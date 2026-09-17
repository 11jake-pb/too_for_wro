import { COLORS, LIMIT } from "./constants.js";
import { state } from "./state.js";
import {
  bboxLabel, hangarPaint, hangarRobot, handlesEl, inputModD, inputModW, inputModX, inputModY,
  inspectChassis, inspectClampSize, inspectModTitle, inspectModule,
} from "./dom.js";
import { chassisBodyBoxes, chassisPlate, moduleAabb, robotBounds, selectedPart, sizeOf, svgWheelBox } from "./geom.js";

function localToSvg(lx, ly, frontUp) {
  const cx = LIMIT / 2;
  const cy = LIMIT / 2;
  return frontUp ? { x: cx + lx, y: cy - ly } : { x: cx - lx, y: cy + ly };
}

function aabbPath(box, frontUp) {
  const p = [
    localToSvg(box.minX, box.minY, frontUp),
    localToSvg(box.maxX, box.minY, frontUp),
    localToSvg(box.maxX, box.maxY, frontUp),
    localToSvg(box.minX, box.maxY, frontUp),
  ];
  return `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)} L${p[1].x.toFixed(1)},${p[1].y.toFixed(1)} L${p[2].x.toFixed(1)},${p[2].y.toFixed(1)} L${p[3].x.toFixed(1)},${p[3].y.toFixed(1)} Z`;
}

export function chassisPlatePath(frontUp) {
  const plate = chassisPlate();
  let d = aabbPath(plate, frontUp);
  for (const part of state.parts) {
    const cut = moduleAabb(part);
    const hole = {
      minX: Math.max(cut.minX, plate.minX),
      maxX: Math.min(cut.maxX, plate.maxX),
      minY: Math.max(cut.minY, plate.minY),
      maxY: Math.min(cut.maxY, plate.maxY),
    };
    if (hole.maxX - hole.minX > 1 && hole.maxY - hole.minY > 1) d += aabbPath(hole, frontUp);
  }
  return d;
}

function toolBayMarks(frontUp) {
  const plate = chassisPlate();
  return state.parts
    .map((part) => {
      const cut = moduleAabb(part);
      const hole = {
        minX: Math.max(cut.minX, plate.minX),
        maxX: Math.min(cut.maxX, plate.maxX),
        minY: Math.max(cut.minY, plate.minY),
        maxY: Math.min(cut.maxY, plate.maxY),
      };
      if (hole.maxX - hole.minX <= 1 || hole.maxY - hole.minY <= 1) return "";
      const cls = part.kind === "clamp" ? "tool-bay clamp" : "tool-bay gripper";
      return `<path class="${cls}" d="${aabbPath(hole, frontUp)}"/>`;
    })
    .join("");
}

function noseMarkup(frontUp) {
  const y = state.length / 2 - 10;
  const onPlate = chassisBodyBoxes().some((b) => b.minX <= 0 && b.maxX >= 0 && b.minY <= y && b.maxY >= y);
  if (!onPlate) return "";
  const tip = localToSvg(0, state.length / 2 - 4, frontUp);
  const a = localToSvg(-16, state.length / 2 - 28, frontUp);
  const b = localToSvg(16, state.length / 2 - 28, frontUp);
  return `<polygon class="robot-nose" points="${tip.x},${tip.y} ${a.x},${a.y} ${b.x},${b.y}"/>`;
}

export function moduleInner(part) {
  const { w, d } = sizeOf(part);
  const tine = Math.max(8, Math.min(12, w / 3));
  const base = Math.min(16, d / 3);
  if (part.kind === "clamp") {
    return `
      <rect class="tool-base" x="${-w / 2}" y="0" width="${w}" height="${d}" rx="3"/>
      <rect x="${-w / 2}" y="0" width="${tine}" height="${d}" rx="2"/>
      <rect x="${w / 2 - tine}" y="0" width="${tine}" height="${d}" rx="2"/>
      <rect x="${-w / 2}" y="0" width="${w}" height="${base}" rx="2"/>`;
  }
  return `
    <rect class="tool-base" x="${-w / 2}" y="0" width="${w}" height="${d}" rx="3"/>
    <rect x="${-w / 2}" y="0" width="${w}" height="${base}" rx="2"/>
    <rect x="${-w / 2}" y="${base - 2}" width="${tine}" height="${Math.max(8, d - base + 2)}" rx="2"/>
    <rect x="${w / 2 - tine}" y="${base - 2}" width="${tine}" height="${Math.max(8, d - base + 2)}" rx="2"/>`;
}

export function moduleMarkup(part, frontUp) {
  const cls = part.kind === "clamp" ? "mod-clamp" : "mod-gripper";
  const label = part.kind === "clamp" ? "집게" : "G";
  const faceRot = { front: 0, right: 90, back: 180, left: -90 }[part.face];
  const rot = faceRot + (frontUp ? 180 : 0);
  const sx = frontUp ? LIMIT / 2 + part.x : LIMIT / 2 - part.x;
  const sy = frontUp ? LIMIT / 2 - part.y : LIMIT / 2 + part.y;
  const on = state.selected.type === "part" && state.selected.id === part.id ? " selected" : "";
  return `
    <g class="mod${on}" data-part-id="${part.id}" transform="translate(${sx} ${sy}) rotate(${rot})">
      <g class="${cls}">${moduleInner(part)}</g>
      <text x="0" y="-4" text-anchor="middle">${label}</text>
    </g>`;
}

export function robotSvg(frontUp) {
  const left = svgWheelBox("left", frontUp);
  const right = svgWheelBox("right", frontUp);
  const cx = LIMIT / 2;
  const cy = LIMIT / 2;
  const fillId = frontUp ? "chassis-fill-hangar" : "chassis-fill-mission";
  return `
    <svg viewBox="0 0 ${LIMIT} ${LIMIT}" width="${LIMIT}" height="${LIMIT}">
      <defs>
        <pattern id="${fillId}" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#1a2030"/>
          <path d="M0 10 L10 0" stroke="#3d4a63" stroke-width="1.2"/>
        </pattern>
      </defs>
      <rect class="robot-limit" x="1" y="1" width="${LIMIT - 2}" height="${LIMIT - 2}" rx="4"/>
      <path class="robot-body" data-chassis="1" fill="url(#${fillId})" fill-rule="evenodd" d="${chassisPlatePath(frontUp)}"/>
      <g class="tool-bays">${toolBayMarks(frontUp)}</g>
      <rect class="robot-wheel" data-wheel="left" x="${left.x}" y="${left.y}" width="${left.w}" height="${left.h}" rx="3"/>
      <rect class="robot-wheel" data-wheel="right" x="${right.x}" y="${right.y}" width="${right.w}" height="${right.h}" rx="3"/>
      ${noseMarkup(frontUp)}
      <circle class="robot-hub" cx="${cx}" cy="${cy}" r="5"/>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" style="user-select:none">FRONT</text>
      ${state.parts.map((p) => moduleMarkup(p, frontUp)).join("")}
    </svg>`;
}

export function layoutHandles() {
  const chassisOn = state.selected.type === "chassis";
  handlesEl.hidden = !chassisOn;
  if (!chassisOn) return;
  const x0 = (LIMIT - state.width) / 2;
  const y0 = (LIMIT - state.length) / 2;
  const x1 = x0 + state.width;
  const y1 = y0 + state.length;
  const midX = LIMIT / 2;
  const midY = LIMIT / 2;
  const map = {
    nw: [x0, y0],
    n: [midX, y0],
    ne: [x1, y0],
    w: [x0, midY],
    e: [x1, midY],
    sw: [x0, y1],
    s: [midX, y1],
    se: [x1, y1],
  };
  handlesEl.querySelectorAll("button").forEach((btn) => {
    const [x, y] = map[btn.dataset.h];
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
  });
}

export function updateBbox() {
  const bounds = robotBounds();
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const over = spanX > LIMIT + 0.5 || spanY > LIMIT + 0.5;
  bboxLabel.textContent = `외접 ${spanX.toFixed(0)} × ${spanY.toFixed(0)} mm`;
  bboxLabel.classList.toggle("warn", over);
  if (over) bboxLabel.textContent += " · 규격 250 mm 초과";
}

export function refreshInspector() {
  hangarRobot.classList.toggle("chassis-on", state.selected.type === "chassis");
  document.querySelectorAll(".part-card").forEach((card) => {
    const part = card.dataset.part;
    if (part === "chassis") {
      card.classList.toggle("active", state.selected.type === "chassis");
    } else {
      const sel = selectedPart();
      card.classList.toggle("active", Boolean(sel && sel.kind === part));
    }
  });
  const part = selectedPart();
  inspectChassis.hidden = Boolean(part);
  inspectModule.hidden = !part;
  if (part) {
    inspectModTitle.textContent = part.kind === "clamp" ? "집게" : "그리퍼";
    inputModX.value = part.x.toFixed(0);
    inputModY.value = part.y.toFixed(0);
    const sz = sizeOf(part);
    inspectClampSize.hidden = false;
    if (part.kind === "clamp" || part.kind === "gripper") {
      inputModW.value = sz.w.toFixed(0);
      inputModD.value = sz.d.toFixed(0);
    }
    document.querySelectorAll("#inspect-sides button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.side === part.face);
    });
  }
  layoutHandles();
}

export function updateHangarChassis() {
  const svg = hangarPaint.querySelector("svg");
  if (!svg) return;
  const body = svg.querySelector(".robot-body");
  if (body) body.setAttribute("d", chassisPlatePath(true));
  const bays = svg.querySelector(".tool-bays");
  if (bays) bays.innerHTML = toolBayMarks(true);
  ["left", "right"].forEach((side) => {
    const el = svg.querySelector(`[data-wheel="${side}"]`);
    if (!el) return;
    const box = svgWheelBox(side, true);
    el.setAttribute("x", String(box.x));
    el.setAttribute("y", String(box.y));
    el.setAttribute("width", String(box.w));
    el.setAttribute("height", String(box.h));
  });
  const oldNose = svg.querySelector(".robot-nose");
  const nextNose = noseMarkup(true);
  if (oldNose && nextNose) {
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tmp.innerHTML = nextNose;
    oldNose.setAttribute("points", tmp.firstChild.getAttribute("points"));
  } else if (oldNose && !nextNose) {
    oldNose.remove();
  } else if (!oldNose && nextNose) {
    const hub = svg.querySelector(".robot-hub");
    if (hub) hub.insertAdjacentHTML("beforebegin", nextNose);
  }
  layoutHandles();
}

export function updateHangarPart(part) {
  const g = hangarPaint.querySelector(`[data-part-id="${part.id}"]`);
  if (!g) return;
  const faceRot = { front: 0, right: 90, back: 180, left: -90 }[part.face];
  const sx = LIMIT / 2 + part.x;
  const sy = LIMIT / 2 - part.y;
  g.setAttribute("transform", `translate(${sx} ${sy}) rotate(${faceRot + 180})`);
}

export function studs(color, ox, oy, cols, rows) {
  let s = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = ox + 4 + c * 8;
      const cy = oy + 4 + r * 8;
      s += `<circle cx="${cx}" cy="${cy}" r="2.35" fill="${color}" stroke="rgba(255,255,255,0.22)" stroke-width="0.35"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="1.15" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="0.4"/>`;
    }
  }
  return s;
}

export function artSvg(colorName) {
  const brick = COLORS[colorName];
  const plate = "#fff8ee";
  const tag = { red: "R", green: "G", black: "K", blue: "B", yellow: "Y" }[colorName] || "?";
  return `
    <svg viewBox="-4 -4 56 40" width="56" height="40">
      <rect x="-3.2" y="-3.2" width="54.4" height="38.4" rx="5" fill="#0b0d12" stroke="#fff" stroke-width="1.6"/>
      <rect x="0.2" y="0.2" width="47.6" height="31.6" rx="1.4" fill="${plate}" stroke="#111" stroke-width="1.2"/>
      ${studs(plate, 0, 0, 6, 4)}
      <rect x="0.6" y="0.6" width="31.2" height="15.2" rx="1" fill="${brick}" stroke="#111" stroke-width="0.9"/>
      <rect x="16.2" y="16.2" width="31.2" height="15.2" rx="1" fill="${brick}" stroke="#111" stroke-width="0.9"/>
      ${studs(brick, 0, 0, 4, 2)}
      ${studs(brick, 16, 16, 4, 2)}
      <circle cx="24" cy="16" r="7.6" fill="#111" stroke="#fff" stroke-width="1.4"/>
      <text x="24" y="16.2" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="800" fill="#fff" stroke="#111" stroke-width="0.35" paint-order="stroke fill" font-family="Segoe UI, Arial, sans-serif">${tag}</text>
    </svg>`;
}
