// Fetch every source, score the results and merge them into the database.
// Run directly (`npm run scrape`) for a headless refresh, or via the dashboard's Refresh button.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ATS, BOARDS } from './sources.js';
import { compileProfile, scoreJob, isRelevant } from './score.js';
import { pool } from './util.js';
import { ROOT, loadDb, saveDb } from './store.js';

const DESCRIPTION_LIMIT = 8000;
const DAY = 24 * 60 * 60 * 1000;
const BOARD_STALE_DAYS = 30; // board jobs not seen for this long are marked closed
const PRUNE_AFTER_DAYS = 30; // closed jobs you never acted on are deleted after this

/** Load config.js fresh each time so edits apply without restarting the server. */
export async function loadConfig() {
  const url = `${pathToFileURL(path.join(ROOT, 'config.js')).href}?v=${Date.now()}`;
  return (await import(url)).default;
}

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
// "Embark Studios AB" on Platsbanken is the same employer as "Embark Studios" on Teamtailor.
const LEGAL_SUFFIX = /\b(ab|publ|inc|ltd|llc|gmbh|plc|oy|as|aps|bv|sa|corp|corporation|limited|co)\b\.?/gi;
const dupKey = (j) => `${norm((j.company || '').replace(LEGAL_SUFFIX, ''))}|${norm(j.title)}`;
const untouched = (j) => (j.status === 'new' || j.status === 'hidden') && !j.notes;

function buildTasks(config) {
  const tasks = [];
  for (const c of config.companies) {
    if (c.enabled === false) continue;
    const adapter = ATS[c.ats];
    if (!adapter) {
      tasks.push({ label: c.name, run: () => Promise.reject(new Error(`unknown ats "${c.ats}"`)) });
      continue;
    }
    // Companies configured by `url` (custom career domains) get an id slug from their name.
    const slug = c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    tasks.push({ label: c.name, prefix: `${c.ats}:${slug}:`, run: () => adapter({ ...c, slug, tags: c.tags || [] }) });
  }
  for (const [key, board] of Object.entries(BOARDS)) {
    if (config.boards?.[key]) tasks.push({ label: board.label, run: () => board.run(config) });
  }
  return tasks;
}

export async function runScrape(config, db, onProgress = () => {}) {
  const started = Date.now();
  const tasks = buildTasks(config);
  let done = 0;
  onProgress({ total: tasks.length, done, current: '' });

  const results = await pool(tasks, 6, async (task) => {
    onProgress({ current: task.label });
    try {
      return { task, jobs: await task.run() };
    } catch (err) {
      return { task, error: err.message };
    } finally {
      onProgress({ done: ++done });
    }
  });

  // Everything below is synchronous, so it can't interleave with edits coming from the UI.
  const rules = compileProfile(config.profile);
  const now = new Date().toISOString();
  const byKey = new Map(Object.values(db.jobs).map((j) => [dupKey(j), j.id]));
  const seen = new Set();
  const processed = new Set(); // feeds that page while new jobs arrive can list a job twice
  const runKeys = new Map(); // company+title → id of the first copy kept this run
  const stats = { fetched: 0, added: 0, updated: 0, closed: 0, removed: 0 };

  for (const { jobs } of results) {
    for (const job of jobs || []) {
      stats.fetched++;
      if (processed.has(job.id)) continue;
      processed.add(job.id);
      // Companies often post one role once per city: keep one card and list every location on it.
      const keptId = runKeys.get(dupKey(job));
      if (keptId && keptId !== job.id) {
        const kept = db.jobs[keptId];
        if (kept && job.location && !kept.location.includes(job.location)) kept.location += `; ${job.location}`;
        continue;
      }

      // Board listings often duplicate each other (or a company's own posting): match them by company + title.
      const matchId = db.jobs[job.id] ? job.id : job.kind === 'board' ? byKey.get(dupKey(job)) : undefined;
      const existingId = matchId && db.jobs[matchId] ? matchId : undefined;
      runKeys.set(dupKey(job), existingId || job.id);
      const s = scoreJob(job, rules);
      const fields = { ...job, description: job.description.slice(0, DESCRIPTION_LIMIT), ...s };

      if (existingId) {
        const existing = db.jobs[existingId];
        if (seen.has(existingId) && existingId !== job.id) continue;
        seen.add(existingId);
        if (existingId === job.id) {
          if (untouched(existing) && existing.status === 'new' && !isRelevant(s, config.profile)) {
            delete db.jobs[existingId]; // no longer relevant under the current config
            byKey.delete(dupKey(existing));
            stats.removed++;
            continue;
          }
          Object.assign(existing, fields);
        }
        existing.lastSeen = now;
        if (existing.closed) {
          delete existing.closed;
          delete existing.closedAt;
        }
        stats.updated++;
      } else if (isRelevant(s, config.profile)) {
        db.jobs[job.id] = { ...fields, status: 'new', notes: '', firstSeen: now, lastSeen: now };
        byKey.set(dupKey(job), job.id);
        seen.add(job.id);
        stats.added++;
      }
    }
  }

  // A job missing from a company board that loaded fine has been taken down.
  const okPrefixes = results.filter((r) => !r.error && r.task.prefix).map((r) => r.task.prefix);
  for (const j of Object.values(db.jobs)) {
    if (j.closed || seen.has(j.id)) continue;
    const goneFromAts = okPrefixes.some((p) => j.id.startsWith(p));
    const staleBoard = j.kind === 'board' && Date.parse(j.lastSeen) < started - BOARD_STALE_DAYS * DAY;
    if (goneFromAts || staleBoard) {
      j.closed = true;
      j.closedAt = now;
      stats.closed++;
    }
  }

  for (const j of Object.values(db.jobs)) {
    if (j.closed && untouched(j) && Date.parse(j.closedAt) < started - PRUNE_AFTER_DAYS * DAY) {
      delete db.jobs[j.id];
      stats.removed++;
    }
  }

  const failed = results.filter((r) => r.error).map((r) => ({ source: r.task.label, error: r.error }));
  db.lastScrape = now;
  db.lastSummary = { ...stats, sources: tasks.length, failed, seconds: Math.round((Date.now() - started) / 1000) };
  return db.lastSummary;
}

/** Re-apply the current config's scoring to every stored job (used on startup). */
export function rescoreAll(config, db) {
  const rules = compileProfile(config.profile);
  for (const j of Object.values(db.jobs)) {
    const fresh = scoreJob(j, rules);
    if (j.source !== 'manual' && j.status === 'new' && untouched(j) && !isRelevant(fresh, config.profile)) {
      delete db.jobs[j.id];
    } else {
      Object.assign(j, fresh);
    }
  }
}

// CLI: node src/scrape.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = await loadConfig();
  const db = loadDb();
  let last = '';
  const summary = await runScrape(config, db, (p) => {
    if (p.current && p.current !== last) process.stdout.write(`  fetching ${(last = p.current)}…\n`);
  });
  saveDb(db, { backup: true });
  console.log(
    `\nDone in ${summary.seconds}s: ${summary.fetched} jobs fetched, ${summary.added} new matches, ` +
      `${summary.closed} closed, ${Object.keys(db.jobs).length} in your list.`,
  );
  for (const f of summary.failed) console.log(`  ⚠ ${f.source}: ${f.error}`);
}
