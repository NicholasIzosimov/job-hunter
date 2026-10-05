// Local dashboard server: serves public/ and a small JSON API over data/jobs.json.
// Start with `npm start` (or double-click "Start Job Hunter.bat"), then use http://localhost:3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { ROOT, STATUSES, DEFAULT_PROFILE, loadDb, saveDb } from './src/store.js';
import { loadConfig, runScrape, rescoreAll } from './src/scrape.js';
import { compileProfile, scoreJob } from './src/score.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const CV_DIR = path.join(ROOT, 'cv');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const CV_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

let config = await loadConfig();
const url = `http://localhost:${config.port}`;

// Already running (e.g. the .bat was double-clicked again)? Just open it. This must happen before
// touching data/: the running copy keeps the database in memory and would overwrite any changes.
let alreadyRunning = false;
try {
  const res = await fetch(`http://127.0.0.1:${config.port}/api/status`, { signal: AbortSignal.timeout(1500) });
  alreadyRunning = res.ok;
} catch {
  /* not running: start normally */
}
if (alreadyRunning) {
  console.log(`Job Hunter is already running. Opening ${url}`);
  console.log('To restart it (e.g. after an update), close its window first, then start it again.');
  openBrowser();
  await new Promise((r) => setTimeout(r, 4000)); // leave the message up long enough to read
  process.exit(0);
}

const db = loadDb();
rescoreAll(config, db);
// Secret the bookmarklet sends, so other websites can't read your CV/profile from this local server.
if (!db.applyKey) db.applyKey = crypto.randomBytes(16).toString('hex');
// One-time profile seed (e.g. written during setup), applied to empty fields only.
const SEED_FILE = path.join(ROOT, 'data', 'profile-seed.json');
if (fs.existsSync(SEED_FILE)) {
  try {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    for (const [k, v] of Object.entries(seed)) if (k in DEFAULT_PROFILE && !db.profile[k]) db.profile[k] = String(v);
    fs.rmSync(SEED_FILE);
  } catch (err) {
    console.error('Could not read profile-seed.json:', err.message);
  }
}
saveDb(db);

// ── Scraping (runs in the background; the UI polls /api/status) ─────────────
const scrape = { running: false, done: 0, total: 0, current: '', error: null };

async function startScrape() {
  if (scrape.running) return;
  Object.assign(scrape, { running: true, done: 0, total: 0, current: 'Starting…', error: null });
  try {
    config = await loadConfig();
    const summary = await runScrape(config, db, (p) => Object.assign(scrape, p));
    saveDb(db, { backup: true });
    console.log(`Refreshed: ${summary.added} new matches, ${summary.failed.length} source(s) failed.`);
  } catch (err) {
    scrape.error = err.message;
    console.error('Scrape failed:', err);
  } finally {
    scrape.running = false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The list view skips the (large) description; the UI fetches it when a card is expanded. */
function summary(j) {
  const { description, ...rest } = j;
  return rest;
}

function applyUpdate(job, body) {
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw Object.assign(new Error('Unknown status'), { status: 400 });
    if (body.status !== job.status) {
      job.status = body.status;
      job.statusAt = new Date().toISOString();
      if (body.status === 'applied' && !job.appliedAt) job.appliedAt = job.statusAt;
      if (body.status === 'new' || body.status === 'saved') delete job.appliedAt;
    }
  }
  if (body.notes !== undefined) job.notes = str(body.notes);
}

// ── Apply kit: which cover letter + CV go with a job ────────────────────────
// Games jobs, and tech jobs outside music, get the tech letter/CV; everything else the music ones.
const kindOf = (job) => (job.cats?.includes('games') || (job.cats?.includes('tech') && !job.cats?.includes('music')) ? 'tech' : 'music');

function fillTemplate(text, job) {
  const p = db.profile;
  const vars = {
    company: job.company || '',
    title: job.title || '',
    location: (job.location || '').split(';')[0],
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    name: [p.firstName, p.lastName].filter(Boolean).join(' '),
    phone: p.phone,
    email: p.email,
    linkedin: p.linkedin,
    portfolio: p.portfolio,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function cvFiles() {
  try {
    return fs.readdirSync(CV_DIR).filter((f) => CV_TYPES[path.extname(f).toLowerCase()]).sort();
  } catch {
    return [];
  }
}

function applyKit(job) {
  const kind = kindOf(job);
  const p = db.profile;
  const snippet =
    db.snippets.find((s) => s.id === (kind === 'tech' ? p.letterTech : p.letterMusic)) ||
    db.snippets.find((s) => s.default) ||
    db.snippets[0];
  const cvName = (kind === 'tech' ? p.cvTech : p.cvMusic) || p.cvMusic || p.cvTech || '';
  return { kind, letterName: snippet?.name || '', letter: snippet ? fillTemplate(snippet.text, job) : '', cvName };
}

function csv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

// ── Routes ──────────────────────────────────────────────────────────────────
async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://x');
  const method = req.method;

  if (!pathname.startsWith('/api/')) return serveStatic(req, res);

  // Called by the "Fill application" bookmarklet from the job site's page, so it allows any
  // origin, but only with the secret key that is baked into your bookmarklet.
  if (pathname === '/api/apply-kit') {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': '*',
      'access-control-allow-private-network': 'true',
    };
    if (method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const key = new URL(req.url, 'http://x').searchParams.get('key') || '';
    const ok = key.length === db.applyKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(db.applyKey));
    const reply = (status, body) => {
      res.writeHead(status, { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (!ok) return reply(403, { error: 'Unknown key' });
    const job = db.current && db.jobs[db.current.id];
    if (!job) return reply(404, { error: 'No job selected: click Apply in Job Hunter first' });
    const kit = applyKit(job);
    let cv = null;
    if (kit.cvName && cvFiles().includes(kit.cvName)) {
      const file = path.join(CV_DIR, kit.cvName);
      cv = { name: kit.cvName, type: CV_TYPES[path.extname(file).toLowerCase()], base64: fs.readFileSync(file).toString('base64') };
    }
    return reply(200, { job: { title: job.title, company: job.company, url: job.url }, kind: kit.kind, letter: kit.letter, cv });
  }

  if (pathname === '/api/profile') {
    if (method === 'GET') return send(res, 200, { profile: db.profile, key: db.applyKey, cvFiles: cvFiles() });
    if (method === 'PUT') {
      const body = await readBody(req);
      for (const k of Object.keys(DEFAULT_PROFILE)) if (k in body) db.profile[k] = str(body[k], 500).trim();
      saveDb(db);
      return send(res, 200, { profile: db.profile, key: db.applyKey, cvFiles: cvFiles() });
    }
  }

  // Remembers which job you're applying to (for the bookmarklet) and returns its letter + CV choice.
  const kitMatch = pathname.match(/^\/api\/jobs\/(.+)\/kit$/);
  if (kitMatch && method === 'POST') {
    const job = db.jobs[decodeURIComponent(kitMatch[1])];
    if (!job) return send(res, 404, { error: 'Job not found' });
    const body = await readBody(req);
    if (body.current) db.current = { id: job.id, at: new Date().toISOString() };
    return send(res, 200, applyKit(job));
  }

  if (method === 'GET' && pathname === '/api/jobs') {
    return send(res, 200, {
      jobs: Object.values(db.jobs).map(summary),
      lastScrape: db.lastScrape,
      lastSummary: db.lastSummary,
      categories: Object.fromEntries(Object.entries(config.profile.categories).map(([k, c]) => [k, c.label])),
      homeLabel: config.profile.location?.label || 'Home',
      countryLabel: config.profile.location?.country?.[0]?.replace(/^./, (c) => c.toUpperCase()) || 'Country',
    });
  }

  if (method === 'GET' && pathname === '/api/status') {
    return send(res, 200, { ...scrape, lastScrape: db.lastScrape, lastSummary: db.lastSummary });
  }

  if (method === 'POST' && pathname === '/api/scrape') {
    startScrape();
    return send(res, 202, { started: true });
  }

  if (method === 'POST' && pathname === '/api/jobs') {
    const body = await readBody(req);
    const title = str(body.title, 300).trim();
    const company = str(body.company, 200).trim();
    if (!title || !company) return send(res, 400, { error: 'Title and company are required' });
    const now = new Date().toISOString();
    const url = str(body.url, 2000).trim();
    const job = {
      id: `manual:${Date.now().toString(36)}`,
      source: 'manual',
      kind: 'manual',
      company,
      companyTags: [],
      title,
      location: str(body.location, 300).trim(),
      remote: /remote/i.test(body.location || ''),
      url,
      applyUrl: url,
      postedAt: null,
      department: '',
      salary: '',
      description: '',
      status: 'new',
      notes: '',
      firstSeen: now,
      lastSeen: now,
    };
    Object.assign(job, scoreJob(job, compileProfile(config.profile)));
    applyUpdate(job, { status: body.status || 'saved', notes: body.notes });
    db.jobs[job.id] = job;
    saveDb(db);
    return send(res, 201, summary(job));
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/(.+)$/);
  if (jobMatch) {
    const job = db.jobs[decodeURIComponent(jobMatch[1])];
    if (!job) return send(res, 404, { error: 'Job not found' });
    if (method === 'GET') return send(res, 200, job);
    if (method === 'PATCH') {
      applyUpdate(job, await readBody(req));
      saveDb(db);
      return send(res, 200, summary(job));
    }
  }

  if (pathname === '/api/snippets') {
    if (method === 'GET') return send(res, 200, db.snippets);
    if (method === 'PUT') {
      const body = await readBody(req);
      if (!Array.isArray(body)) return send(res, 400, { error: 'Expected a list of snippets' });
      db.snippets = body.slice(0, 50).map((s, i) => ({
        id: str(s.id, 60) || `snippet-${i}`,
        name: str(s.name, 100) || 'Untitled',
        text: str(s.text),
        ...(s.default ? { default: true } : {}),
      }));
      saveDb(db);
      return send(res, 200, db.snippets);
    }
  }

  if (method === 'GET' && pathname === '/api/export.csv') {
    const tracked = Object.values(db.jobs)
      .filter((j) => !['new', 'hidden'].includes(j.status))
      .sort((a, b) => (b.appliedAt || b.statusAt || '').localeCompare(a.appliedAt || a.statusAt || ''));
    const rows = [
      ['Status', 'Applied', 'Company', 'Title', 'Location', 'Link', 'Source', 'Notes', 'Score', 'Posted'],
      ...tracked.map((j) => [
        j.status, j.appliedAt?.slice(0, 10), j.company, j.title, j.location, j.url, j.source, j.notes, j.score,
        j.postedAt?.slice(0, 10),
      ]),
    ];
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    return res.end('﻿' + csv(rows)); // BOM so Excel reads UTF-8 correctly
  }

  send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (!err.status) console.error(err);
    send(res, err.status || 500, { error: err.message });
  });
});

function findChrome() {
  const candidates =
    process.platform === 'win32'
      ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
          .filter(Boolean)
          .map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'];
  return candidates.find((p) => fs.existsSync(p));
}

/** Opens the dashboard in Chrome (config.browser: 'chrome'), falling back to the default browser. */
function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  const chrome = config.browser === 'chrome' && findChrome();
  if (chrome) {
    spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Not Job Hunter (that was checked at startup): another program is using the port.
    console.log(`Port ${config.port} is used by another program. Change "port" in config.js and start again.`);
    process.exit(1);
  }
  throw err;
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Job Hunter running at ${url}  (Ctrl+C to stop)`);
  openBrowser();
  const ageHours = db.lastScrape ? (Date.now() - Date.parse(db.lastScrape)) / 3.6e6 : Infinity;
  if (ageHours > (config.autoRefreshHours ?? 6)) startScrape();
});
