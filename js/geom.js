import { GRID, LIMIT, MIN_GAP, MOD, WHEEL_H, WHEEL_T, ART_W, ART_H } from "./constants.js";
import { state } from "./state.js";

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function snap(v) {
  return Math.round(v / GRID) * GRID;
}

export function wrapHeading(deg) {
  let h = ((deg + 180) % 360) - 180;
  if (h <= -180) h += 360;
  return h;
}

export function selectedPart() {
  if (state.selected.type !== "part") return null;
  return state.parts.find((p) => p.id === state.selected.id) || null;
}

export function clampW(w) {
  const wall = state.width / 2;
  const maxHalf = wall + WHEEL_T / 2;
  return clamp(w, 40, Math.min(LIMIT, maxHalf * 2));
}

export function wheelGeom() {
  const W = clampW(state.W);
  const half = W / 2;
  const t = WHEEL_T / 2;
  const H = WHEEL_H;
  return {
    W,
    H,
    left: { x: -half - t, w: WHEEL_T, y: -H / 2, h: H },
    right: { x: half - t, w: WHEEL_T, y: -H / 2, h: H },
  };
}

export function svgWheelBox(side, frontUp) {
  const g = wheelGeom();
  const box = g[side];
  const sx = frontUp ? LIMIT / 2 + box.x : LIMIT / 2 - box.x - box.w;
  const sy = frontUp ? LIMIT / 2 - box.y - box.h : LIMIT / 2 + box.y;
  return { x: sx, y: sy, w: box.w, h: box.h };
}

export function nearestFace(x, y) {
  if (Math.abs(y) >= Math.abs(x)) return y >= 0 ? "front" : "back";
  return x >= 0 ? "right" : "left";
}

export function sizeOf(part) {
  const def = MOD[part.kind];
  return { w: part.w ?? def.w, d: part.d ?? def.d };
}

export function faceAnchor(kind, side, along = 0, d = MOD[kind].d) {
  const hx = state.width / 2;
  const hy = state.length / 2;
  const stick = 16;
  if (side === "front") return { x: along, y: hy + stick - d, face: "front" };
  if (side === "back") return { x: along, y: -(hy + stick - d), face: "back" };
  if (side === "left") return { x: -(hx + stick - d), y: along, face: "left" };
  return { x: hx + stick - d, y: along, face: "right" };
}

export function moduleAabb(part) {
  const { w: across, d: along } = sizeOf(part);
  if (part.face === "front" || part.face === "back") {
    const sign = part.face === "front" ? 1 : -1;
    return {
      minX: part.x - across / 2,
      maxX: part.x + across / 2,
      minY: Math.min(part.y, part.y + sign * along),
      maxY: Math.max(part.y, part.y + sign * along),
    };
  }
  const sign = part.face === "right" ? 1 : -1;
  return {
    minX: Math.min(part.x, part.x + sign * along),
    maxX: Math.max(part.x, part.x + sign * along),
    minY: part.y - across / 2,
    maxY: part.y + across / 2,
  };
}

export function inflate(box, m) {
  return {
    minX: box.minX - m,
    maxX: box.maxX + m,
    minY: box.minY - m,
    maxY: box.maxY + m,
  };
}

export function boxesOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function gapOk(part, ignoreId) {
  const mine = inflate(moduleAabb(part), MIN_GAP / 2);
  return state.parts.every((other) => {
    if (other.id === ignoreId || other.kind !== part.kind) return true;
    return !boxesOverlap(mine, inflate(moduleAabb(other), MIN_GAP / 2));
  });
}

export function legalize(kind, pos, ignoreId) {
  const d = pos.d ?? MOD[kind].d;
  const w = pos.w ?? MOD[kind].w;
  const faces = [];
  const preferred = pos.face || nearestFace(pos.x, pos.y);
  for (const f of [preferred, "front", "back", "left", "right"]) {
    if (!faces.includes(f)) faces.push(f);
  }
  const alongPref = preferred === "front" || preferred === "back" ? pos.x : pos.y;
  for (const face of faces) {
    const along0 = face === preferred ? alongPref : 0;
    const reach = LIMIT / 2;
    const tryAlong = [];
    for (let a = snap(along0); a <= reach; a += GRID) tryAlong.push(a);
    for (let a = snap(along0) - GRID; a >= -reach; a -= GRID) tryAlong.push(a);
    for (const along of tryAlong) {
      const next = faceAnchor(kind, face, along, d);
      if (gapOk({ ...next, kind, w, d }, ignoreId)) return next;
    }
  }
  return null;
}

export function chassisPlate() {
  return {
    minX: -state.width / 2,
    maxX: state.width / 2,
    minY: -state.length / 2,
    maxY: state.length / 2,
  };
}

export function subtractAabb(src, cut) {
  const ix = Math.max(src.minX, cut.minX);
  const ax = Math.min(src.maxX, cut.maxX);
  const iy = Math.max(src.minY, cut.minY);
  const ay = Math.min(src.maxY, cut.maxY);
  if (ix >= ax || iy >= ay) return [src];
  const out = [];
  if (src.minY < iy) out.push({ minX: src.minX, maxX: src.maxX, minY: src.minY, maxY: iy });
  if (ay < src.maxY) out.push({ minX: src.minX, maxX: src.maxX, minY: ay, maxY: src.maxY });
  if (src.minX < ix) out.push({ minX: src.minX, maxX: ix, minY: iy, maxY: ay });
  if (ax < src.maxX) out.push({ minX: ax, maxX: src.maxX, minY: iy, maxY: ay });
  return out.filter((b) => b.maxX - b.minX > 0.4 && b.maxY - b.minY > 0.4);
}

export function chassisBodyBoxes() {
  let boxes = [chassisPlate()];
  for (const p of state.parts) {
    boxes = boxes.flatMap((b) => subtractAabb(b, inflate(moduleAabb(p), 14)));
  }
  return boxes.map((b) => ({ ...b, role: "body" }));
}

export function robotBounds() {
  const boxes = hullBoxes(true);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export function hullBoxes(includeTools) {
  const g = wheelGeom();
  const boxes = [
    ...chassisBodyBoxes(),
    { minX: g.left.x, maxX: g.left.x + g.left.w, minY: g.left.y, maxY: g.left.y + g.left.h, role: "body" },
    { minX: g.right.x, maxX: g.right.x + g.right.w, minY: g.right.y, maxY: g.right.y + g.right.h, role: "body" },
  ];
  if (includeTools) {
    state.parts.forEach((p) => {
      boxes.push({ ...moduleAabb(p), role: "tool", id: p.id, kind: p.kind });
    });
  }
  return boxes;
}

export function poseForward(h) {
  const r = (h * Math.PI) / 180;
  return { x: -Math.sin(r), y: Math.cos(r) };
}

export function poseRight(h) {
  const r = (h * Math.PI) / 180;
  return { x: -Math.cos(r), y: -Math.sin(r) };
}

export function localToWorld(lx, ly, pose) {
  const F = poseForward(pose.heading);
  const R = poseRight(pose.heading);
  return { x: pose.x + lx * R.x + ly * F.x, y: pose.y + lx * R.y + ly * F.y };
}

export function worldToLocal(wx, wy, pose) {
  const dx = wx - pose.x;
  const dy = wy - pose.y;
  const F = poseForward(pose.heading);
  const R = poseRight(pose.heading);
  return { x: dx * R.x + dy * R.y, y: dx * F.x + dy * F.y };
}

export function livePose() {
  return { x: state.x, y: state.y, heading: state.heading };
}

export function toolPart(kind, index) {
  const hangar = kind === "gripper" ? "gripper" : "clamp";
  let n = 0;
  for (const p of state.parts) {
    if (p.kind !== hangar) continue;
    n += 1;
    if (n === index) return p;
  }
  return null;
}

export function toolCenterLocal(part) {
  const b = moduleAabb(part);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function artBox(art) {
  return {
    minX: art.x - ART_W / 2,
    maxX: art.x + ART_W / 2,
    minY: art.y - ART_H / 2,
    maxY: art.y + ART_H / 2,
  };
}

export function localBoxHitsArt(box, art, pose) {
  const c = worldToLocal(art.x, art.y, pose);
  const nearestX = clamp(c.x, box.minX, box.maxX);
  const nearestY = clamp(c.y, box.minY, box.maxY);
  const dx = c.x - nearestX;
  const dy = c.y - nearestY;
  const rad = Math.max(ART_W, ART_H) / 2;
  return dx * dx + dy * dy <= rad * rad;
}

export function turnRadius() {
  const boxes = hullBoxes(true);
  let r = 0;
  boxes.forEach((b) => {
    [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ].forEach(([x, y]) => {
      r = Math.max(r, Math.hypot(x, y));
    });
  });
  return r;
}
