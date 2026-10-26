export function getKey() {
  return localStorage.getItem("fuin_api_key") || "";
}

export function saveKey(value) {
  localStorage.setItem("fuin_api_key", value.trim());
}

export function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { "X-API-Key": getKey(), ...options.headers },
  });
}

export async function downloadFile(url, filename) {
  try {
    const res = await apiFetch(url);
    if (!res.ok) { alert("Download failed: " + res.statusText); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) { alert("Download error: " + err.message); }
}
