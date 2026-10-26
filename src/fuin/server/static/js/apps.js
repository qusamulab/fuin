import { apiFetch, downloadFile, getKey } from "./api.js";
import { escHtml, renderPermsHtml, renderSdkBadge } from "./ui.js";

export function initApps() {
  document.getElementById("refresh-apps-btn").addEventListener("click", loadApps);
  const actions = {
    details: toggleDetails,
    download: downloadApp,
    delete: deleteApp,
    "mapping-download": downloadMapping,
    "mapping-upload": uploadMapping,
  };
  document.getElementById("apps-list").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (button) actions[button.dataset.action]?.(button.dataset.appId, button.dataset.package);
  });
  loadApps();
}

export async function loadApps() {
  const key = getKey();
  if (!key) return;
  try {
    const res = await apiFetch("/apps");
    if (!res.ok) return;
    const apps = await res.json();
    renderApps(apps);
  } catch {}
}

function renderApps(apps) {
  const list = document.getElementById("apps-list");
  if (!apps.length) {
    list.innerHTML = '<div class="empty-state">No packed apps yet.</div>';
    return;
  }
  list.innerHTML = apps.map(a => {
    const analysis = a.analysis || {};
    const sdkText = [
      analysis.min_sdk != null ? `min API ${analysis.min_sdk}` : null,
      analysis.target_sdk != null ? `target API ${analysis.target_sdk}` : null,
    ].filter(Boolean).join(" · ");
    const dexText = analysis.dex_count > 1 ? `${analysis.dex_count} DEX` : "";
    const date = a.created_at ? new Date(a.created_at).toLocaleDateString() : "";
    const mappingBtn = a.has_mapping
      ? `<button class="btn-sm mapping" data-action="mapping-download" data-app-id="${a.app_id}" data-package="${escHtml(a.package_name)}">📄 mapping</button>`
      : ``;

    return `
    <div class="app-card" id="app-${a.app_id}">
      <div class="app-card-header">
        <div class="app-card-info">
          <div class="app-card-pkg">${escHtml(a.package_name)}</div>
          <div class="app-card-meta">
            ${sdkText ? `<span>${escHtml(sdkText)}</span>` : ""}
            ${dexText ? `<span>${escHtml(dexText)}</span>` : ""}
            ${date ? `<span>${escHtml(date)}</span>` : ""}
            <span class="app-card-sig">${escHtml(a.apk_signature.substring(0,16))}…</span>
          </div>
        </div>
        <div class="app-card-actions">
          <button class="btn-sm" data-action="details" data-app-id="${a.app_id}">details</button>
          <button class="btn-sm" data-action="download" data-app-id="${a.app_id}" data-package="${escHtml(a.package_name)}">⬇ Download</button>
          <button class="btn-sm danger" data-action="delete" data-app-id="${a.app_id}">Delete</button>
        </div>
      </div>
      <div class="app-card-details" id="details-${a.app_id}">
        ${renderAppDetails(a)}
        <div style="margin-top:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">ProGuard Mapping</div>
          ${mappingBtn}
          <div class="mapping-upload">
            <input type="file" id="mapping-file-${a.app_id}" accept=".txt,.map" />
            <button class="btn-sm" data-action="mapping-upload" data-app-id="${a.app_id}">Upload mapping.txt</button>
          </div>
          <div class="mapping-status" id="mapping-status-${a.app_id}">Uploaded successfully</div>
        </div>
      </div>
    </div>`;
  }).join("");
}

function renderAppDetails(a) {
  const analysis = a.analysis || {};
  const permsHtml = renderPermsHtml(analysis.permissions || []);
  return `
    <div class="info-grid" style="margin-bottom:10px">
      <div class="info-cell"><div class="ic-label">Version</div><div class="ic-val">${escHtml(analysis.version_name||'—')}</div></div>
      <div class="info-cell">
        <div class="ic-label">SDK</div>
        <div class="ic-val" style="display:flex;gap:6px;flex-wrap:wrap">
          ${renderSdkBadge(analysis.min_sdk,'min')||'<span style="color:var(--muted)">—</span>'}
          ${renderSdkBadge(analysis.target_sdk,'target')}
        </div>
      </div>
      <div class="info-cell">
        <div class="ic-label">Components</div>
        <div class="ic-val" style="color:var(--muted);font-size:12px">
          ${analysis.activities||0}A · ${analysis.services||0}S · ${analysis.receivers||0}R · ${analysis.providers||0}P
        </div>
      </div>
      <div class="info-cell">
        <div class="ic-label">DEX</div>
        <div class="ic-val">${escHtml((analysis.dex_files||['classes.dex']).join(', '))}</div>
      </div>
    </div>
    ${permsHtml}`;
}

function toggleDetails(appId) {
  document.getElementById(`details-${appId}`)?.classList.toggle("open");
}

// ── Mapping upload ─────────────────────────────────────────────────────────
async function uploadMapping(appId) {
  const input = document.getElementById(`mapping-file-${appId}`);
  if (!input.files[0]) { alert("Select a mapping.txt first."); return; }
  const fd = new FormData();
  fd.append("file", input.files[0]);
  try {
    const res = await apiFetch(`/apps/${appId}/mapping/upload`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) { alert("Upload failed: " + (await res.json()).detail); return; }
    const status = document.getElementById(`mapping-status-${appId}`);
    if (status) { status.style.display = "block"; setTimeout(() => { status.style.display = "none"; }, 3000); }
  } catch (err) { alert("Error: " + err.message); }
}

async function downloadMapping(appId, pkg) {
  downloadFile(`/apps/${appId}/mapping`, `${pkg}_mapping.txt`);
}

// ── Download / delete ──────────────────────────────────────────────────────
export function downloadApp(appId, pkg) {
  downloadFile(`/apps/${appId}/download`, `${pkg}_packed.apk`);
}

async function deleteApp(appId) {
  if (!confirm("Delete this packed APK?")) return;
  try {
    const res = await apiFetch(`/apps/${appId}`, { method: "DELETE" });
    if (!res.ok) { alert("Delete failed"); return; }
    document.getElementById(`app-${appId}`)?.remove();
    const list = document.getElementById("apps-list");
    if (!list.children.length) list.innerHTML = '<div class="empty-state">No packed apps yet.</div>';
  } catch (err) { alert("Error: " + err.message); }
}
