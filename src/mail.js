// Reads your Gmail inbox over IMAP with an app password and matches emails to the jobs you've
// applied to. Read-only: the inbox is opened with EXAMINE and headers are fetched with BODY.PEEK,
// so nothing is ever marked as read, moved, sent or deleted. No packages: just node:tls.

import tls from 'node:tls';

const HOST = 'imap.gmail.com';
const TIMEOUT = 30_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── A minimal IMAP client: one command at a time, literals ({123}) read as raw bytes ──────────
export class Imap {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.parts = []; // the response being read: text lines and literals
    this.tagN = 0;
    this.pending = null;
    this.greeting = new Promise((resolve, reject) => (this.onGreeting = { resolve, reject }));
    socket.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      this.pump();
    });
    socket.on('error', (err) => this.fail(err));
    socket.on('close', () => this.fail(new Error('Gmail closed the connection')));
    socket.setTimeout(TIMEOUT, () => {
      this.fail(new Error('Gmail did not answer in time'));
      socket.destroy();
    });
  }

  pump() {
    for (;;) {
      const eol = this.buf.indexOf('\r\n');
      if (eol < 0) return;
      const line = this.buf.subarray(0, eol).toString('utf8');
      const lit = line.match(/\{(\d+)\}$/);
      if (lit) {
        const n = Number(lit[1]);
        if (this.buf.length < eol + 2 + n) return; // wait for the whole literal
        this.parts.push(line.slice(0, -lit[0].length), this.buf.subarray(eol + 2, eol + 2 + n));
        this.buf = this.buf.subarray(eol + 2 + n);
        continue; // the response goes on after the literal
      }
      this.parts.push(line);
      this.buf = this.buf.subarray(eol + 2);
      const parts = this.parts;
      this.parts = [];
      this.handle(parts);
    }
  }

  handle(parts) {
    const text = parts.filter((p) => typeof p === 'string').join('');
    const literals = parts.filter((p) => typeof p !== 'string');
    if (this.onGreeting) {
      const greet = this.onGreeting;
      this.onGreeting = null;
      return /^\* (OK|PREAUTH)/i.test(text) ? greet.resolve() : greet.reject(new Error(`Gmail refused: ${text}`));
    }
    const p = this.pending;
    if (!p) return;
    if (text.startsWith(`${p.tag} `)) {
      this.pending = null;
      const [, status, rest] = text.match(/^\S+ (\w+) ?(.*)$/) || [];
      if (status?.toUpperCase() === 'OK') p.resolve(p.untagged);
      else p.reject(Object.assign(new Error(rest || text), { imapStatus: status }));
    } else if (text.startsWith('*')) {
      p.untagged.push({ text, literals });
    }
  }

  fail(err) {
    if (this.onGreeting) this.onGreeting.reject(err), (this.onGreeting = null);
    if (this.pending) this.pending.reject(err), (this.pending = null);
  }

  /** Sends a command; resolves with its untagged responses, rejects unless it ends in OK. */
  run(command) {
    if (this.pending) return Promise.reject(new Error('IMAP command already running'));
    const tag = `A${++this.tagN}`;
    return new Promise((resolve, reject) => {
      this.pending = { tag, untagged: [], resolve, reject };
      this.socket.write(`${tag} ${command}\r\n`);
    });
  }
}

const quote = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;
const imapDate = (d) => `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

// ── Header decoding ("=?UTF-8?B?...?=" words, folded lines, "Name <addr>") ─────────────────────
export function decodeWords(s) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(?:\s+(?==\?))?/g, (m, charset, enc, data) => {
    const bytes =
      enc.toUpperCase() === 'B'
        ? Buffer.from(data, 'base64')
        : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
    try {
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return bytes.toString('utf8');
    }
  });
}

export function parseHeaders(raw) {
  const out = {};
  for (const line of raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = decodeWords(line.slice(i + 1).trim());
  }
  return out;
}

export function parseFrom(from = '') {
  const m = from.match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() };
  return { name: '', address: from.trim().toLowerCase() };
}

/**
 * Fetches the headers of inbox messages received since `since` (newest `max`).
 * Resolves to [{ id, uid, from, fromName, subject, date, unread, link }].
 */
export async function fetchInbox({ user, password, since, max = 2000 }) {
  const socket = tls.connect({ host: HOST, port: 993, servername: HOST });
  const imap = new Imap(socket);
  try {
    await imap.greeting;
    try {
      await imap.run(`LOGIN ${quote(user)} ${quote(password)}`);
    } catch (err) {
      throw new Error(
        /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(err.message)
          ? 'Gmail did not accept the address or app password. Check both, or create a new app password.'
          : `Gmail sign-in failed: ${err.message}`,
      );
    }
    await imap.run('EXAMINE INBOX'); // read-only
    const found = await imap.run(`UID SEARCH SINCE ${imapDate(since)}`);
    const uids = found
      .filter((r) => /^\* SEARCH/i.test(r.text))
      .flatMap((r) => r.text.replace(/^\* SEARCH/i, '').trim().split(/\s+/).filter(Boolean))
      .map(Number)
      .sort((a, b) => a - b)
      .slice(-max);
    if (!uids.length) return [];
    const fetched = await imap.run(`UID FETCH ${uids.join(',')} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)])`);
    const messages = [];
    for (const r of fetched) {
      if (!/^\* \d+ FETCH/i.test(r.text)) continue;
      const uid = Number(r.text.match(/\bUID (\d+)/i)?.[1]);
      const flags = r.text.match(/\bFLAGS \(([^)]*)\)/i)?.[1] || '';
      const when = r.text.match(/\bINTERNALDATE "([^"]+)"/i)?.[1] || '';
      const h = parseHeaders(r.literals[0]?.toString('utf8') || '');
      const from = parseFrom(h.from);
      const msgId = (h['message-id'] || '').replace(/^<|>$/g, '');
      messages.push({
        id: msgId || `uid-${uid}`,
        uid,
        from: from.address,
        fromName: from.name,
        subject: h.subject || '(no subject)',
        date: new Date(Date.parse(when.replace(/^(\d+)-(\w+)-(\d+)/, '$1 $2 $3')) || Date.now()).toISOString(),
        unread: !/\\Seen/i.test(flags),
        link: msgId
          ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(user)}#search/${encodeURIComponent(`rfc822msgid:${msgId}`)}`
          : `https://mail.google.com/mail/?authuser=${encodeURIComponent(user)}#inbox`,
      });
    }
    await imap.run('LOGOUT').catch(() => {});
    return messages;
  } finally {
    socket.destroy();
  }
}

// ── Which job is an email about? ───────────────────────────────────────────────────────────────
// Company-form suffixes, always dropped ("Tendium AB" → "tendium").
const LEGAL = new Set(['ab', 'publ', 'ltd', 'limited', 'inc', 'llc', 'gmbh', 'as', 'oy', 'corp', 'corporation', 'co', 'the', 'plc', 'bv', 'sa', 'srl', 'aps']);
// Dropped when something more distinctive is left ("Viaplay Group Sweden" → "viaplay"),
// but not when only a generic word would remain ("Nordic Recruiters" stays whole).
const WEAK = new Set(['group', 'sweden', 'sverige', 'nordic', 'nordics', 'holding', 'international', 'stockholm']);
const GENERIC = new Set([
  'recruiters', 'recruitment', 'rekrytering', 'bemanning', 'consulting', 'agency', 'studios', 'studio', 'interactive',
  'games', 'media', 'music', 'solutions', 'technologies', 'tech', 'systems', 'services', 'digital', 'labs',
]);
// Words in a subject that show it's about an application (for names that are also ordinary words).
const RECRUITING_SENDER = /\b(?:recruit\w*|talent|careers?|hiring|jobs?|people|hr|rekrytering\w*)\b/;
const MARKETING_SENDER = /^(?:news\w*|marketing|updates?|digest|promo\w*|offers?|deals?|hello|community|events?|product|billing|notifications?|info)\b/i;
const APPLICATION_WORDS =
  /\b(?:appl(?:y|ied|ying|ication)s?|candidate|candidacy|interview|position|role|opening|recruit\w*|hiring|assessment|next steps|ansokan|ansokt|sokt|kandidat\w*|intervju\w*|tjanst\w*|rekrytering\w*)\b/;
// Senders shared by many companies: job boards, ATS systems and mail providers.
const SHARED_DOMAINS =
  /(?:^|\.)(?:greenhouse(?:-mail)?\.io|lever\.co|hire\.lever\.co|ashbyhq\.com|smartrecruiters\.com|workable(?:mail)?\.com|teamtailor(?:-mail)?\.com|recruitee\.com|jobvite\.com|myworkday\.com|workday\.com|icims\.com|phenompeople\.com|avature\.net|personio\.(?:de|com)|bamboohr\.com|breezy\.hr|jobylon\.com|varbi\.com|reachmee\.com|himalayas\.app|remoteok\.com|remotive\.com|arbeitnow\.com|arbetsformedlingen\.se|linkedin\.com|indeed\.com|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|google\.com)$/i;

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Name keys for a company: "EA / DICE" → ['ea', 'dice']; "Epidemic Sound AB" → ['epidemic sound']. */
export function companyKeys(company) {
  return String(company || '')
    .split(/[/|,(]|\s+-\s+|\bvia\b|\btill\b/i)
    .map((part) => {
      const words = norm(part).split(' ').filter((w) => w && !LEGAL.has(w));
      const strong = words.filter((w) => !WEAK.has(w));
      return (strong.some((w) => !GENERIC.has(w)) ? strong : words).join(' ');
    })
    .filter(Boolean);
}

function domainOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (SHARED_DOMAINS.test(host)) return '';
    return host.split('.').slice(-2).join('.');
  } catch {
    return '';
  }
}

/** Does this email come from (or mention in its sender/subject) the job's company? */
export function emailMatchesJob(msg, job) {
  const senderDomain = msg.from.split('@')[1] || '';
  const labels = senderDomain.split('.').map((l) => l.replace(/-/g, ''));
  const jobDomain = domainOf(job.url) || domainOf(job.applyUrl);
  const marketing = MARKETING_SENDER.test(msg.from.split('@')[0] || '');
  const name = ` ${norm(msg.fromName)} `;
  const subject = ` ${norm(msg.subject)} `;
  const aboutApplication = APPLICATION_WORDS.test(subject) || RECRUITING_SENDER.test(name);
  // The company's own domain (e.g. a recruiter writing from @epidemicsound.com), except newsletters.
  const ownDomain = !SHARED_DOMAINS.test(senderDomain) && (!marketing || aboutApplication);
  if (ownDomain && jobDomain && (senderDomain === jobDomain || senderDomain.endsWith(`.${jobDomain}`))) return true;
  for (const key of companyKeys(job.company)) {
    const compacts = [key.replace(/ /g, ''), key.split(' ').filter((w) => !GENERIC.has(w)).join('')];
    if (ownDomain && compacts.some((c) => c.length >= 2 && labels.slice(0, -1).includes(c))) return true;
    // Its name in the sender or subject of an application email ("Spotify Recruiting",
    // "Your application to Embark Studios"); plain newsletters from the company don't count.
    if (key.length >= 3 && aboutApplication && (name.includes(` ${key} `) || subject.includes(` ${key} `))) return true;
  }
  return false;
}

/**
 * Attaches each email to the tracked jobs it's about, from the day before you applied onwards.
 * `hidden` holds "messageId|jobId" pairs you've said are wrong.
 */
export function matchEmails(messages, jobs, hidden = []) {
  const skip = new Set(hidden);
  const out = [];
  for (const msg of messages) {
    const jobIds = jobs
      .filter((j) => Date.parse(msg.date) >= Date.parse(j.appliedAt) - 864e5)
      .filter((j) => !skip.has(`${msg.id}|${j.id}`) && emailMatchesJob(msg, j))
      .map((j) => j.id);
    if (jobIds.length) out.push({ ...msg, jobIds });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
