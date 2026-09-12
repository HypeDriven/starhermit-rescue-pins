// Rescue Pins — StarHermit platform adapter. Browser + Node (no-ops without a
// launch token). Reads the fragment launch token once, refreshes it on a
// 45-minute cadence, resolves the account nickname, mirrors the progression
// doc to the platform cloud-save slot (zip+base64, debounced), and reads the
// platform leaderboard. Every call is same-origin and carries
// `Authorization: Bearer`; every failure falls back to local play silently.

import { hashString, stableStringify } from './rules.js';

// ---- minimal ZIP writer/reader (stored entries only, no compression) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipStore(name, dataBytes) {
  const enc = new TextEncoder();
  const nameB = enc.encode(name);
  const crc = crc32(dataBytes);
  const out = [];
  const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
  u32(crc); u32(dataBytes.length); u32(dataBytes.length);
  u16(nameB.length); u16(0);
  const head = new Uint8Array(out);
  const cd = [];
  const c16 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff);
  const c32 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
  c32(crc); c32(dataBytes.length); c32(dataBytes.length);
  c16(nameB.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(0); // attrs + local-header offset
  const cdHead = new Uint8Array(cd);
  const cdOff = head.length + nameB.length + dataBytes.length;
  const parts = [head, nameB, dataBytes, cdHead, nameB];
  const eocd = [];
  const e32 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const e16 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff);
  e32(0x06054b50); e16(0); e16(0); e16(1); e16(1);
  e32(cdHead.length + nameB.length); e32(cdOff); e16(0);
  parts.push(new Uint8Array(eocd));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return buf;
}
export function unzipFirstEntry(zipBytes) {
  // Stored single-entry reader: scan local headers for compression 0.
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let off = 0;
  while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true);
    const size = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const dataOff = off + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error('unsupported zip entry');
    return zipBytes.slice(dataOff, dataOff + size);
  }
  throw new Error('bad zip');
}
export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// ---- launch token ----
function readLaunchToken() {
  if (typeof window === 'undefined' || !window.location) return null;
  // Production: token arrives in the URL fragment. Read once, then strip it.
  try {
    const h = window.location.hash || '';
    if (h.indexOf('game_token=') !== -1) {
      const token = new URLSearchParams(h.slice(1)).get('game_token');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (token) return token;
    }
  } catch { /* history denied: keep the hash, still use the token */ }
  // Local dev only: query-param fallbacks against the repo's own server.js.
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get('game_token') || q.get('token') || q.get('launch') || q.get('launch_token');
  } catch { return null; }
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    return json && typeof json === 'object' ? json : null;
  } catch { return null; }
}

export function createPlatform(opts = {}) {
  const onSync = opts.onSync || (() => {});
  const enc = new TextEncoder();
  let token = null, userId = null, slug = null;
  let nickname = null;
  let sync = 'local'; // local | connecting | synced | saving | error
  let refreshTimer = null, saveTimer = null, pushing = false, pendingDoc = null;
  const profileCache = new Map();

  function hosted() { return !!token; }
  function setSync(s) { sync = s; onSync(syncLabel()); }
  function syncLabel() {
    switch (sync) {
      case 'synced': return 'Cloud save synced';
      case 'saving': return 'Cloud saving…';
      case 'connecting': return 'Cloud connecting…';
      case 'error': return 'Cloud sync error — local copy safe';
      default: return null; // local play: no badge
    }
  }
  function displayName() {
    if (!hosted() || !userId) return null;
    return nickname || ('Player ' + String(userId).slice(0, 8));
  }

  // Same-origin authenticated fetch; resolves null on any failure (never throws).
  async function apiFetch(path, options = {}) {
    if (!token) return null;
    try {
      return await fetch(path, {
        ...options,
        headers: { authorization: 'Bearer ' + token, ...(options.headers || {}) },
        signal: options.signal || AbortSignal.timeout(8000),
      });
    } catch { return null; }
  }

  function later(fn, ms) {
    const t = setTimeout(fn, ms);
    if (t && typeof t.unref === 'function') t.unref(); // never hold the process (Node)
    return t;
  }

  // ---- token refresh (60-min lifetime; re-mint every 45 min, retry ~60 s) ----
  async function refreshToken() {
    const res = await apiFetch(`/api/v1/games/${encodeURIComponent(slug)}/launch-token`, { method: 'POST' });
    const body = res && res.ok ? await res.json().catch(() => null) : null;
    if (body && body.token) {
      token = body.token;
      const p = decodeJwtPayload(token);
      if (p) { userId = p.sub || userId; slug = p.game_scope || slug; }
      refreshTimer = later(() => { void refreshToken(); }, 45 * 60 * 1000);
    } else {
      refreshTimer = later(() => { void refreshToken(); }, 60 * 1000);
    }
  }

  // ---- profile nickname (NEVER /api/v1/me, never usernames) ----
  async function fetchProfileName(uid) {
    if (profileCache.has(uid)) return profileCache.get(uid);
    let name = 'Player ' + String(uid).slice(0, 8);
    const res = await apiFetch(`/api/v1/users/${encodeURIComponent(uid)}/profile`);
    const body = res && res.ok ? await res.json().catch(() => null) : null;
    if (body && body.nickname) name = body.nickname;
    profileCache.set(uid, name);
    return name;
  }
  async function loadProfile() {
    const name = await fetchProfileName(userId);
    nickname = name === 'Player ' + String(userId).slice(0, 8) ? null : name;
    onSync(syncLabel()); // re-render name slots
  }

  // ---- cloud save (one slot, zip+base64; localStorage stays the offline cache) ----
  function docWithChecksum(doc) {
    const out = { ...doc, v: 1 };
    out.checksum = hashString(stableStringify({ ...out, checksum: undefined }));
    return out;
  }
  function validateDoc(text) {
    try {
      const doc = JSON.parse(text);
      if (!doc || doc.v !== 1) return null;
      if (doc.checksum !== hashString(stableStringify({ ...doc, checksum: undefined }))) return null;
      const { checksum, ...data } = doc;
      return { v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [],
               achievements: [], rescuedTotal: 0, coachDone: false, ...data };
    } catch { return null; }
  }
  async function loadCloudSave() {
    const res = await apiFetch(`/api/v1/me/cloud-saves/${encodeURIComponent(slug)}`);
    if (!res || !res.ok) return null; // 404 = none yet, other = offline
    try {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return validateDoc(new TextDecoder().decode(unzipFirstEntry(bytes)));
    } catch { return null; }
  }
  async function pushPending() {
    if (!token || !pendingDoc || pushing) return;
    pushing = true;
    try {
      const res = await apiFetch(`/api/v1/me/cloud-saves/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataBase64: bytesToBase64(zipStore('save.json', enc.encode(pendingDoc))) }),
      });
      if (res && res.ok) { pendingDoc = null; setSync('synced'); }
      else setSync('error');
    } finally { pushing = false; }
  }
  function queueCloudSave(doc) {
    if (!token) return;
    pendingDoc = JSON.stringify(docWithChecksum(doc));
    setSync('saving');
    if (saveTimer) return;
    saveTimer = later(() => { saveTimer = null; void pushPending(); }, 2000);
  }
  function flushCloudSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    void pushPending();
  }

  // ---- platform leaderboard (read-only; resolve userIds to nicknames) ----
  async function fetchLeaderboardEntries(pageSize) {
    const g = await apiFetch(`/api/v1/games/${encodeURIComponent(slug)}`);
    const info = g && g.ok ? await g.json().catch(() => null) : null;
    if (!info || !info.leaderboardId) return null; // no platform board: local records only
    const r = await apiFetch(`/api/v1/leaderboards/${encodeURIComponent(info.leaderboardId)}/entries?page=1&pageSize=${pageSize | 0 || 10}`);
    const body = r && r.ok ? await r.json().catch(() => null) : null;
    const list = body && Array.isArray(body.entries) ? body.entries : [];
    const out = [];
    for (const e of list.slice(0, pageSize)) {
      const uid = e.userId || e.user_id;
      out.push({ name: uid ? await fetchProfileName(uid) : 'Player', score: e.score });
    }
    return out.length ? out : null;
  }

  function start() {
    if (typeof window === 'undefined') return;
    token = readLaunchToken();
    const p = token && decodeJwtPayload(token);
    if (!p || !p.sub || !p.game_scope) { token = null; return; } // malformed: stay local
    userId = p.sub;
    slug = p.game_scope;
    setSync('connecting');
    void refreshToken();
    void loadProfile();
    window.addEventListener('pagehide', flushCloudSave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloudSave(); });
  }

  return {
    start, hosted, displayName, syncLabel,
    authHeaders: () => (token ? { authorization: 'Bearer ' + token } : {}),
    loadCloudSave, queueCloudSave, flushCloudSave, fetchLeaderboardEntries,
  };
}
