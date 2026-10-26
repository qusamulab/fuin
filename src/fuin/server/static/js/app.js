import { getKey, saveKey } from "./api.js";
import { initAnalysis } from "./analysis.js";
import { initApps } from "./apps.js";
import { startPack } from "./pack.js";
import { renderSteps } from "./progress.js";

const keyInput = document.getElementById("api-key");
keyInput.value = getKey();
document.getElementById("save-key-btn").addEventListener("click", () => saveKey(keyInput.value));
document.getElementById("pack-btn").addEventListener("click", startPack);
document.addEventListener("click", event => {
  const button = event.target.closest("[data-toggle-permissions]");
  if (button) button.nextElementSibling.classList.toggle("open");
});

initAnalysis();
renderSteps(null);
initApps();
