import { session } from "./session.js";
import { run } from "./run.js";
import { getProgramSource, loadProgramText, renderPalette, renderScript } from "./editor.js";

export function initProgram() {
  const api = {
    onTab() {
      if (session.source === "blocks") {
        renderPalette();
        renderScript();
      }
    },
    run,
    getCode() {
      return getProgramSource();
    },
    loadText(text) {
      loadProgramText(text);
    },
    running() {
      return Boolean(session.runTok);
    },
  };
  window.Program = api;
  return api;
}
