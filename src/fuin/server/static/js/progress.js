import { escHtml } from "./ui.js";

const STEPS = [
  { id: "loading_stub",       label: "Loading stub DEX" },
  { id: "patching_manifest",  label: "Patching AndroidManifest.xml" },
  { id: "encrypting_dex",     label: "Encrypting DEX files (AES-256-GCM)" },
  { id: "injecting",          label: "Injecting into APK" },
  { id: "aligning",           label: "Running zipalign" },
  { id: "signing",            label: "Signing APK (v1 + v2)" },
  { id: "reporting",          label: "Generating report" },
  { id: "saving",             label: "Saving packed APK" },
  { id: "done",               label: "Done" },
];

export function showProgress() {
  document.getElementById("progress-section").style.display = "block";
  renderSteps(null);
  setProgress("preparing", 0, false);
}

export function renderSteps(activeId) {
  const list = document.getElementById("steps-list");
  list.innerHTML = STEPS.map(s => {
    let cls = "";
    if (s.id === activeId) cls = "active";
    return `<div class="step-item ${cls}" id="step-${s.id}">
      <div class="step-dot"></div>${escHtml(s.label)}
    </div>`;
  }).join("");
}

export function updateProgress(ev) {
  setProgress(ev.step, ev.pct, ev.status === "error");
  if (ev.status === "running" || ev.status === "done") {
    let found = false;
    for (const s of STEPS) {
      const el = document.getElementById(`step-${s.id}`);
      if (!el) continue;
      if (s.id === ev.step) { el.className = "step-item active"; found = true; }
      else if (!found) { el.className = "step-item done"; }
      else { el.className = "step-item"; }
    }
    if (ev.status === "done") {
      STEPS.forEach(s => {
        const el = document.getElementById(`step-${s.id}`);
        if (el) el.className = "step-item done";
      });
    }
  }
}

function setProgress(step, pct, isError) {
  const fill = document.getElementById("progress-fill");
  document.getElementById("step-label").textContent = stepLabel(step);
  document.getElementById("pct-label").textContent = `${pct}%`;
  fill.style.width = `${pct}%`;
  fill.classList.toggle("error", isError);
}

function stepLabel(id) {
  return STEPS.find(s => s.id === id)?.label || id;
}

export function showProgressError() {
  document.getElementById("progress-fill").classList.add("error");
  document.getElementById("step-label").textContent = "Error";
  STEPS.forEach(s => {
    const el = document.getElementById(`step-${s.id}`);
    if (el && el.classList.contains("active")) el.className = "step-item error";
  });
}
