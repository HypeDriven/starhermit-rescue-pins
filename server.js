// Rescue Pins — authoritative server. node:http only, no dependencies.
// Static distribution + same-origin API: time, daily replay verify, leaderboard.

import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from './js/session.js';
import { getDailyLevel, findLevel, dailySeedForDate, CONTENT_VERSION } from './js/content.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// overridable so tests never pollute the shipped leaderboard file
const DATA_DIR = process.env.RESCUE_PINS_DATA_DIR || join(ROOT, 'data');
const PORT = parseInt(process.env.PORT || '8000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json',
  '.opus': 'audio/ogg',
};

function send(res, code, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body;
  res.writeHead(code, { 'content-type': isObj ? 'application/json' : 'text/plain', ...headers });
  res.end(data);
}
const err = (res, code, msg) => send(res, code, { error: msg });

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('payload-too-large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ---- leaderboard storage (JSON file, validated entries only) ----
const LB_FILE = join(DATA_DIR, 'leaderboard.json');
let lbCache = null;
async function loadLb() {
  if (lbCache) return lbCache;
  try { lbCache = JSON.parse(await readFile(LB_FILE, 'utf8')); }
  catch { lbCache = { v: 1, entries: [] }; }
  if (!Array.isArray(lbCache.entries)) lbCache = { v: 1, entries: [] };
  return lbCache;
}
async function saveLb(lb) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LB_FILE, JSON.stringify(lb, null, 1));
}

function plausible(envelope, score) {
  if (!score || !Number.isInteger(score.total) || score.total < 0 || score.total > 100000) return false;
  const dur = envelope.elapsedMs | 0;
  if (dur < 0 || dur > 6 * 3600 * 1000) return false;
  if (envelope.won && dur > 0 && dur < 800) return false; // impossibly fast completion
  return true;
}

// Only the current UTC day's seed (plus a one-day grace for runs that started
// before midnight) may be submitted; otherwise future dailies could be
// pre-solved and ancient days farmed for the ranked board.
function dailySeedAccepted(seed) {
  const today = dailySeedForDate(new Date());
  return seed === today || seed === today - 1;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/v1/time' && req.method === 'GET') {
    return send(res, 200, { serverTime: Date.now(), contentVersion: CONTENT_VERSION });
  }

  if (url.pathname === '/api/v1/daily/verify' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return err(res, 400, e.message === 'payload-too-large' ? 'payload-too-large' : 'bad-json'); }
    if (!body || typeof body !== 'object') return err(res, 400, 'bad-request');
    const { envelope, name } = body;
    if (!envelope || typeof envelope !== 'object') return err(res, 400, 'missing-envelope');
    if (envelope.contentVersion !== CONTENT_VERSION) return err(res, 409, 'stale-content-version');
    if (!Number.isInteger(envelope.seed) || envelope.seed < 0) return err(res, 400, 'bad-seed');
    if (!dailySeedAccepted(envelope.seed >>> 0)) return err(res, 422, 'stale-or-future-daily-seed');
    const level = getDailyLevel(envelope.seed >>> 0);
    if (level.excluded) return err(res, 422, 'day-excluded-from-ranking');
    // authoritative replay through the same rules the client ships
    const gate = createSession({ level, mode: 'daily', now: 0 });
    const verdict = gate.verifyReplay(envelope, level);
    if (!verdict.valid) return err(res, 422, verdict.error);
    if (!plausible(envelope, verdict.score)) return err(res, 422, 'implausible-score');
    return send(res, 200, { valid: true, score: verdict.score, won: verdict.won });
  }

  if (url.pathname === '/api/v1/leaderboard') {
    const lb = await loadLb();
    if (req.method === 'GET') {
      const scope = url.searchParams.get('scope') === 'friends' ? 'friends' : 'global';
      const seed = url.searchParams.get('seed');
      let entries = lb.entries;
      if (seed !== null) entries = entries.filter(e => e.seed === (parseInt(seed, 10) >>> 0));
      // friends filter accepted; the solo build has no friends graph, so it
      // returns only entries the client marks as friends (by name param)
      if (scope === 'friends') {
        const names = (url.searchParams.get('names') || '').split(',').filter(Boolean);
        entries = entries.filter(e => names.includes(e.name));
      }
      entries = entries.slice().sort((a, b) => b.score - a.score || a.duration - b.duration).slice(0, 100);
      return send(res, 200, { scope, entries });
    }
    if (req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { return err(res, 400, e.message === 'payload-too-large' ? 'payload-too-large' : 'bad-json'); }
      const { name, seed, contentVersion, envelope, submissionId } = body || {};
      if (typeof submissionId !== 'string' || submissionId.length < 4 || submissionId.length > 64) return err(res, 400, 'bad-submission-id');
      if (typeof name !== 'string' || name.trim().length === 0 || name.length > 24) return err(res, 400, 'bad-name');
      if (contentVersion !== CONTENT_VERSION) return err(res, 409, 'stale-content-version');
      if (!Number.isInteger(seed) || seed < 0) return err(res, 400, 'bad-seed');
      if (!dailySeedAccepted(seed >>> 0)) return err(res, 422, 'stale-or-future-daily-seed');
      // idempotent: same submission id returns the stored result
      const dupe = lb.entries.find(e => e.submissionId === submissionId);
      if (dupe) return send(res, 200, { stored: true, duplicate: true, entry: dupe });
      if (lb.entries.filter(e => e.name === name).length > 500) return err(res, 429, 'rate-limited');
      const level = findLevel('daily-' + (seed >>> 0));
      if (!level || level.excluded) return err(res, 422, 'unknown-or-excluded-seed');
      const gate = createSession({ level, mode: 'daily', now: 0 });
      const verdict = gate.verifyReplay(envelope, level);
      if (!verdict.valid) return err(res, 422, verdict.error);
      if (!plausible(envelope, verdict.score)) return err(res, 422, 'implausible-score');
      const entry = {
        submissionId, name: name.trim(), score: verdict.score.total, seed: seed >>> 0,
        contentVersion, duration: envelope.elapsedMs | 0,
        assists: (envelope.assists | 0) || 0, won: verdict.won, at: Date.now(),
      };
      lb.entries.push(entry);
      if (lb.entries.length > 5000) lb.entries = lb.entries.slice(-5000);
      await saveLb(lb);
      return send(res, 200, { stored: true, entry });
    }
    return err(res, 405, 'method-not-allowed');
  }

  return err(res, 404, 'not-found');
}

async function serveStatic(req, res, url) {
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return err(res, 400, 'bad-path'); }
  if (path.split(/[\\/]/).some(p => p.startsWith('.'))) return err(res, 403, 'forbidden');
  if (path === '/') path = '/index.html';
  const full = normalize(join(ROOT, path));
  if (!full.startsWith(ROOT)) return err(res, 403, 'forbidden');
  if (full.startsWith(join(ROOT, 'data'))) return err(res, 403, 'forbidden');
  if (!existsSync(full)) return err(res, 404, 'not-found');
  try {
    const data = await readFile(full);
    send(res, 200, data, { 'content-type': MIME[extname(full)] || 'application/octet-stream',
                            'cache-control': full.includes('three') ? 'immutable, max-age=31536000' : 'no-cache' });
  } catch { err(res, 404, 'not-found'); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return err(res, 405, 'method-not-allowed');
      return await serveStatic(req, res, url);
    } catch (e) {
      console.error(e);
      return err(res, 500, 'internal-error');
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(PORT, () => console.log(`Rescue Pins listening on http://localhost:${PORT}`));
}
