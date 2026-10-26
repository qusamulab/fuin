import { apiFetch, getKey } from "./api.js";
import { getExcludedFiles, getSelectedFile } from "./analysis.js";
import { downloadApp, loadApps } from "./apps.js";
import { showProgress, showProgressError, updateProgress } from "./progress.js";
import { escHtml, fmtSize, renderPermsHtml, renderSdkBadge } from "./ui.js";

function resetPackButton() {
  const button = document.getElementById("pack-btn");
  button.disabled = false;
  button.textContent = "Pack APK";
}

export async function startPack() {
  const key = getKey();
  const selectedFile = getSelectedFile();
  if (!key) { alert("Set your API key first."); return; }
  if (!selectedFile) { alert("Select an APK first."); return; }

  const btn = document.getElementById("pack-btn");
  btn.disabled = true;
  btn.textContent = "Packing…";

  showProgress();
  hideResult();

  const fd = new FormData();
  fd.append("file", selectedFile);
  const appClass = document.getElementById("app-class").value.trim();
  if (appClass) fd.append("app_class", appClass);
  const webhookUrl = document.getElementById("webhook-url").value.trim();
  if (webhookUrl) fd.append("webhook_url", webhookUrl);

  // Encryption options
  const excluded = getExcludedFiles();
  if (excluded.length) fd.append("exclude_files", excluded.join(","));

  const hasNative = document.querySelectorAll('input[data-category="native"]:checked').length > 0;
  const hasAssets = document.querySelectorAll('input[data-category="assets"]:checked').length > 0;
  fd.append("encrypt_native", hasNative);
  fd.append("encrypt_assets", hasAssets);

  // Protection options
  const rootDet = document.getElementById("opt-root-detection")?.checked || false;
  const emuDet = document.getElementById("opt-emulator-detection")?.checked || false;
  const strEnc = document.getElementById("opt-encrypt-strings")?.checked || false;
  fd.append("root_detection", rootDet);
  fd.append("emulator_detection", emuDet);
  fd.append("encrypt_strings", strEnc);

  let jobId;
  try {
    const res = await apiFetch("/pack", { method: "POST", body: fd });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || res.statusText); }
    const data = await res.json();
    jobId = data.job_id;
  } catch (err) {
    showError(err.message);
    resetPackButton();
    return;
  }

  const es = new EventSource(`/jobs/${jobId}/stream?api_key=${encodeURIComponent(key)}`);
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    updateProgress(ev);
    if (ev.status === "done") {
      es.close();
      showResult(ev.result);
      resetPackButton();
      loadApps();
    } else if (ev.status === "error") {
      es.close();
      showError(ev.error);
      resetPackButton();
    }
  };
  es.onerror = () => {
    es.close();
    showError("Connection lost. Check server logs.");
    resetPackButton();
  };
}

function showResult(result) {
  const a = result.analysis || {};
  const card = document.getElementById("result-card");

  const dexInfo = a.dex_count > 1
    ? `${a.dex_count} DEX files (multidex)` : `${a.dex_count || 1} DEX file`;

  const permsHtml = renderPermsHtml(a.permissions || []);

  // Pack report info
  const report = result.report;
  const reportHtml = report ? `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Pack Report</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="ic-label">Size Change</div>
          <div class="ic-val">${fmtSize(report.size.before)} → ${fmtSize(report.size.after)} (${report.size.delta_percent > 0 ? '+' : ''}${report.size.delta_percent}%)</div>
        </div>
        <div class="info-cell">
          <div class="ic-label">Encrypted</div>
          <div class="ic-val">${report.encrypted_targets.count} DEX + ${report.injected_assets.length} assets</div>
        </div>
      </div>
    </div>` : '';

  card.innerHTML = `
    <h3>✓ Packing complete</h3>
    <div class="info-grid">
      <div class="info-cell">
        <div class="ic-label">Package</div>
        <div class="ic-val">${escHtml(result.package_name)}</div>
      </div>
      <div class="info-cell">
        <div class="ic-label">Version</div>
        <div class="ic-val">${escHtml(a.version_name || '—')}</div>
      </div>
      <div class="info-cell">
        <div class="ic-label">SDK</div>
        <div class="ic-val" style="display:flex;gap:6px;flex-wrap:wrap">
          ${renderSdkBadge(a.min_sdk, 'min') || '<span style="color:var(--muted)">—</span>'}
          ${renderSdkBadge(a.target_sdk, 'target')}
        </div>
      </div>
      <div class="info-cell">
        <div class="ic-label">DEX</div>
        <div class="ic-val">${escHtml(dexInfo)}</div>
      </div>
    </div>
    ${permsHtml}
    ${reportHtml}
    ${metaRow("SHA-256", result.apk_signature.substring(0, 32) + "…")}
    <button class="download-btn" data-download-result>
      ⬇ Download packed APK
    </button>
  `;
  card.querySelector("[data-download-result]").addEventListener("click", () => {
    downloadApp(result.app_id, result.package_name);
  });
  document.getElementById("result-section").style.display = "block";
}

function showError(msg) {
  const card = document.getElementById("result-card");
  card.innerHTML = `<h3 class="error-title">✗ Pack failed</h3>
    <div class="meta-row"><span class="val" style="color:var(--red)">${escHtml(msg)}</span></div>`;
  document.getElementById("result-section").style.display = "block";

  showProgressError();
}

function hideResult() {
  document.getElementById("result-section").style.display = "none";
}

function metaRow(k, v) {
  return `<div class="meta-row"><span class="key">${escHtml(k)}</span><span class="val">${escHtml(String(v))}</span></div>`;
}
