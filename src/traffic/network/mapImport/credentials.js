const storageKey = 'crashpad:amap-credentials:v1';
export function readCredentials() {
  try { const value = JSON.parse(localStorage.getItem(storageKey)); return typeof value?.key === 'string' && typeof value?.secret === 'string' ? value : {key:'',secret:''}; }
  catch { return {key:'',secret:''}; }
}
export function saveCredentials(key, secret) {
  try { localStorage.setItem(storageKey, JSON.stringify({key:key.trim(),secret:secret.trim()})); return true; } catch { return false; }
}
export function clearCredentials() {
  try { localStorage.removeItem(storageKey); return true; } catch { return false; }
}
