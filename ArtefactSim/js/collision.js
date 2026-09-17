import { GRAB_PAD } from "./constants.js";
import { state } from "./state.js";
import { hullBoxes, inflate, localToWorld, moduleAabb, toolCenterLocal, toolPart, worldToLocal } from "./geom.js";

function cornersOf(box) {
  return [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
}

export function boxWorldPoly(box, pose) {
  return cornersOf(box).map((p) => localToWorld(p.x, p.y, pose));
}

export function artLocalBoxes() {
  return [
    { minX: -23.4, maxX: 7.8, minY: -15.4, maxY: -0.2 },
    { minX: -7.8, maxX: 23.4, minY: 0.2, maxY: 15.4 },
  ];
}

export function artPose(art, robotPose) {
  return {
    x: art.x,
    y: art.y,
    heading: art.held ? robotPose.heading : 0,
  };
}

export function artWorldPolys(art, robotPose) {
  const pose = artPose(art, robotPose);
  return artLocalBoxes().map((b) => boxWorldPoly(b, pose));
}

function project(poly, ax, ay) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = p.x * ax + p.y * ay;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function satMtv(polyA, polyB) {
  let best = Infinity;
  let nx = 0;
  let ny = 0;
  const pairs = [polyA, polyB];
  for (const poly of pairs) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      let tx = b.y - a.y;
      let ty = a.x - b.x;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const A = project(polyA, tx, ty);
      const B = project(polyB, tx, ty);
      if (A.max < B.min || B.max < A.min) return null;
      const overlap = Math.min(A.max, B.max) - Math.max(A.min, B.min);
      if (overlap < best) {
        best = overlap;
        nx = tx;
        ny = ty;
      }
    }
  }
  if (!Number.isFinite(best) || best === Infinity) return null;
  let cxA = 0;
  let cyA = 0;
  let cxB = 0;
  let cyB = 0;
  polyA.forEach((p) => {
    cxA += p.x;
    cyA += p.y;
  });
  polyB.forEach((p) => {
    cxB += p.x;
    cyB += p.y;
  });
  cxA /= polyA.length;
  cyA /= polyA.length;
  cxB /= polyB.length;
  cyB /= polyB.length;
  if ((cxB - cxA) * nx + (cyB - cyA) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx * best, y: ny * best, depth: best };
}

function firstMtv(robotPolys, artPolys) {
  let best = null;
  for (const r of robotPolys) {
    for (const a of artPolys) {
      const m = satMtv(r, a);
      if (!m) continue;
      if (!best || m.depth > best.depth) best = m;
    }
  }
  return best;
}

function pointInBox(local, box) {
  return local.x >= box.minX && local.x <= box.maxX && local.y >= box.minY && local.y <= box.maxY;
}

export function inGrabZone(art, pose) {
  for (const p of state.parts) {
    const grab = inflate(moduleAabb(p), GRAB_PAD);
    const c = worldToLocal(art.x, art.y, pose);
    if (pointInBox(c, grab)) return true;
  }
  return false;
}

export function hullHitsArt(art, pose, includeTools) {
  const artPolys = artWorldPolys(art, pose);
  const bodyPolys = hullBoxes(false).map((b) => boxWorldPoly(b, pose));
  const bodyHit = firstMtv(bodyPolys, artPolys);
  let toolHit = null;
  if (includeTools) {
    const toolPolys = hullBoxes(true)
      .filter((b) => b.role === "tool")
      .map((b) => boxWorldPoly(b, pose));
    toolHit = firstMtv(toolPolys, artPolys);
  }
  return { bodyHit, toolHit };
}

export function lerpPose(a, b, t) {
  let dh = ((b.heading - a.heading + 540) % 360) - 180;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    heading: a.heading + dh * t,
  };
}

function pushArt(art, mtv) {
  const extra = 3;
  const len = Math.hypot(mtv.x, mtv.y) || 1;
  art.x += mtv.x + (mtv.x / len) * extra;
  art.y += mtv.y + (mtv.y / len) * extra;
}

function slideArt(art, dx, dy) {
  art.x += dx;
  art.y += dy;
}

function separateFreeArts(pose, driven) {
  let hit = false;
  const free = state.arts.filter((a) => !a.held);
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i];
      const b = free[j];
      const mtv = firstMtv(artWorldPolys(a, pose), artWorldPolys(b, pose));
      if (!mtv) continue;
      const da = driven.has(a);
      const db = driven.has(b);
      const extra = 1.2;
      const len = Math.hypot(mtv.x, mtv.y) || 1;
      const ux = mtv.x / len;
      const uy = mtv.y / len;
      if (da && !db) {
        pushArt(b, mtv);
        driven.add(b);
      } else if (db && !da) {
        pushArt(a, { x: -mtv.x, y: -mtv.y });
        driven.add(a);
      } else {
        slideArt(a, -mtv.x * 0.5 - ux * extra * 0.5, -mtv.y * 0.5 - uy * extra * 0.5);
        slideArt(b, mtv.x * 0.5 + ux * extra * 0.5, mtv.y * 0.5 + uy * extra * 0.5);
        if (da || db) {
          driven.add(a);
          driven.add(b);
        }
      }
      if (da || db || a.struck || b.struck) {
        if (!a.struck) {
          a.struck = true;
          hit = true;
        }
        if (!b.struck) {
          b.struck = true;
          hit = true;
        }
      }
    }
  }
  return hit;
}

export function resolveHits(pose) {
  let hit = false;
  const driven = new Set();

  const knock = (art, mtv) => {
    if (!art.struck) {
      art.struck = true;
      hit = true;
    }
    if (mtv) pushArt(art, mtv);
    driven.add(art);
  };

  for (let pass = 0; pass < 6; pass++) {
    state.arts
      .filter((a) => !a.held)
      .forEach((art) => {
        const { bodyHit, toolHit } = hullHitsArt(art, pose, true);
        const grab = inGrabZone(art, pose);
        const foul = !grab && (bodyHit || toolHit);
        if (!foul) return;
        const mtv = bodyHit && (!toolHit || bodyHit.depth >= toolHit.depth) ? bodyHit : toolHit;
        knock(art, mtv);
      });

    state.arts.forEach((held) => {
      if (!held.held) return;
      const heldPolys = artWorldPolys(held, pose);
      state.arts
        .filter((a) => !a.held)
        .forEach((art) => {
          const mtv = firstMtv(heldPolys, artWorldPolys(art, pose));
          if (!mtv) return;
          knock(art, mtv);
        });
    });

    if (separateFreeArts(pose, driven)) hit = true;
  }
  return hit;
}

export function pickupTarget(kind, index, pose) {
  const part = toolPart(kind, index);
  if (!part) return { part: null, target: null };
  const grab = inflate(moduleAabb(part), GRAB_PAD);
  const grabPoly = [boxWorldPoly(grab, pose)];
  const gc = toolCenterLocal(part);
  const gw = localToWorld(gc.x, gc.y, pose);
  let best = null;
  let bestD = Infinity;
  for (const a of state.arts) {
    if (a.held) continue;
    const d = Math.hypot(a.x - gw.x, a.y - gw.y);
    const hit = Boolean(firstMtv(grabPoly, artWorldPolys(a, pose)));
    if (!hit && d > GRAB_PAD + 18) continue;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { part, target: best };
}

export function dropBlocked(art, pose) {
  return false;
}
