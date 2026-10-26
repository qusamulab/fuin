const DANGEROUS_PERMS = new Set([
  "android.permission.READ_CONTACTS","android.permission.WRITE_CONTACTS",
  "android.permission.ACCESS_FINE_LOCATION","android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.READ_CALL_LOG","android.permission.WRITE_CALL_LOG",
  "android.permission.CAMERA","android.permission.RECORD_AUDIO",
  "android.permission.READ_PHONE_STATE","android.permission.CALL_PHONE",
  "android.permission.READ_SMS","android.permission.SEND_SMS",
  "android.permission.READ_EXTERNAL_STORAGE","android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.GET_ACCOUNTS","android.permission.USE_BIOMETRIC",
  "android.permission.BODY_SENSORS","android.permission.ACTIVITY_RECOGNITION",
]);

export function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export function renderPermsHtml(perms) {
  if (!perms.length) return "";
  const dangerous = perms.filter(p => DANGEROUS_PERMS.has(p));
  const safe = perms.filter(p => !DANGEROUS_PERMS.has(p));
  const tags = [
    ...dangerous.map(p => `<span class="perm-tag dangerous">${escHtml(p.replace("android.permission.",""))}</span>`),
    ...safe.map(p => `<span class="perm-tag">${escHtml(p.replace("android.permission.",""))}</span>`),
  ].join("");
  const dangerNote = dangerous.length ? ` <span style="color:var(--red);font-size:11px">(${dangerous.length} dangerous)</span>` : "";
  return `
    <div class="perms-section">
      <button class="perms-toggle" data-toggle-permissions>
        ▸ ${perms.length} permissions${dangerNote}
      </button>
      <div class="perms-list">${tags}</div>
    </div>`;
}

export function renderSdkBadge(value, label) {
  return value != null
    ? `<span class="sdk-badge">${escHtml(label)}: API ${value}</span>` : "";
}
