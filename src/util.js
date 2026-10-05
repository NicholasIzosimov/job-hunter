const USER_AGENT = 'Mozilla/5.0 (compatible; JobHunter/0.1; personal job tracker)';
// Some big-company career sites only answer requests that look like a normal browser.
export const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a URL as JSON, with a timeout and a couple of retries on rate limits / server errors.
 * Pass `body` (an object) to POST it as JSON, and `headers` to add or override headers.
 */
export function fetchJson(url, opts) {
  return fetchWithRetry(url, 'json', opts);
}

/** Same as fetchJson but returns the body as text (for RSS/XML feeds). */
export function fetchText(url, opts) {
  return fetchWithRetry(url, 'text', opts);
}

async function fetchWithRetry(url, as, { retries = 2, timeoutMs = 25000, headers = {}, body } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: as === 'json' ? 'application/json' : '*/*',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return as === 'json' ? await res.json() : await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) throw new HttpError(res.status, url);
      // Rate limited: wait as long as the server asks (capped), else back off.
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : 2000 * (attempt + 1));
      continue;
    } catch (err) {
      if (err instanceof HttpError || attempt >= retries) throw err;
    }
    await sleep(2000 * (attempt + 1));
  }
}

/** Run `fn` over `items` with at most `limit` in flight. Results keep input order. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', eacute: 'é', egrave: 'è',
  auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Fix text that was UTF-8 but got decoded as Latin-1 somewhere upstream ("donât" → "don’t"). */
export function fixMojibake(s) {
  if (!/[ÂÃâ][\u0080-¿]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const fixed = Buffer.from(s, 'latin1').toString('utf8');
  return fixed.includes('�') ? s : fixed;
}

/** Turn an HTML job description into readable plain text (keeps paragraphs and bullets). */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  // Greenhouse double-encodes its HTML (&lt;p&gt;…), so decode once before stripping tags.
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decodeEntities(s));
}

export function tidy(s) {
  return String(s ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Minimal RSS reader: one object per <item>, with `get(tag)` for the first match of a tag
 * and `all(tag)` for every match (both CDATA-unwrapped and entity-decoded).
 * Good enough for the flat feeds job boards publish; not a general XML parser.
 */
export function rssItems(xml) {
  const read = (raw) => decodeEntities(raw.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim();
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const all = (tag) =>
      [...body.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => read(m[1]));
    return { all, get: (tag) => all(tag)[0] ?? '' };
  });
}

/** Accepts ISO strings, Date-parsable strings, epoch seconds or epoch ms. */
export function toIso(value) {
  if (value == null || value === '') return null;
  let d;
  if (typeof value === 'number') d = new Date(value < 1e12 ? value * 1000 : value);
  else d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
