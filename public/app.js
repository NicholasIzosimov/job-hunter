const $ = (sel, el = document) => el.querySelector(sel);

const TABS = [
  { key: 'new', label: 'New' },
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'hidden', label: 'Hidden' },
];
const TRACKED = ['applied', 'interview', 'offer', 'rejected'];
const CAT_ORDER = ['blend', 'music', 'games', 'tech', 'ai', 'creative', 'support', 'otherfit'];
const PAGE = 100;
const DAY = 864e5;

// Which location types (see src/score.js) each "Where" option shows.
const WHERE_FILTERS = {
  reachable: ['home', 'remote', 'remote-unclear', 'unknown'],
  country: ['home', 'remote', 'remote-unclear', 'unknown', 'country'],
  home: ['home'],
  remote: ['remote', 'remote-unclear'],
  any: ['home', 'remote', 'remote-unclear', 'unknown', 'country', 'remote-elsewhere', 'elsewhere'],
};

const state = {
  jobs: [],
  byId: new Map(),
  categories: {},
  snippets: [],
  details: new Map(), // id → full job (with description), fetched on expand
  expanded: new Set(),
  pending: new Set(), // jobs whose application page was opened but not yet confirmed
  writing: new Set(), // jobs Claude is writing a letter for right now
  mail: null, // /api/mail: connection status + emails matched to your applications
  mailByJob: new Map(), // job id → its emails
  mailTab: 'unread', // Mail panel: 'unread' or 'read'
  mailOpen: new Set(), // emails expanded to show their text
  mailBodies: new Map(), // message id → full text
  selected: null,
  limit: PAGE,
  lastUndo: null,
  // persisted filters
  tab: 'new',
  q: '',
  cats: [],
  where: 'reachable',
  homeLabel: 'Home',
  countryLabel: 'Country',
  level: 'realistic',
  age: '0',
  sort: 'score',
  company: '',
};

const PERSISTED = ['tab', 'cats', 'where', 'level', 'age', 'sort', 'company'];
try {
  const saved = JSON.parse(localStorage.getItem('jobhunter.filters') || '{}');
  for (const k of PERSISTED) if (k in saved) state[k] = saved[k];
  if (saved.v !== 2) state.level = 'realistic'; // new default since scoring started weighing seniority
} catch {}
function persist() {
  try {
    localStorage.setItem('jobhunter.filters', JSON.stringify({ v: 2, ...Object.fromEntries(PERSISTED.map((k) => [k, state[k]])) }));
  } catch {}
}

// ── API ───────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function loadJobs() {
  const data = await api('/api/jobs');
  state.jobs = data.jobs;
  state.byId = new Map(data.jobs.map((j) => [j.id, j]));
  state.categories = data.categories;
  state.homeLabel = data.homeLabel;
  state.countryLabel = data.countryLabel;
  const opts = $('#where').options;
  opts[0].text = `${data.homeLabel} + remote`;
  opts[1].text = `${data.countryLabel} + remote`;
  opts[2].text = `${data.homeLabel} only`;
  state.details.clear();
  renderAll();
  renderLastScrape(data.lastScrape);
}

// ── Helpers ───────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function ago(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const postedOf = (j) => j.postedAt || j.firstSeen;
const catLabel = (c) => (c === 'blend' ? '✦ Blend' : state.categories[c] || c);

function fill(template, job) {
  const p = state.profile || {};
  const vars = {
    company: job?.company ?? '',
    title: job?.title ?? '',
    location: job?.location?.split(';')[0] ?? '',
    date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
    name: [p.firstName, p.lastName].filter(Boolean).join(' '),
    phone: p.phone ?? '',
    email: p.email ?? '',
    linkedin: p.linkedin ?? '',
    portfolio: p.portfolio ?? '',
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// ── Filtering ─────────────────────────────────────────────────────────────
const SENIOR_LEVELS = ['senior', 'lead'];
/** 'realistic' = not senior/lead, not PhD-level, and asks for at most 3 years (or doesn't say;
 *  music jobs may ask for up to your years in music). */
function levelOk(j) {
  switch (state.level) {
    case 'realistic':
      return !SENIOR_LEVELS.includes(j.level) && !j.phd && (j.years == null || j.years <= 3 || j.musicYearsOk);
    case 'entry':
      return j.level === 'entry' || j.years === 0;
    case 'no-senior':
      return !SENIOR_LEVELS.includes(j.level);
    default:
      return true;
  }
}
const whereOk = (j) => (WHERE_FILTERS[state.where] || WHERE_FILTERS.reachable).includes(j.where || 'unknown');

function inTab(j, tab) {
  if (j.status !== tab) return false;
  return tab !== 'new' || !j.closed; // closed postings drop out of New, but stay in your tracker
}

function visibleJobs() {
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const maxAge = Number(state.age) * DAY;
  const now = Date.now();
  const list = state.jobs.filter((j) => {
    if (!inTab(j, state.tab)) return false;
    if (state.tab === 'new' && !whereOk(j)) return false; // never hide jobs you've already acted on
    if (!levelOk(j)) return false;
    if (state.company && j.company !== state.company) return false;
    if (state.cats.length && !state.cats.some((c) => j.cats.includes(c))) return false;
    if (maxAge && now - Date.parse(postedOf(j)) > maxAge) return false;
    if (terms.length) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.department}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const newest = (a, b) => (postedOf(b) || '').localeCompare(postedOf(a) || '');
  const sorters = {
    score: (a, b) => b.score - a.score || newest(a, b),
    newest: (a, b) => newest(a, b) || b.score - a.score,
    company: (a, b) => a.company.localeCompare(b.company) || b.score - a.score,
  };
  if (TRACKED.includes(state.tab) && state.sort === 'score') {
    return list.sort((a, b) => (b.statusAt || '').localeCompare(a.statusAt || ''));
  }
  return list.sort(sorters[state.sort] || sorters.score);
}

// ── Rendering ─────────────────────────────────────────────────────────────
function renderAll() {
  renderTabs();
  renderChips();
  renderCompanies();
  renderStats();
  renderList();
}

function renderTabs() {
  const counts = Object.fromEntries(TABS.map((t) => [t.key, 0]));
  for (const j of state.jobs) for (const t of TABS) if (inTab(j, t.key) && (t.key !== 'new' || whereOk(j))) counts[t.key]++;
  $('#tabs').innerHTML = TABS.map(
    (t) =>
      `<button class="tab ${t.key === state.tab ? 'active' : ''}" data-tab="${t.key}" type="button">${t.label}<span class="count">${counts[t.key]}</span></button>`,
  ).join('');
}

function renderChips() {
  const cats = CAT_ORDER.filter((c) => c === 'blend' || c in state.categories);
  $('#chips').innerHTML = cats
    .map((c) => {
      const style = c === 'blend' ? '' : `style="--chip-fg: var(--c-${c}); --chip-bg: var(--c-${c}-bg)"`;
      return `<button class="chip ${state.cats.includes(c) ? 'on' : ''}" data-cat="${c}" ${style} type="button" aria-pressed="${state.cats.includes(c)}">${esc(catLabel(c))}</button>`;
    })
    .join('');
}

function renderCompanies() {
  const counts = new Map();
  for (const j of state.jobs) if (inTab(j, state.tab)) counts.set(j.company, (counts.get(j.company) || 0) + 1);
  if (state.company && !counts.has(state.company)) counts.set(state.company, 0);
  const options = [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  $('#company').innerHTML =
    `<option value="">All companies</option>` +
    options.map(([c, n]) => `<option value="${esc(c)}" ${c === state.company ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('');
}

function renderStats() {
  const applied = state.jobs.filter((j) => j.appliedAt).map((j) => Date.parse(j.appliedAt));
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const today = applied.filter((t) => t >= startOfDay).length;
  const week = applied.filter((t) => t >= Date.now() - 7 * DAY).length;
  $('#stats').innerHTML = `Applied today <b>${today}</b> · this week <b>${week}</b> · total <b>${applied.length}</b>`;
}

// ── Mail ──────────────────────────────────────────────────────────────────
const mailSignature = () => JSON.stringify([...state.mailByJob].map(([id, ms]) => [id, ms.map((m) => m.id + m.unread)]));

function setMail(mail) {
  const before = mailSignature();
  state.mail = mail;
  state.mailByJob = new Map();
  for (const msg of mail.messages) {
    for (const id of msg.jobIds) state.mailByJob.set(id, [...(state.mailByJob.get(id) || []), msg]);
  }
  $('#mailCount').hidden = !mail.unread;
  $('#mailCount').textContent = mail.unread;
  if (!$('#mailDrawer').hidden) renderMailDrawer();
  if (before !== mailSignature() && state.jobs.length) renderList(); // new replies: update the badges
}

async function loadMail() {
  try {
    setMail(await api('/api/mail'));
  } catch {}
}

function mailBadge(j) {
  const mail = state.mailByJob.get(j.id);
  if (!mail) return '';
  const unread = mail.filter((m) => m.unread).length;
  const text = unread ? `📧 ${unread} unread` : `📧 ${mail.length} email${mail.length === 1 ? '' : 's'}`;
  return `<button class="mail-badge ${unread ? 'unread' : ''}" data-act="mail" type="button" title="Emails from ${esc(j.company)} since you applied">${text}</button>`;
}

/** One email. `jobs` = the jobs to show it under, each with a "not this job" button. */
function mailItem(msg, jobs) {
  const about = jobs
    .map(
      (j) => `<div class="row about"><span>↳ ${esc(j.title)} · ${esc(j.company)}</span>
        <button class="btn ghost notthis" data-act="mail-hide" data-msg="${esc(msg.id)}" data-job="${esc(j.id)}" type="button" title="This email isn't about this job">Not this job</button></div>`,
    )
    .join('');
  const body = state.mailBodies.get(msg.id);
  return `<li><details class="mail-item ${msg.unread ? 'unread' : ''}" data-msg="${esc(msg.id)}" ${state.mailOpen.has(msg.id) ? 'open' : ''}>
    <summary>
      <div class="row">
        <span class="subject">${esc(msg.subject)}</span>
        <a class="gmail" href="${esc(msg.link)}" target="_blank" rel="noopener" title="Open in Gmail">Gmail ↗</a>
      </div>
      <span class="from">${esc(msg.fromName || msg.from)} &lt;${esc(msg.from)}&gt; · ${esc(ago(msg.date))}</span>
    </summary>
    <div class="mail-body">${body == null ? 'Loading the email…' : esc(body) || '(This email has no text. Open it in Gmail.)'}</div>
    ${about}
  </details></li>`;
}

/** Fetches an email's full text the first time it's opened, then fills every open copy of it. */
async function loadMailBody(id) {
  if (state.mailBodies.has(id)) return;
  let text;
  try {
    text = (await api(`/api/mail/body?id=${encodeURIComponent(id)}`)).text;
    state.mailBodies.set(id, text);
  } catch (err) {
    text = `Could not load this email: ${err.message}`;
  }
  for (const el of document.querySelectorAll('details.mail-item')) {
    if (el.dataset.msg === id) el.querySelector('.mail-body').textContent = text || '(This email has no text. Open it in Gmail.)';
  }
}

function renderMailDrawer() {
  const m = state.mail;
  if (!m) return;
  const form = $('#mailForm');
  if (document.activeElement?.form !== form) form.user.value = m.user || '';
  form.password.placeholder = m.connected ? 'Saved (paste a new one to replace it)' : 'xxxx xxxx xxxx xxxx';
  $('#mailDisconnect').hidden = !m.connected;
  $('#mailCheck').hidden = !m.connected;
  $('#mailCheck').disabled = !!m.checking;
  const status = $('#mailStatus');
  status.classList.toggle('error', !!m.error);
  const count = `${m.messages.length} email${m.messages.length === 1 ? '' : 's'} from companies you applied to`;
  const checked = m.lastCheck ? ` · checked ${new Date(m.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  status.textContent = m.checking
    ? 'Checking Gmail…'
    : m.error || (m.connected ? `Connected as ${m.user}${checked} · ${count}` : 'Not connected yet.');
  const unread = m.messages.filter((msg) => msg.unread);
  const read = m.messages.filter((msg) => !msg.unread);
  const tab = state.mailTab;
  for (const b of document.querySelectorAll('#mailTabs [data-mailtab]')) {
    b.classList.toggle('active', b.dataset.mailtab === tab);
    b.querySelector('.n').textContent = (b.dataset.mailtab === 'unread' ? unread : read).length;
  }
  $('#mailTabs').hidden = !m.messages.length;
  const shown = tab === 'unread' ? unread : read;
  $('#mailList').innerHTML = shown.map((msg) => mailItem(msg, msg.jobs)).join('');
  $('#mailEmpty').hidden = !m.messages.length || shown.length > 0;
  $('#mailEmpty').textContent = tab === 'unread' ? 'No unread replies right now.' : 'No read emails yet.';
}

async function openMail() {
  $('#mailDrawer').hidden = false;
  await loadMail();
  state.mailTab = state.mail?.unread || !state.mail?.messages.length ? 'unread' : 'read';
  $('#mailSetup').open = !state.mail?.connected || !!state.mail?.error; // folded away once it works
  renderMailDrawer();
}

async function hideMail(msgId, jobId) {
  try {
    setMail(await api('/api/mail/hide', { method: 'POST', body: { id: msgId, jobId } }));
    toast('Got it: that email is no longer shown on that job.');
  } catch (err) {
    toast(err.message);
  }
}

function renderLastScrape(iso) {
  $('#refreshBtn').title = iso ? `Last refreshed ${new Date(iso).toLocaleString()}` : 'Never refreshed';
}

function wherePill(where) {
  const c = state.countryLabel;
  return {
    home: { text: state.homeLabel, cls: 'home', tip: `On-site or hybrid in your area` },
    remote: { text: 'Remote ✓', cls: 'remote', tip: `Remote, open to ${c} / Europe / worldwide` },
    'remote-unclear': { text: 'Remote ?', cls: '', tip: "Remote, but the posting doesn't say from where. Check before applying" },
    country: { text: c, cls: '', tip: `On-site elsewhere in ${c}` },
    'remote-elsewhere': { text: 'Remote · other region', cls: 'far', tip: 'Remote only for other regions (e.g. US-only)' },
    elsewhere: { text: 'Relocation', cls: 'far', tip: 'On-site in another country' },
  }[where];
}

const LEVEL_PILL = {
  entry: { text: 'Entry', cls: 'remote', tip: 'Junior / intern / trainee role' },
  senior: { text: 'Senior', cls: 'far', tip: 'Senior role' },
  lead: { text: 'Lead+', cls: 'far', tip: 'Lead / principal / director role' },
  thesis: { text: 'Thesis', cls: '', tip: "Thesis roles are usually for master's students" },
};

function pills(j) {
  const out = CAT_ORDER.filter((c) => j.cats.includes(c)).map((c) => {
    const words = j.matched?.[c]?.join(', ');
    return `<span class="pill ${c}" ${words ? `title="Matched: ${esc(words)}"` : ''}>${esc(catLabel(c))}</span>`;
  });
  const lvl = LEVEL_PILL[j.level];
  if (lvl) out.push(`<span class="pill ${lvl.cls}" title="${esc(lvl.tip)}">${lvl.text}</span>`);
  if (j.years != null) {
    const cls = j.years <= 2 ? 'remote' : j.years >= 5 ? 'far' : '';
    const text = j.years === 0 ? 'No experience needed' : `${j.years}+ yrs exp`;
    out.push(`<span class="pill ${cls}" title="Experience the posting asks for">${text}</span>`);
  }
  const w = wherePill(j.where);
  if (w) out.push(`<span class="pill ${w.cls}" title="${esc(w.tip)}">${esc(w.text)}</span>`);
  if (j.closed) out.push('<span class="pill closed" title="No longer listed on the company\'s job board">Closed</span>');
  return out.join('');
}

function statusSelect(j) {
  return `<select data-act="status" aria-label="Status">${TABS.map(
    (t) => `<option value="${t.key}" ${t.key === j.status ? 'selected' : ''}>${t.label}</option>`,
  ).join('')}</select>`;
}

function writeButton(j) {
  if (state.writing.has(j.id)) return '<button class="btn ghost" type="button" disabled>✍ Writing…</button>';
  const label = j.aiLetter ? '✍ Rewrite' : '✍ Write';
  return `<button class="btn ghost" data-act="write" type="button" title="Have Claude write a letter for this job (w)">${label}</button>`;
}

function pdfButton(j) {
  return `<a class="btn ghost" href="/api/jobs/${encodeURIComponent(j.id)}/letter.pdf" download title="Download the cover letter as a PDF">⬇ PDF</a>`;
}

function actions(j) {
  if (state.pending.has(j.id)) {
    return `<button class="btn good" data-act="confirm" type="button" title="Mark as applied (a)">✓ I applied</button>
      <button class="btn ghost" data-act="cancel" type="button">Not yet</button>
      ${writeButton(j)}
      <button class="btn ghost" data-act="copy" type="button" title="Copy cover letter (c)">Copy letter</button>
      ${pdfButton(j)}`;
  }
  const expand = `<button class="btn ghost icon" data-act="expand" type="button" title="Details & notes (e)" aria-expanded="${state.expanded.has(j.id)}">${state.expanded.has(j.id) ? '▴' : '▾'}</button>`;
  if (j.status === 'new' || j.status === 'saved') {
    const saved = j.status === 'saved';
    return `<button class="btn primary" data-act="apply" type="button" title="Open application (Enter)">Apply ↗</button>
      ${writeButton(j)}
      <button class="btn ghost" data-act="copy" type="button" title="Copy cover letter (c)">Copy letter</button>
      ${pdfButton(j)}
      <button class="btn ghost icon ${saved ? 'on' : ''}" data-act="save" type="button" title="${saved ? 'Unsave' : 'Save for later'} (s)">${saved ? '★' : '☆'}</button>
      <button class="btn ghost icon" data-act="hide" type="button" title="Not interested (x)">✕</button>${expand}`;
  }
  if (j.status === 'hidden') {
    return `<button class="btn ghost" data-act="restore" type="button">Restore</button>${expand}`;
  }
  return `${statusSelect(j)}<button class="btn ghost" data-act="open" type="button">Open ↗</button>${expand}`;
}

function details(j) {
  const full = state.details.get(j.id);
  const desc = full ? full.description || 'No description available — open the posting for details.' : 'Loading…';
  const matched = Object.entries(j.matched || {})
    .map(([c, words]) => `<b>${esc(c === 'skills' ? 'Your skills' : catLabel(c))}:</b> ${esc(words.join(', '))}`)
    .join(' · ');
  const breakdown =
    j.relevance != null
      ? [`${j.relevance} for your field`, ...(j.why || [])].map(esc).join(' · ') + ` = ${j.raw ?? j.score} points → <b>${j.score}/100</b>`
      : '';
  const facts = [
    j.department && `Team: ${esc(j.department)}`,
    j.firstSeen && `First seen ${shortDate(j.firstSeen)}`,
    j.appliedAt && `Applied ${shortDate(j.appliedAt)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="details">
    ${facts ? `<div class="matched">${facts}</div>` : ''}
    ${matched ? `<div class="matched">Why it matched — ${matched}</div>` : ''}
    ${breakdown ? `<div class="matched">Score — ${breakdown}</div>` : ''}
    ${state.mailByJob.has(j.id) ? `<div class="matched">Emails from ${esc(j.company)} since you applied</div><ul class="mail-list">${state.mailByJob.get(j.id).map((m) => mailItem(m, [j])).join('')}</ul>` : ''}
    <pre class="desc">${esc(desc)}</pre>
    ${j.aiLetter ? `<label>AI letter for this job (edit freely: Apply and ⚡ Fill use this version)<textarea data-act="ailetter" rows="12">${esc(j.aiLetter)}</textarea></label>` : ''}
    <label>Notes (contacts, salary, follow-up dates…)<textarea data-act="notes" rows="3">${esc(j.notes || '')}</textarea></label>
    ${j.status === 'new' || j.status === 'saved' ? `<label>Status ${statusSelect(j)}</label>` : ''}
  </div>`;
}

// Warcraft Logs parse colours for the match score.
const RARITIES = [
  { min: 100, key: 'gold', name: 'Perfect parse' },
  { min: 99, key: 'pink', name: 'Pink parse' },
  { min: 95, key: 'orange', name: 'Orange parse' },
  { min: 75, key: 'purple', name: 'Purple parse' },
  { min: 50, key: 'blue', name: 'Blue parse' },
  { min: 25, key: 'green', name: 'Green parse' },
  { min: -Infinity, key: 'gray', name: 'Gray parse' },
];
const rarityOf = (score) => RARITIES.find((r) => score >= r.min);

function card(j) {
  const cls = ['job', j.id === state.selected && 'selected', state.pending.has(j.id) && 'pending', j.closed && 'closed']
    .filter(Boolean)
    .join(' ');
  const rarity = rarityOf(j.score);
  const meta = [
    `<span class="company">${esc(j.company)}</span>`,
    j.location && `<span class="loc" title="${esc(j.location)}">${esc(j.location)}</span>`,
    postedOf(j) && `${j.postedAt ? 'posted' : 'found'} ${ago(postedOf(j))}`,
    j.salary && esc(j.salary),
    `via ${esc(j.source)}`,
  ].filter(Boolean);
  const tracked = TRACKED.includes(j.status) && j.appliedAt ? `<div class="tracked">Applied ${ago(j.appliedAt)}${mailBadge(j)}</div>` : '';
  return `<li class="${cls}" data-id="${esc(j.id)}">
    <div class="score r-${rarity.key}" title="${rarity.name}: ${j.score}/100 (100 = your dream job)">${j.score}</div>
    <div>
      <div class="head"><a class="title" href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a>${pills(j)}</div>
      <div class="meta">${meta.join(' · ')}</div>
      ${tracked}
      ${state.expanded.has(j.id) ? details(j) : ''}
    </div>
    <div class="actions">${actions(j)}</div>
  </li>`;
}

let currentList = [];
function renderList() {
  currentList = visibleJobs();
  const shown = currentList.slice(0, state.limit);
  if (state.selected && !shown.some((j) => j.id === state.selected)) state.selected = null;
  $('#list').innerHTML = shown.map(card).join('');

  const total = currentList.length;
  const tabLabel = TABS.find((t) => t.key === state.tab).label.toLowerCase();
  $('#summary').textContent = total
    ? `Showing ${shown.length} of ${total} ${tabLabel} job${total === 1 ? '' : 's'}`
    : '';
  $('#more').hidden = total <= shown.length;
  $('#more').textContent = `Show ${Math.min(PAGE, total - shown.length)} more`;

  const empty = $('#empty');
  empty.hidden = total > 0;
  if (!total) {
    const anyFilter = state.q || state.cats.length || state.where !== 'any' || state.level !== 'any' || state.age !== '0' || state.company;
    empty.innerHTML = !state.jobs.length
      ? polling
        ? '<b>Fetching jobs…</b><br>The first refresh takes about 20 seconds.'
        : '<b>No jobs yet.</b><br>Click <b>Refresh jobs</b> to fetch the latest postings.'
      : anyFilter
        ? 'No jobs match these filters. <button class="btn ghost" data-act="clear-filters" type="button">Clear filters</button>'
        : `Nothing in <b>${esc(tabLabel)}</b> yet.`;
  }
}

/** Re-render one card in place (keeps scroll position and doesn't disturb a notes box elsewhere). */
function renderCard(id) {
  const li = document.querySelector(`.job[data-id="${CSS.escape(id)}"]`);
  const j = state.byId.get(id);
  if (li && j) li.outerHTML = card(j);
}

function select(id, { scroll = true } = {}) {
  const prev = state.selected;
  state.selected = id;
  if (prev && prev !== id) document.querySelector(`.job[data-id="${CSS.escape(prev)}"]`)?.classList.remove('selected');
  const li = id && document.querySelector(`.job[data-id="${CSS.escape(id)}"]`);
  if (li) {
    li.classList.add('selected');
    if (scroll) li.scrollIntoView({ block: 'nearest' });
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────
let toastTimer;
function toast(message, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => {
    el.hidden = true;
    action.run();
  };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3000);
}

// ── Actions ───────────────────────────────────────────────────────────────
const STATUS_TOAST = {
  saved: 'Saved',
  applied: 'Marked as applied',
  interview: 'Moved to Interviewing',
  offer: 'Moved to Offer 🎉',
  rejected: 'Moved to Rejected',
  hidden: 'Hidden',
  new: 'Moved back to New',
};

async function setStatus(id, status, { undoable = true } = {}) {
  const j = state.byId.get(id);
  if (!j || j.status === status) return;
  const before = j.status;
  // Keep the cursor at the same position in the list once this job moves out of the tab.
  const idx = currentList.findIndex((x) => x.id === id);
  try {
    const updated = await api(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
    for (const k of Object.keys(j)) if (!(k in updated)) delete j[k]; // e.g. appliedAt cleared by an undo
    Object.assign(j, updated);
  } catch (err) {
    return toast(`Couldn't update: ${err.message}`);
  }
  state.pending.delete(id);
  if (undoable) state.lastUndo = { id, status: before };
  renderTabs();
  renderStats();
  renderList();
  if (!inTab(j, state.tab) && idx >= 0) {
    const next = currentList[Math.min(idx, currentList.length - 1)];
    if (next) select(next.id);
  } else {
    select(id, { scroll: false });
  }
  toast(`${STATUS_TOAST[status] || 'Updated'} — ${j.title}`, undoable ? { label: 'Undo (u)', run: undo } : null);
}

function undo() {
  const u = state.lastUndo;
  if (!u) return;
  state.lastUndo = null;
  setStatus(u.id, u.status, { undoable: false }).then(() => select(u.id));
}

/** Open a link in a new browser tab (a real link click, so browsers never turn it into a pop-up window). */
function openTab(url) {
  if (!url) return toast('This job has no link');
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.click();
}

/**
 * Apply: tell the server this is the job you're applying to (so the Fill button uses its letter
 * and CV), copy that letter, then open the application page. The copy happens before the new tab
 * opens, because the browser only allows clipboard writes while this page has focus.
 */
async function startApply(id) {
  const j = state.byId.get(id);
  if (!j) return;
  let kit = null;
  try {
    kit = await api(`/api/jobs/${encodeURIComponent(id)}/kit`, { method: 'POST', body: { current: true } });
  } catch {
    /* still open the job */
  }
  const copied = kit?.letter ? await writeClipboard(kit.letter) : false;
  openTab(j.applyUrl || j.url);
  state.pending.add(id);
  state.selected = id;
  renderCard(id);
  select(id, { scroll: false });
  if (kit) {
    const parts = [copied ? `${kit.letterName} copied` : 'Letter not copied (clipboard blocked)'];
    parts.push(kit.cvName ? `CV: ${kit.cvName}` : 'no CV chosen in Profile');
    toast(`${parts.join(' · ')}. On the form, click ⚡ Fill application.`);
  }
}

/** Ask Claude (via the server) for a letter written for this job, then show and copy it. */
async function writeAiLetter(id) {
  const j = state.byId.get(id);
  if (!j || state.writing.has(id)) return;
  state.writing.add(id);
  renderCard(id);
  toast(`Claude is writing a letter for ${j.company} (about 20–60 seconds)…`);
  try {
    const res = await api(`/api/jobs/${encodeURIComponent(id)}/ai-letter`, { method: 'POST', body: {} });
    j.aiLetter = res.aiLetter;
    j.aiLetterAt = res.aiLetterAt;
    state.expanded.add(id);
    const copied = await writeClipboard(res.aiLetter);
    toast(`Letter for ${j.company} is ready${copied ? ' and copied' : ''}. Read it through before sending.`);
  } catch (err) {
    toast(`Couldn't write the letter: ${err.message}`);
  } finally {
    state.writing.delete(id);
    renderCard(id);
    select(id, { scroll: false });
  }
}

const aiLetterTimers = new Map();
function saveAiLetter(id, text) {
  const j = state.byId.get(id);
  if (j) j.aiLetter = text;
  clearTimeout(aiLetterTimers.get(id));
  aiLetterTimers.set(
    id,
    setTimeout(() => {
      api(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { aiLetter: text } }).catch((e) =>
        toast(`Letter not saved: ${e.message}`),
      );
    }, 500),
  );
}

async function copyLetter(id) {
  const j = state.byId.get(id);
  if (!j) return;
  const kit = await api(`/api/jobs/${encodeURIComponent(id)}/kit`, { method: 'POST', body: {} });
  if (!kit.letter) return toast('Add a cover letter in Snippets first');
  await copyText(kit.letter, `${kit.letterName} copied for ${j.company}`);
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function copyText(text, message) {
  if (await writeClipboard(text)) toast(message);
  else toast('Clipboard blocked by the browser — select the text and copy manually');
}

async function toggleExpand(id) {
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  renderCard(id);
  select(id, { scroll: false });
  if (state.expanded.has(id) && !state.details.has(id)) {
    try {
      state.details.set(id, await api(`/api/jobs/${encodeURIComponent(id)}`));
    } catch {
      state.details.set(id, { description: 'Could not load the description.' });
    }
    if (state.expanded.has(id)) {
      renderCard(id);
      select(id, { scroll: false });
    }
  }
}

const noteTimers = new Map();
function saveNotes(id, notes) {
  const j = state.byId.get(id);
  if (j) j.notes = notes;
  clearTimeout(noteTimers.get(id));
  noteTimers.set(
    id,
    setTimeout(() => {
      api(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { notes } }).catch((e) =>
        toast(`Notes not saved: ${e.message}`),
      );
    }, 500),
  );
}

function runAction(act, id, el) {
  const j = state.byId.get(id);
  switch (act) {
    case 'apply':
      return startApply(id);
    case 'confirm':
      return setStatus(id, 'applied');
    case 'cancel':
      state.pending.delete(id);
      return renderCard(id), select(id, { scroll: false });
    case 'write':
      return writeAiLetter(id);
    case 'copy':
      return copyLetter(id);
    case 'save':
      return setStatus(id, j.status === 'saved' ? 'new' : 'saved');
    case 'hide':
      return setStatus(id, 'hidden');
    case 'restore':
      return setStatus(id, 'new');
    case 'open':
      return openTab(j.url || j.applyUrl);
    case 'expand':
      return toggleExpand(id);
    case 'status':
      return setStatus(id, el.value);
    case 'mail':
      return state.expanded.has(id) ? select(id, { scroll: false }) : toggleExpand(id);
    case 'mail-hide':
      return hideMail(el.dataset.msg, el.dataset.job);
  }
}

// ── Events: list ──────────────────────────────────────────────────────────
$('#list').addEventListener('click', (e) => {
  const li = e.target.closest('.job');
  if (!li) return;
  const actEl = e.target.closest('[data-act]');
  if (actEl && actEl.tagName === 'BUTTON') runAction(actEl.dataset.act, li.dataset.id, actEl);
  else select(li.dataset.id, { scroll: false });
});
$('#list').addEventListener('change', (e) => {
  const li = e.target.closest('.job');
  if (li && e.target.dataset.act === 'status') runAction('status', li.dataset.id, e.target);
});
$('#list').addEventListener('input', (e) => {
  const li = e.target.closest('.job');
  if (li && e.target.dataset.act === 'notes') saveNotes(li.dataset.id, e.target.value);
  if (li && e.target.dataset.act === 'ailetter') saveAiLetter(li.dataset.id, e.target.value);
});
$('#empty').addEventListener('click', (e) => {
  if (e.target.dataset.act !== 'clear-filters') return;
  Object.assign(state, { q: '', cats: [], where: 'any', level: 'any', age: '0', company: '' }); // show everything
  syncFilterInputs();
  persist();
  renderAll();
});
$('#more').addEventListener('click', () => {
  state.limit += PAGE;
  renderList();
});

// ── Events: filters ───────────────────────────────────────────────────────
function syncFilterInputs() {
  $('#search').value = state.q;
  $('#where').value = state.where;
  $('#level').value = state.level;
  $('#age').value = state.age;
  $('#sort').value = state.sort;
}

function onFilterChange() {
  state.limit = PAGE;
  persist();
  renderList();
}

$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (!tab) return;
  state.tab = tab;
  state.company = '';
  renderTabs();
  renderCompanies();
  onFilterChange();
  window.scrollTo({ top: 0 });
});
$('#chips').addEventListener('click', (e) => {
  const cat = e.target.closest('[data-cat]')?.dataset.cat;
  if (!cat) return;
  state.cats = state.cats.includes(cat) ? state.cats.filter((c) => c !== cat) : [...state.cats, cat];
  renderChips();
  onFilterChange();
});
let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value;
    onFilterChange();
  }, 120);
});
$('#where').addEventListener('change', (e) => {
  state.where = e.target.value;
  renderTabs();
  onFilterChange();
});
$('#level').addEventListener('change', (e) => ((state.level = e.target.value), onFilterChange()));
$('#age').addEventListener('change', (e) => ((state.age = e.target.value), onFilterChange()));
$('#sort').addEventListener('change', (e) => ((state.sort = e.target.value), onFilterChange()));
$('#company').addEventListener('change', (e) => ((state.company = e.target.value), onFilterChange()));

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if (e.key === 'Escape') {
    if (!$('#drawer').hidden) return closeDrawer();
    if (!$('#profileDrawer').hidden) return closeProfile();
    if (typing) return e.target.blur();
    return;
  }
  if (typing || !$('#drawer').hidden || !$('#profileDrawer').hidden || $('#addDialog').open) return;

  const idx = currentList.findIndex((j) => j.id === state.selected);
  const move = (delta) => {
    const next = currentList[Math.max(0, Math.min(currentList.length - 1, idx + delta))];
    if (!next) return;
    if (currentList.indexOf(next) >= state.limit) {
      state.limit += PAGE;
      renderList();
    }
    select(next.id);
  };
  const id = state.selected;
  const j = id && state.byId.get(id);
  const keyActs = {
    j: () => move(idx < 0 ? 0 : 1),
    ArrowDown: () => move(idx < 0 ? 0 : 1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    '/': () => $('#search').focus(),
    u: undo,
  };
  const jobActs = {
    Enter: () => (j.status === 'new' || j.status === 'saved' ? startApply(id) : runAction('open', id)),
    o: () => runAction('open', id),
    a: () => setStatus(id, 'applied'),
    c: () => copyLetter(id),
    s: () => runAction('save', id),
    x: () => setStatus(id, 'hidden'),
    e: () => toggleExpand(id),
    w: () => j.status === 'new' || j.status === 'saved' ? writeAiLetter(id) : null,
  };
  const fn = keyActs[e.key] || (j && jobActs[e.key]);
  if (!fn) return;
  e.preventDefault();
  fn();
});

// ── Refresh / scraping progress ───────────────────────────────────────────
let polling = false;
async function pollStatus() {
  if (polling) return;
  polling = true;
  if (!state.jobs.length) renderList();
  const btn = $('#refreshBtn');
  const bar = $('#progress');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  bar.hidden = false;
  try {
    for (;;) {
      const s = await api('/api/status');
      const pct = s.total ? Math.round((s.done / s.total) * 100) : 5;
      bar.querySelector('.bar span').style.width = `${pct}%`;
      bar.querySelector('.label').textContent = s.running
        ? `Checking ${s.done}/${s.total || '…'} sources${s.current ? ` — ${s.current}` : ''}`
        : 'Done';
      if (!s.running) {
        await loadJobs();
        if (s.error) toast(`Refresh failed: ${s.error}`);
        else if (s.lastSummary) {
          const f = s.lastSummary.failed.length;
          toast(
            `${s.lastSummary.added} new matching job${s.lastSummary.added === 1 ? '' : 's'}` +
              (f ? ` · ${f} source${f === 1 ? '' : 's'} failed (${s.lastSummary.failed.map((x) => x.source).join(', ')})` : ''),
          );
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (err) {
    toast(`Lost contact with the server: ${err.message}`);
  } finally {
    polling = false;
    btn.disabled = false;
    btn.textContent = 'Refresh jobs';
    bar.hidden = true;
  }
}

$('#refreshBtn').addEventListener('click', async () => {
  await api('/api/scrape', { method: 'POST' });
  pollStatus();
});

// ── Snippets drawer ───────────────────────────────────────────────────────
function renderSnippets() {
  $('#snippetList').innerHTML = state.snippets
    .map(
      (s, i) => `<div class="snippet" data-i="${i}">
        <div class="snippet-head">
          <input type="text" data-field="name" value="${esc(s.name)}" aria-label="Snippet name" />
          <label class="check" title="Copied by the c key / Copy letter button"><input type="radio" name="defaultSnippet" data-field="default" ${s.default ? 'checked' : ''} /> default</label>
        </div>
        <textarea data-field="text" aria-label="Snippet text">${esc(s.text)}</textarea>
        <div class="snippet-foot">
          <button class="btn ghost" data-snip="delete" type="button">Delete</button>
          <button class="btn primary" data-snip="copy" type="button">Copy${state.selected ? ' for selected job' : ''}</button>
        </div>
      </div>`,
    )
    .join('');
}

let snippetTimer;
function saveSnippets() {
  clearTimeout(snippetTimer);
  snippetTimer = setTimeout(() => {
    api('/api/snippets', { method: 'PUT', body: state.snippets }).catch((e) => toast(`Snippets not saved: ${e.message}`));
  }, 400);
}

async function openDrawer() {
  state.snippets = await api('/api/snippets');
  renderSnippets();
  $('#drawer').hidden = false;
}
function closeDrawer() {
  $('#drawer').hidden = true;
}

$('#snippetsBtn').addEventListener('click', openDrawer);
$('#closeDrawer').addEventListener('click', closeDrawer);
$('#addSnippet').addEventListener('click', () => {
  state.snippets.push({ id: `s-${Date.now().toString(36)}`, name: 'New snippet', text: '', default: !state.snippets.length });
  renderSnippets();
  saveSnippets();
  $('#snippetList .snippet:last-child textarea').focus();
});
$('#snippetList').addEventListener('input', (e) => {
  const box = e.target.closest('.snippet');
  const field = e.target.dataset.field;
  if (!box || !field) return;
  const i = Number(box.dataset.i);
  if (field === 'default') state.snippets.forEach((s, k) => (s.default = k === i));
  else state.snippets[i][field] = e.target.value;
  saveSnippets();
});
$('#snippetList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-snip]');
  if (!btn) return;
  const i = Number(btn.closest('.snippet').dataset.i);
  const s = state.snippets[i];
  if (btn.dataset.snip === 'copy') {
    const j = state.selected && state.byId.get(state.selected);
    return copyText(fill(s.text, j), j ? `${s.name} copied for ${j.company}` : `${s.name} copied`);
  }
  if (btn.dataset.snip === 'delete' && confirm(`Delete "${s.name}"?`)) {
    state.snippets.splice(i, 1);
    if (s.default && state.snippets[0]) state.snippets[0].default = true;
    renderSnippets();
    saveSnippets();
  }
});

// ── Profile & the "Fill application" bookmarklet ──────────────────────────
let autofillSource = null;

/** Build the bookmarklet: the filler from /autofill.js, called with your profile and key. */
async function updateBookmarklet(profile, key) {
  if (autofillSource == null) {
    const src = await (await fetch('/autofill.js')).text();
    autofillSource = src.trim().replace(/;\s*$/, '');
  }
  const cfg = { server: location.origin, key, profile };
  // void(): a javascript: link that returns a value would replace the job page with that value.
  $('#bookmarklet').href = `javascript:${encodeURIComponent(`void((${autofillSource})(${JSON.stringify(cfg)}))`)}`;
}

function fillProfileForm({ profile, key, cvFiles }) {
  const form = $('#profileForm');
  const opts = (items, selected, empty) =>
    `<option value="">${esc(empty)}</option>` +
    items.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const cvs = cvFiles.map((f) => [f, f]);
  form.cvMusic.innerHTML = opts(cvs, profile.cvMusic, cvFiles.length ? '— choose —' : 'No CVs in the cv folder yet');
  form.cvTech.innerHTML = opts(cvs, profile.cvTech, cvFiles.length ? '— same as music —' : 'No CVs in the cv folder yet');
  const letters = state.snippets.map((s) => [s.id, s.name]);
  form.letterMusic.innerHTML = opts(letters, profile.letterMusic, '— default snippet —');
  form.letterTech.innerHTML = opts(letters, profile.letterTech, '— default snippet —');
  for (const el of form.elements) if (el.name && el.tagName === 'INPUT') el.value = profile[el.name] ?? '';
  $('#cvHint').textContent = cvFiles.length
    ? `Found in Desktop → Job Hunter → cv: ${cvFiles.join(', ')}.`
    : 'Put your CV PDFs in Desktop → Job Hunter → cv (e.g. "CV - music.pdf" and "CV - tech.pdf"), then reopen this panel.';
  return updateBookmarklet(profile, key);
}

async function openProfile() {
  state.snippets = await api('/api/snippets');
  await fillProfileForm(await api('/api/profile'));
  $('#profileDrawer').hidden = false;
}
function closeProfile() {
  $('#profileDrawer').hidden = true;
}

let profileTimer;
function saveProfile() {
  clearTimeout(profileTimer);
  profileTimer = setTimeout(async () => {
    const body = Object.fromEntries(new FormData($('#profileForm')));
    try {
      const saved = await api('/api/profile', { method: 'PUT', body });
      state.profile = saved.profile;
      await updateBookmarklet(saved.profile, saved.key);
    } catch (err) {
      toast(`Profile not saved: ${err.message}`);
    }
  }, 400);
}

$('#profileBtn').addEventListener('click', openProfile);
$('#closeProfile').addEventListener('click', closeProfile);
$('#profileForm').addEventListener('input', saveProfile);
$('#profileForm').addEventListener('change', saveProfile);
$('#profileForm').addEventListener('submit', (e) => e.preventDefault());
$('#bookmarklet').addEventListener('click', (e) => {
  e.preventDefault();
  toast('Drag this button to your bookmarks bar, then click it on a job application form.');
});

// ── Mail drawer ───────────────────────────────────────────────────────────
$('#mailBtn').addEventListener('click', openMail);
$('#closeMail').addEventListener('click', () => ($('#mailDrawer').hidden = true));
$('#mailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { user: form.user.value, password: form.password.value };
  state.mail = { ...(state.mail || { messages: [] }), checking: true, error: null };
  renderMailDrawer();
  try {
    setMail(await api('/api/mail', { method: 'PUT', body }));
    form.password.value = '';
    const n = state.mail.messages.length;
    toast(state.mail.error || `Gmail connected: ${n} email${n === 1 ? '' : 's'} from companies you applied to.`);
  } catch (err) {
    toast(err.message);
    loadMail();
  }
});
$('#mailDisconnect').addEventListener('click', async () => {
  if (!confirm("Disconnect Gmail? The saved app password is deleted from Job Hunter (also withdraw it on Google's App passwords page).")) return;
  setMail(await api('/api/mail', { method: 'PUT', body: { disconnect: true } }));
  toast('Gmail disconnected.');
});
$('#mailCheck').addEventListener('click', async () => {
  state.mail.checking = true;
  renderMailDrawer();
  try {
    setMail(await api('/api/mail/check', { method: 'POST' }));
  } catch (err) {
    toast(err.message);
    loadMail();
  }
});
$('#mailList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act="mail-hide"]');
  if (btn) hideMail(btn.dataset.msg, btn.dataset.job);
});
$('#mailTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mailtab]');
  if (!b) return;
  state.mailTab = b.dataset.mailtab;
  renderMailDrawer();
});
// Expanding an email (in the Mail panel or a job's details) loads its full text.
document.addEventListener(
  'toggle',
  (e) => {
    const el = e.target;
    if (!el.matches?.('details.mail-item')) return;
    if (el.open) {
      state.mailOpen.add(el.dataset.msg);
      loadMailBody(el.dataset.msg);
    } else state.mailOpen.delete(el.dataset.msg);
  },
  true,
);
// Opening an email in Gmail marks it read there; check again shortly so it moves to "Read".
let gmailRecheck;
document.addEventListener('click', (e) => {
  if (!e.target.closest('a.gmail')) return;
  clearTimeout(gmailRecheck);
  gmailRecheck = setTimeout(() => api('/api/mail/check', { method: 'POST' }).then(setMail, () => {}), 30_000);
});

// ── Add job dialog ────────────────────────────────────────────────────────
const dialog = $('#addDialog');
$('#addBtn').addEventListener('click', () => {
  $('#addForm').reset();
  dialog.showModal();
});
$('#cancelAdd').addEventListener('click', () => dialog.close());
$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    const job = await api('/api/jobs', { method: 'POST', body });
    state.jobs.push(job);
    state.byId.set(job.id, job);
    dialog.close();
    Object.assign(state, { tab: job.status, q: '', cats: [], where: 'any', level: 'any', age: '0', company: '' });
    syncFilterInputs();
    persist();
    renderAll();
    select(job.id);
    toast(`Added — ${job.title}`);
  } catch (err) {
    toast(err.message);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────
syncFilterInputs();
await loadJobs();
api('/api/snippets').then((s) => (state.snippets = s));
api('/api/profile').then((r) => (state.profile = r.profile));
const status = await api('/api/status');
if (status.running) pollStatus();
loadMail();
setInterval(loadMail, 60_000); // the server checks Gmail every 10 minutes; this picks up the result
