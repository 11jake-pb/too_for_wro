import { COLOR_ORDER } from "./constants.js";
import { state } from "./state.js";
import { toolCenterLocal, toolPart } from "./geom.js";
import { applyLayout, applyRobot, scoreMuseum, setRunStatus, Field } from "./field.js";
import { session } from "./program/session.js";
import { executeScript, SPEED_MAX } from "./program/run.js";
import { parseProgram } from "./program/parse.js";
import { getProgramSource, loadProgramText, syncSweepPreview } from "./program/editor.js";

export function permute(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((v, i) => {
    permute([...arr.slice(0, i), ...arr.slice(i + 1)]).forEach((p) => out.push([v, ...p]));
  });
  return out;
}

export function allLayouts() {
  const cases = [];
  COLOR_ORDER.forEach((unused) => {
    permute(COLOR_ORDER.filter((c) => c !== unused)).forEach((slots) => {
      cases.push({ unused, slots });
    });
  });
  return cases;
}

export function buildSweepExample() {
  const part = toolPart("arm", 1);
  const g = part ? toolCenterLocal(part) : { x: 0, y: 80 };
  const gx = Math.round(g.x * 10) / 10;
  const gy = Math.round(g.y * 10) / 10;
  return `# 120가지 공통 프로그램 (미사용 1색 + 발굴 홈 4색 순열)
# 실행 시 colors = 이번 라운드 슬롯 색(왼쪽→오른쪽), unused = 미사용 색
# pickup 뒤 held = 잡은 색. slot_x/y(i), museum_x/y(색)
# drive_to(x, y, heading) 는 축 정렬 이동 후 헤딩

held = 0
i = 1
gx = ${gx}
gy = ${gy}

while i <= 4:
  drive_to(slot_x(i) + gx, slot_y(i) - gy, 0)
  pickup(arm, 1)
  drive_to(museum_x(held) - gx, museum_y(held) + gy, 180)
  put_down(arm, 1)
  go_straight(220, -1)
  i = i + 1
`;
}

export function parkField(tab) {
  const host = document.getElementById(tab === "sim" ? "sim-view-host" : "mission-view-host");
  const vp = document.getElementById("viewport");
  if (host && vp && vp.parentElement !== host) host.appendChild(vp);
}

function fmt(sec) {
  if (!Number.isFinite(sec)) return "—";
  return `${sec.toFixed(2)} s`;
}

function renderStats(el, rows, done, total) {
  if (!el) return;
  const ok = rows.filter((r) => r.ok);
  const times = ok.map((r) => r.time);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : NaN;
  const min = times.length ? Math.min(...times) : NaN;
  const max = times.length ? Math.max(...times) : NaN;
  el.innerHTML = `
    <div><strong>${done}</strong> / ${total}</div>
    <div>성공 ${ok.length} · 실패 ${rows.length - ok.length}</div>
    <div>평균 <strong>${fmt(avg)}</strong></div>
    <div>최단 <strong>${fmt(min)}</strong></div>
    <div>최장 <strong>${fmt(max)}</strong></div>
  `;
}

export async function runSweep(code) {
  const src = (code && String(code).trim()) ? String(code) : getProgramSource();
  const cases = allLayouts();
  const stats = document.getElementById("sweep-stats");
  const log = document.getElementById("sweep-log");
  const btn = document.getElementById("btn-sweep");
  if (log) log.innerHTML = "";
  const rows = [];
  const keep = state.keepArts;
  const token = { abort: false };
  if (session.runTok) session.runTok.abort = true;
  session.runTok = token;
  session.batch = true;
  state.sweepBatch = true;
  state.keepArts = true;
  Field.setRunning(true);
  if (btn) btn.textContent = "정지";
  try {
    const script = parseProgram(src);
    for (let n = 0; n < cases.length; n++) {
      if (token.abort) break;
      const c = cases[n];
      applyLayout(c.unused, c.slots);
      applyRobot();
      let rec = { i: n + 1, unused: c.unused, slots: c.slots.join(","), time: 0, ok: false, error: "" };
      try {
        const result = await executeScript(script, token);
        rec.time = result.time;
        rec.ok = !token.abort && scoreMuseum();
        if (!rec.ok && !token.abort) rec.error = "박물관 미도착";
      } catch (err) {
        rec.error = String(err.message || err);
      }
      rows.push(rec);
      if (log) {
        const line = document.createElement("div");
        line.className = rec.ok ? "" : "warn";
        line.textContent = `${rec.i}. 미사용 ${rec.unused} | ${rec.slots} · ${fmt(rec.time)}${rec.ok ? " 성공" : " 실패 " + rec.error}`;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      }
      renderStats(stats, rows, n + 1, cases.length);
      setRunStatus(`${n + 1}/120 ${rec.ok ? "성공" : "실패"} · ${fmt(rec.time)}`, !rec.ok);
      await new Promise((r) => requestAnimationFrame(r));
    }
  } catch (err) {
    setRunStatus(String(err.message || err), true);
    if (log) {
      const line = document.createElement("div");
      line.className = "warn";
      line.textContent = String(err.message || err);
      log.appendChild(line);
    }
  } finally {
    if (session.runTok === token) session.runTok = null;
    session.batch = false;
    state.sweepBatch = false;
    state.keepArts = keep;
    Field.setRunning(false);
    if (btn) btn.textContent = "120 실행";
  }
  const ok = rows.filter((r) => r.ok);
  const times = ok.map((r) => r.time);
  window.__sweep = { rows, avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null };
  return window.__sweep;
}

function speedLabel(v) {
  return v >= SPEED_MAX ? `${v}× 생략` : `${v}×`;
}

export function applySpeed(raw, from) {
  const v = Math.max(1, Math.min(SPEED_MAX, Math.round(Number(raw) || 10)));
  session.speed = v;
  [
    ["sweep-speed", "sweep-speed-val"],
    ["mission-speed", "mission-speed-val"],
  ].forEach(([id, lab]) => {
    const el = document.getElementById(id);
    const label = document.getElementById(lab);
    if (el && el !== from) el.value = String(v);
    if (label) label.textContent = speedLabel(v);
  });
}

export function bindSweep() {
  const btnEx = document.getElementById("btn-sweep-example");
  const btn = document.getElementById("btn-sweep");
  ["sweep-speed", "mission-speed"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", () => applySpeed(el.value, el));
  });
  applySpeed(session.speed);
  syncSweepPreview();
  btnEx?.addEventListener("click", () => {
    loadProgramText(buildSweepExample());
    syncSweepPreview();
  });
  btn?.addEventListener("click", async () => {
    if (session.runTok) {
      session.runTok.abort = true;
      return;
    }
    await runSweep(getProgramSource());
  });
}
