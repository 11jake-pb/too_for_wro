import { session } from "./session.js";
import { parseProgram } from "./parse.js";
import { codeText } from "./editor.js";
import { Field } from "../field.js";
import { state } from "../state.js";
import { MUSEUM, fieldSlotAt } from "../constants.js";

const LOOP_MAX = 4000;
const SPEED = 350;
const OMEGA = 160;

export const SPEED_MAX = 200;

export function wallSpeed() {
  return Math.max(1, Math.min(SPEED_MAX, Number(session.speed) || 1));
}

export function addSimTime(ms) {
  session.simTimeMs = (session.simTimeMs || 0) + Math.max(0, ms);
}

export function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export function evalExpr(node, env) {
  if (node == null) return 0;
  const f = node.fields || {};
  const A = () => evalExpr(node.values.A, env);
  const B = () => evalExpr(node.values.B, env);
  switch (node.kind) {
    case "number":
      return Number(f.VAL) || 0;
    case "string":
      return f.VAL ?? "";
    case "get_var":
      if (Object.prototype.hasOwnProperty.call(env.lists, f.NAME)) return env.lists[f.NAME];
      return env.vars[f.NAME] ?? 0;
    case "slot_x": {
      const i = Math.max(0, Math.floor(Number(evalExpr(node.values.I, env)) || 1) - 1);
      return fieldSlotAt(i).x;
    }
    case "slot_y": {
      const i = Math.max(0, Math.floor(Number(evalExpr(node.values.I, env)) || 1) - 1);
      return fieldSlotAt(i).y;
    }
    case "museum_x": {
      const c = String(evalExpr(node.values.C, env));
      return MUSEUM[c]?.x ?? 0;
    }
    case "museum_y": {
      const c = String(evalExpr(node.values.C, env));
      return MUSEUM[c]?.y ?? 0;
    }
    case "op_math": {
      const a = Number(A());
      const b = Number(B());
      if (f.OP === "-") return a - b;
      if (f.OP === "*") return a * b;
      if (f.OP === "/") return b === 0 ? 0 : a / b;
      if (f.OP === "%") return b === 0 ? 0 : a % b;
      return a + b;
    }
    case "op_compare": {
      const a = A();
      const b = B();
      if (f.OP === "==") return a == b;
      if (f.OP === "!=") return a != b;
      if (f.OP === "<") return a < b;
      if (f.OP === ">") return a > b;
      if (f.OP === "<=") return a <= b;
      if (f.OP === ">=") return a >= b;
      return false;
    }
    case "op_and":
      return truthy(A()) && truthy(B());
    case "op_or":
      return truthy(A()) || truthy(B());
    case "op_not":
      return !truthy(A());
    case "op_random": {
      const lo = Number(A());
      const hi = Number(B());
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    case "list_item": {
      const arr = env.lists[f.NAME] || [];
      const i = Number(evalExpr(node.values.I, env)) - 1;
      return arr[i];
    }
    case "list_len":
      return (env.lists[f.NAME] || []).length;
    case "list_contains":
      return (env.lists[f.NAME] || []).includes(evalExpr(node.values.VAL, env));
    case "list_make":
      return ["A", "B", "C", "D"].map((k) => node.values[k]).filter(Boolean).map((n) => evalExpr(n, env));
    default:
      return 0;
  }
}

export function waitFrame(token) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(!token.abort));
  });
}

export async function tween(ms, onT, token) {
  addSimTime(ms);
  const spd = wallSpeed();
  if (session.instant || spd >= SPEED_MAX) {
    onT(1);
    return;
  }
  const wall = Math.max(ms / spd, spd >= 80 ? 0 : 1);
  if (wall < 4) {
    onT(1);
    if (wall > 0) await waitFrame(token);
    return;
  }
  const t0 = performance.now();
  while (!token.abort) {
    const t = Math.min(1, (performance.now() - t0) / wall);
    onT(t);
    if (t >= 1) break;
    await waitFrame(token);
  }
}

export function makeEnv() {
  const env = { vars: {}, lists: {} };
  session.ws.vars.forEach((name) => {
    env.vars[name] = 0;
  });
  session.ws.lists.forEach((name) => {
    env.lists[name] = [];
  });
  env.lists.colors = state.slots.slice();
  env.vars.unused = state.unused;
  env.vars.held = "";
  return env;
}

async function goStraightMm(mm, power, token) {
  if (!window.Field) return;
  const pose0 = Field.getPose();
  const sign = power >= 0 ? 1 : -1;
  const dist = mm * sign;
  const rad = (pose0.heading * Math.PI) / 180;
  const dx = -Math.sin(rad) * dist;
  const dy = Math.cos(rad) * dist;
  await tween((Math.abs(mm) / SPEED) * 1000, (t) => {
    Field.setLivePose(pose0.x + dx * t, pose0.y + dy * t, pose0.heading);
  }, token);
}

async function pointTurnTo(target, token) {
  if (!window.Field) return;
  const pose0 = Field.getPose();
  const d = ((target - pose0.heading + 540) % 360) - 180;
  await tween((Math.abs(d) / OMEGA) * 1000, (t) => {
    Field.setLivePose(pose0.x, pose0.y, pose0.heading + d * t);
  }, token);
}

export async function runMotion(kind, node, env, token) {
  if (!window.Field) return;
  const pose0 = Field.getPose();
  if (kind === "go_straight") {
    const mm = Number(evalExpr(node.values.MM, env)) || 0;
    const sign = Number(evalExpr(node.values.POWER, env)) >= 0 ? 1 : -1;
    await goStraightMm(mm, sign, token);
    return;
  }
  if (kind === "point_turn") {
    await pointTurnTo(Number(evalExpr(node.values.H, env)) || 0, token);
    return;
  }
  if (kind === "drive_to") {
    const tx = Number(evalExpr(node.values.X, env)) || 0;
    const ty = Number(evalExpr(node.values.Y, env)) || 0;
    const th = Number(evalExpr(node.values.H, env)) || 0;
    let pose = Field.getPose();
    const dx = tx - pose.x;
    if (Math.abs(dx) >= 0.5) {
      await pointTurnTo(dx > 0 ? -90 : 90, token);
      await goStraightMm(Math.abs(dx), 1, token);
    }
    pose = Field.getPose();
    const dy = ty - pose.y;
    if (Math.abs(dy) >= 0.5) {
      await pointTurnTo(dy > 0 ? 0 : 180, token);
      await goStraightMm(Math.abs(dy), 1, token);
    }
    await pointTurnTo(th, token);
    return;
  }
  if (kind === "swing_turn") {
    const target = Number(evalExpr(node.values.H, env)) || 0;
    const motor = node.fields.MOTOR || "left";
    const d = ((target - pose0.heading + 540) % 360) - 180;
    const W = pose0.W;
    const pivotSide = motor === "left" ? 1 : -1;
    await tween((Math.abs(d) / (OMEGA * 0.7)) * 1000, (t) => {
      const h = pose0.heading + d * t;
      const h0 = (pose0.heading * Math.PI) / 180;
      const ht = (h * Math.PI) / 180;
      const R = (hh) => ({ x: -Math.cos(hh), y: -Math.sin(hh) });
      const r0 = R(h0);
      const rt = R(ht);
      const pivot = {
        x: pose0.x + pivotSide * (W / 2) * r0.x,
        y: pose0.y + pivotSide * (W / 2) * r0.y,
      };
      Field.setLivePose(pivot.x - pivotSide * (W / 2) * rt.x, pivot.y - pivotSide * (W / 2) * rt.y, h);
    }, token);
  }
}

export async function runStack(arr, env, token) {
  for (const node of arr) {
    if (token.abort) return;
    await runStmt(node, env, token);
  }
}

export async function runStmt(node, env, token) {
  const f = node.fields || {};
  switch (node.kind) {
    case "go_straight":
    case "point_turn":
    case "swing_turn":
    case "drive_to":
      await runMotion(node.kind, node, env, token);
      return;
    case "pickup":
    case "put_down":
      if (window.Field) Field.useTool(node.kind, f.KIND || "arm", Number(f.INDEX || 1));
      {
        const held = state.arts.find((a) => a.held);
        env.vars.held = held ? held.color : "";
      }
      await tween(120, () => {}, token);
      return;
    case "repeat": {
      const n = Math.max(0, Math.floor(Number(evalExpr(node.values.TIMES, env)) || 0));
      for (let i = 0; i < n; i++) {
        if (token.abort) return;
        await runStack(node.stacks.DO || [], env, token);
      }
      return;
    }
    case "forever":
      while (!token.abort) {
        session.loopGuard += 1;
        if (session.loopGuard > LOOP_MAX) throw new Error("반복이 너무 길어 중지했습니다.");
        await runStack(node.stacks.DO || [], env, token);
      }
      return;
    case "if":
      if (truthy(evalExpr(node.values.COND, env))) await runStack(node.stacks.DO || [], env, token);
      return;
    case "if_else":
      if (truthy(evalExpr(node.values.COND, env))) await runStack(node.stacks.DO || [], env, token);
      else await runStack(node.stacks.ELSE || [], env, token);
      return;
    case "while":
      while (!token.abort && truthy(evalExpr(node.values.COND, env))) {
        session.loopGuard += 1;
        if (session.loopGuard > LOOP_MAX) throw new Error("반복이 너무 길어 중지했습니다.");
        await runStack(node.stacks.DO || [], env, token);
      }
      return;
    case "set_var": {
      const val = evalExpr(node.values.VAL, env);
      if (Array.isArray(val)) env.lists[f.NAME] = val;
      else env.vars[f.NAME] = val;
      return;
    }
    case "change_var":
      env.vars[f.NAME] = (Number(env.vars[f.NAME]) || 0) + (Number(evalExpr(node.values.VAL, env)) || 0);
      return;
    case "list_add":
      (env.lists[f.NAME] || (env.lists[f.NAME] = [])).push(evalExpr(node.values.VAL, env));
      return;
    case "list_delete": {
      const arr = env.lists[f.NAME] || [];
      arr.splice(Number(evalExpr(node.values.I, env)) - 1, 1);
      return;
    }
    case "list_insert": {
      const arr = env.lists[f.NAME] || (env.lists[f.NAME] = []);
      arr.splice(Number(evalExpr(node.values.I, env)) - 1, 0, evalExpr(node.values.VAL, env));
      return;
    }
    case "list_replace": {
      const arr = env.lists[f.NAME] || (env.lists[f.NAME] = []);
      arr[Number(evalExpr(node.values.I, env)) - 1] = evalExpr(node.values.VAL, env);
      return;
    }
    case "list_clear":
      env.lists[f.NAME] = [];
      return;
    default:
      return;
  }
}

export async function executeScript(script, token) {
  session.loopGuard = 0;
  session.simTimeMs = 0;
  const env = makeEnv();
  if (!script.length) throw new Error("실행할 블록이 없습니다.");
  await runStack(script, env, token);
  return { time: session.simTimeMs / 1000, abort: token.abort };
}

export async function run() {
  if (session.runTok) {
    session.runTok.abort = true;
    session.runTok = null;
    if (window.Field) {
      Field.setRunning(false);
      Field.setRunStatus("정지");
    }
    return { aborted: true };
  }
  const token = { abort: false };
  session.runTok = token;
  if (window.Field) {
    Field.setRunning(true);
    Field.resetToStart();
    Field.setRunStatus("실행 중");
  }
  try {
    let script = session.ws.script;
    if (session.source === "text") script = parseProgram(codeText.value);
    const result = await executeScript(script, token);
    if (!token.abort && window.Field) Field.setRunStatus(`완료 · ${result.time.toFixed(2)} s`);
    return result;
  } catch (err) {
    if (window.Field) Field.setRunStatus(String(err.message || err), true);
    return { error: String(err.message || err), time: session.simTimeMs / 1000 };
  } finally {
    if (session.runTok === token) session.runTok = null;
    if (window.Field) Field.setRunning(false);
  }
}
