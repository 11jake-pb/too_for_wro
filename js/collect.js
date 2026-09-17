import { MUSEUM, fieldSlotAt } from "./constants.js";
import { state } from "./state.js";
import { toolCenterLocal, toolPart, wrapHeading } from "./geom.js";
import { keepArtsEl } from "./dom.js";
import { resetArtsHome, setRunStatus } from "./field.js";
import { session } from "./program/session.js";
import { codeText, setSource } from "./program/editor.js";

function r(n) {
  return Math.round(n * 10) / 10;
}

export function armGrabLocal() {
  const part = toolPart("arm", 1);
  if (!part) return { x: 0, y: 90 };
  return toolCenterLocal(part);
}

export function buildCollectProgram() {
  const g = armGrabLocal();
  let x = state.startX;
  let y = state.startY;
  let h = state.startH;
  const lines = [
    `# 집게#1 grab local (${r(g.x)}, ${r(g.y)})  art 48×32`,
    `# START (${r(state.startX)}, ${r(state.startY)}, ${r(wrapHeading(state.startH))}°)`,
  ];

  const turn = (th) => {
    lines.push(`point_turn(${r(th)})`);
    h = th;
  };
  const go = (mm, power) => {
    lines.push(`go_straight(${r(mm)}, ${power})`);
    const dist = mm * (power >= 0 ? 1 : -1);
    const rad = (h * Math.PI) / 180;
    x += -Math.sin(rad) * dist;
    y += Math.cos(rad) * dist;
  };
  const goXYH = (tx, ty, th) => {
    const dx = tx - x;
    const dy = ty - y;
    if (Math.abs(dx) >= 0.5) {
      turn(dx > 0 ? -90 : 90);
      go(Math.abs(dx), 1);
    }
    if (Math.abs(dy) >= 0.5) {
      turn(dy > 0 ? 0 : 180);
      go(Math.abs(dy), 1);
    }
    turn(th);
  };

  const pieces = state.slots.map((color, i) => {
    const live = state.arts[i];
    const home = fieldSlotAt(i);
    const from = state.keepArts && live ? live : home;
    return { color, x: from.x, y: from.y };
  });

  pieces.forEach((a) => {
    const mu = MUSEUM[a.color];
    if (!mu) return;
    lines.push(`# ${a.color}`);
    goXYH(a.x + g.x, a.y - g.y, 0);
    lines.push("pickup(arm, 1)");
    go(220, -1);
    goXYH(mu.x - g.x, mu.y + g.y, 180);
    lines.push("put_down(arm, 1)");
    go(220, -1);
  });
  return lines.join("\n") + "\n";
}

export function testResult() {
  const g = armGrabLocal();
  return state.arts.map((a) => {
    const mu = MUSEUM[a.color];
    const err = mu ? Math.hypot(a.x - mu.x, a.y - mu.y) : Infinity;
    return {
      color: a.color,
      held: Boolean(a.held),
      struck: a.struck,
      x: r(a.x),
      y: r(a.y),
      museumErr: mu ? r(err) : null,
      ok: Boolean(mu) && !a.held && err < 40,
    };
  });
}

export async function runCollectTest() {
  window.__simLog = [];
  const box = document.getElementById("sim-log");
  if (box) box.innerHTML = "";
  state.keepArts = false;
  if (keepArtsEl) keepArtsEl.checked = false;
  resetArtsHome();
  const g = armGrabLocal();
  setRunStatus(`테스트 시작 grab=(${r(g.x)}, ${r(g.y)}) 도구 ${state.parts.map((p) => `${p.kind} ${p.w}×${p.d}`).join(", ")}`);
  const code = buildCollectProgram();
  setSource("text");
  if (codeText) codeText.value = code;
  session.instant = true;
  try {
    if (session.runTok) await window.Program.run();
    await window.Program.run();
  } finally {
    session.instant = false;
  }
  const rows = testResult();
  rows.forEach((row) => {
    setRunStatus(
      `${row.color}: held=${row.held} struck=${row.struck} (${row.x}, ${row.y}) museum-err=${row.museumErr}`,
      !row.ok
    );
  });
  const fails = (window.__simLog || []).filter((l) => /실패|충돌/.test(l.msg));
  const ok = rows.every((row) => row.ok);
  setRunStatus(ok ? `수집 테스트 성공 (${rows.length}개)` : `수집 테스트 실패 · 오류 ${fails.length}건`, !ok);
  window.__collectTest = { ok, rows, fails, grab: g, log: window.__simLog };
  return window.__collectTest;
}