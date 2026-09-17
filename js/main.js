import { state } from "./state.js";
import { keepArtsEl, screenAi, screenHangar, screenMission, screenProgram, screenSim, useUnusedEl } from "./dom.js";
import { applyRobot, goToStartPose, loadMissionLayout, setRunStatus, syncInputs, updateLaunchBtn } from "./field.js";
import { bindHangar, fitHangar } from "./hangar.js";
import { bindMission, fitView, renderArts } from "./mission.js";
import { refreshAiPrompt } from "./ai.js";
import { initProgram } from "./program/index.js";
import { syncSweepPreview } from "./program/editor.js";
import { runCollectTest } from "./collect.js";
import { bindSweep, parkField } from "./sweep.js";

export function setTab(tab) {
  parkField(tab === "sim" ? "sim" : "mission");
  state.tab = tab;
  screenHangar.hidden = tab !== "hangar";
  screenMission.hidden = tab !== "mission";
  if (screenProgram) screenProgram.hidden = tab !== "program";
  if (screenAi) screenAi.hidden = tab !== "ai";
  if (screenSim) screenSim.hidden = tab !== "sim";
  document.getElementById("tab-hangar").setAttribute("aria-selected", String(tab === "hangar"));
  document.getElementById("tab-program")?.setAttribute("aria-selected", String(tab === "program"));
  document.getElementById("tab-mission").setAttribute("aria-selected", String(tab === "mission"));
  document.getElementById("tab-sim")?.setAttribute("aria-selected", String(tab === "sim"));
  document.getElementById("tab-ai")?.setAttribute("aria-selected", String(tab === "ai"));
  updateLaunchBtn();
  if (tab === "mission" || tab === "sim") {
    applyRobot();
    fitView();
  } else if (tab === "hangar") fitHangar();
  else if (tab === "program" && window.Program) window.Program.onTab();
  else if (tab === "ai") refreshAiPrompt();
  if (tab === "sim") syncSweepPreview();
}

document.getElementById("tab-hangar").addEventListener("click", () => setTab("hangar"));
document.getElementById("tab-program")?.addEventListener("click", () => setTab("program"));
document.getElementById("tab-mission").addEventListener("click", () => setTab("mission"));
document.getElementById("tab-sim")?.addEventListener("click", () => setTab("sim"));
document.getElementById("tab-ai")?.addEventListener("click", () => setTab("ai"));
document.getElementById("ai-refresh")?.addEventListener("click", refreshAiPrompt);
document.getElementById("ai-goal")?.addEventListener("input", () => {
  try {
    localStorage.setItem("artefact-ai-goal", document.getElementById("ai-goal").value);
  } catch (_) {}
  refreshAiPrompt();
});
document.getElementById("ai-copy")?.addEventListener("click", async () => {
  refreshAiPrompt();
  const text = document.getElementById("ai-prompt")?.value || "";
  const status = document.getElementById("ai-copy-status");
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "복사됨. 다른 AI 채팅에 붙여 넣으세요.";
  } catch (_) {
    const box = document.getElementById("ai-prompt");
    box?.select();
    if (status) status.textContent = "복사에 실패했습니다. 텍스트를 직접 선택하세요.";
  }
});
try {
  const saved = localStorage.getItem("artefact-ai-goal");
  if (saved && document.getElementById("ai-goal")) document.getElementById("ai-goal").value = saved;
} catch (_) {}
document.getElementById("btn-to-start")?.addEventListener("click", () => {
  if (state.tab !== "mission") setTab("mission");
  goToStartPose();
});
document.getElementById("btn-launch").addEventListener("click", () => {
  if (state.tab === "mission") {
    if (typeof window.Program?.run === "function") window.Program.run();
    else setRunStatus("프로그램 탭의 코드를 먼저 저장하세요.", true);
    return;
  }
  if (state.tab === "sim") {
    document.getElementById("btn-sweep")?.click();
    return;
  }
  setTab("mission");
});
document.getElementById("btn-collect-test")?.addEventListener("click", async () => {
  setTab("mission");
  await runCollectTest();
});
window.runCollectTest = runCollectTest;

window.addEventListener("resize", () => {
  if (state.tab === "mission" || state.tab === "sim") fitView();
  else if (state.tab === "hangar") fitHangar();
});

document.addEventListener("selectstart", (e) => {
  if (e.target.closest("input, textarea, select")) return;
  e.preventDefault();
});

bindHangar();
bindMission();
bindSweep();
initProgram();
loadMissionLayout();
if (keepArtsEl) keepArtsEl.checked = state.keepArts;
if (useUnusedEl) useUnusedEl.checked = state.useUnused;
syncInputs();
applyRobot();
renderArts();
setTab("program");
