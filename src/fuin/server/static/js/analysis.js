import { apiFetch, getKey } from "./api.js";
import { escHtml, fmtSize } from "./ui.js";

let selectedFile = null;

export function getSelectedFile() {
  return selectedFile;
}

export function initAnalysis() {
  const dz = document.getElementById("dropzone");
  const fi = document.getElementById("file-input");

  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("hover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("hover"));
  dz.addEventListener("drop", e => {
    e.preventDefault();
    dz.classList.remove("hover");
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  });
  fi.addEventListener("change", () => { if (fi.files[0]) setFile(fi.files[0]); });
  const content = document.getElementById("analyze-content");
  content.addEventListener("click", event => {
    const button = event.target.closest("[data-toggle-category]");
    if (button) toggleCategory(button.dataset.toggleCategory);
  });
  content.addEventListener("change", event => {
    if (event.target.matches("input[data-filename]")) updateSelectionSummary();
  });
}

// ── Drop zone ──────────────────────────────────────────────────────────────

function setFile(f) {
  const dz = document.getElementById("dropzone");
  if (!f.name.endsWith(".apk")) { alert("Please select an .apk file."); return; }
  selectedFile = f;
  dz.querySelector("p").innerHTML =
    `<strong>${escHtml(f.name)}</strong><br/>${(f.size / 1024 / 1024).toFixed(2)} MB`;
  analyzeFile(f);
}

// ── Analyze ───────────────────────────────────────────────────────────────
async function analyzeFile(file) {
  const key = getKey();
  if (!key) { alert("Set your API key first."); return; }

  document.getElementById("analyze-section").style.display = "block";
  document.getElementById("analyze-content").innerHTML = '<div class="analyze-loading">Analyzing APK...</div>';
  document.getElementById("pack-btn").disabled = true;

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await apiFetch("/analyze", { method: "POST", body: fd });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || res.statusText); }
    renderAnalysis(await res.json());
    document.getElementById("pack-btn").disabled = false;
  } catch (err) {
    document.getElementById("analyze-content").innerHTML =
      `<div style="color:var(--red);font-size:13px">Analysis failed: ${escHtml(err.message)}</div>`;
  }
}

function renderAnalysis(data) {
  const content = document.getElementById("analyze-content");
  let html = '';

  // DEX files (always encrypted, shown as info)
  if (data.dex.files.length) {
    html += renderFileCategory('dex', 'DEX Files', data.dex.files, true, false);
  }

  // Native libraries
  if (data.native_libs.files.length) {
    html += renderFileCategory('native', 'Native Libraries (.so)', data.native_libs.files, true, true);
  }

  // User assets
  if (data.assets.files.length) {
    html += renderFileCategory('assets', 'User Assets', data.assets.files, true, true);
  }

  // Protection options
  html += `
    <div class="protection-options">
      <h4>Runtime Protection</h4>
      <div class="option-checks">
        <label class="option-check">
          <input type="checkbox" id="opt-root-detection" />
          <span>Root detection</span>
        </label>
        <label class="option-check">
          <input type="checkbox" id="opt-emulator-detection" />
          <span>Emulator detection</span>
        </label>
        <label class="option-check">
          <input type="checkbox" id="opt-encrypt-strings" />
          <span>String obfuscation</span>
        </label>
        <label class="option-check">
          <input type="checkbox" id="opt-anti-tamper" checked />
          <span>Anti-tamper (cert check)</span>
        </label>
      </div>
    </div>
  `;

  // Summary
  html += `
    <div class="analyze-summary">
      <span id="selection-summary"></span>
      <span style="color:var(--muted)">APK: ${fmtSize(data.summary.apk_size)}</span>
    </div>
  `;

  content.innerHTML = html;
  updateSelectionSummary();
}

function renderFileCategory(id, title, files, checkedByDefault, selectable) {
  const badge = `${files.length} files · ${fmtSize(files.reduce((s, f) => s + f.size, 0))}`;
  let html = `<div class="file-category">`;
  html += `<div class="file-category-header">
    <h4>${escHtml(title)}</h4>
    <span class="badge">${badge}</span>`;
  if (selectable) {
    html += `<button class="select-all-btn" data-toggle-category="${id}">toggle all</button>`;
  }
  html += `</div><div class="file-list">`;

  for (const f of files) {
    const checkId = `file-${id}-${f.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const checked = checkedByDefault ? 'checked' : '';
    const disabled = selectable ? '' : 'checked disabled';
    html += `
      <div class="file-item">
        <input type="checkbox" id="${checkId}" data-category="${id}" data-filename="${escHtml(f.name)}" ${disabled || checked} />
        <label for="${checkId}">${escHtml(f.name)}</label>
        <span class="file-size">${fmtSize(f.size)}</span>
      </div>`;
  }

  html += `</div></div>`;
  return html;
}

function toggleCategory(category) {
  const boxes = document.querySelectorAll(`input[data-category="${category}"]`);
  const allChecked = Array.from(boxes).every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const allBoxes = document.querySelectorAll('#analyze-content input[type=checkbox][data-filename]');
  const checked = Array.from(allBoxes).filter(b => b.checked);
  const el = document.getElementById("selection-summary");
  if (el) {
    el.innerHTML = `<span class="selected-count">${checked.length}</span> / ${allBoxes.length} files selected for encryption`;
  }
}

export function getExcludedFiles() {
  const boxes = document.querySelectorAll('#analyze-content input[type=checkbox][data-filename]:not(:checked):not(:disabled)');
  return Array.from(boxes).map(b => b.dataset.filename);
}
