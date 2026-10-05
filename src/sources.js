// Adapters for each job source. Every adapter returns jobs in one normalized shape:
// { id, source, kind, company, companyTags, title, location, remote, url, applyUrl,
//   postedAt, department, salary, description }

import { fetchJson, fetchText, rssItems, pool, htmlToText, tidy, toIso, fixMojibake, BROWSER_HEADERS } from './util.js';

const REMOTE_RE = /\b(remote|anywhere|worldwide|work from home|wfh)\b/i;

function makeJob({ source, kind, slug, company, companyTags = [], raw }) {
  const description = raw.text != null ? tidy(raw.text) : htmlToText(raw.html);
  const location = tidy(raw.location).replace(/(,\s*)+/g, ', ').replace(/^, |, $/g, '');
  return {
    id: [source, slug, raw.id].filter((p) => p != null && p !== '').join(':'),
    source,
    kind,
    company: tidy(company) || 'Unknown',
    companyTags,
    title: tidy(raw.title),
    location: location || (raw.remote ? 'Remote' : ''),
    remote: Boolean(raw.remote) || REMOTE_RE.test(location),
    url: raw.url || raw.applyUrl || '',
    applyUrl: raw.applyUrl || raw.url || '',
    postedAt: toIso(raw.postedAt),
    department: tidy(raw.department),
    salary: tidy(raw.salary),
    description,
  };
}

function range(min, max, currency = '', suffix = '') {
  const fmt = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (!min && !max) return '';
  const span = min && max && min !== max ? `${fmt(min)}–${fmt(max)}` : fmt(min || max);
  return [currency, span, suffix].filter(Boolean).join(' ');
}

// ── Company applicant-tracking systems ──────────────────────────────────────

async function greenhouse(c) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`);
  return data.jobs.map((j) =>
    makeJob({
      source: 'greenhouse', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: {
        id: j.id,
        title: j.title,
        location: j.location?.name,
        url: j.absolute_url,
        postedAt: j.first_published || j.updated_at,
        department: j.departments?.[0]?.name,
        html: j.content,
      },
    }),
  );
}

async function lever(c) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
  return data.map((j) => {
    const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`);
    const sr = j.salaryRange;
    return makeJob({
      source: 'lever', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: {
        id: j.id,
        title: j.text,
        location: j.categories?.allLocations?.join('; ') || j.categories?.location,
        remote: j.workplaceType === 'remote',
        url: j.hostedUrl,
        applyUrl: j.applyUrl,
        postedAt: j.createdAt,
        department: j.categories?.team || j.categories?.department,
        salary: sr ? range(sr.min, sr.max, sr.currency, sr.interval?.replace('per-', '/ ')) : '',
        text: [j.descriptionPlain, ...lists, j.additionalPlain].filter(Boolean).join('\n\n'),
      },
    });
  });
}

async function ashby(c) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`);
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) =>
      makeJob({
        source: 'ashby', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
        raw: {
          id: j.id,
          title: j.title,
          location: [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join('; '),
          remote: j.isRemote || j.workplaceType === 'Remote',
          url: j.jobUrl,
          applyUrl: j.applyUrl,
          postedAt: j.publishedAt,
          department: j.department || j.team,
          salary: j.compensation?.compensationTierSummary,
          text: j.descriptionPlain,
        },
      }),
    );
}

async function smartrecruiters(c) {
  const all = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const data = await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100&offset=${offset}`,
    );
    all.push(...data.content);
    if (all.length >= data.totalFound || data.content.length === 0) break;
  }
  // The list endpoint has no descriptions, so score on title + department/function.
  return all.map((j) =>
    makeJob({
      source: 'smartrecruiters', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: {
        id: j.id,
        title: j.name,
        location: j.location?.fullLocation || [j.location?.city, j.location?.country?.toUpperCase()].join(', '),
        remote: j.location?.remote,
        url: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
        postedAt: j.releasedDate,
        department: j.department?.label || j.function?.label,
        text: [j.department?.label, j.function?.label, j.industry?.label, j.typeOfEmployment?.label]
          .filter(Boolean)
          .join(' · '),
      },
    }),
  );
}

async function workable(c) {
  const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${c.slug}?details=true`);
  return data.jobs.map((j) =>
    makeJob({
      source: 'workable', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: {
        id: j.shortcode,
        title: j.title,
        location:
          (j.locations || []).map((l) => [l.city, l.country].filter(Boolean).join(', ')).join('; ') ||
          [j.city, j.country].filter(Boolean).join(', '),
        remote: j.telecommuting,
        url: j.url,
        applyUrl: j.application_url,
        postedAt: j.published_on || j.created_at,
        department: j.department,
        html: j.description,
      },
    }),
  );
}

// Teamtailor (very common in Sweden) has no JSON API, but every career site publishes /jobs.rss.
async function teamtailor(c) {
  const base = (c.url || `https://${c.slug}.teamtailor.com`).replace(/\/+$/, '');
  const xml = await fetchText(`${base}/jobs.rss`);
  return rssItems(xml).map((it) => {
    const locations = it.all('tt:location').map((loc) => {
      const field = (tag) => loc.match(new RegExp(`<tt:${tag}>([^<]*)</tt:${tag}>`))?.[1]?.trim() || '';
      return [field('city') || field('name'), field('country')].filter(Boolean).join(', ');
    });
    return makeJob({
      source: 'teamtailor', kind: 'ats', slug: c.slug, company: it.get('company_name') || c.name, companyTags: c.tags,
      raw: {
        id: it.get('guid'),
        title: it.get('title'),
        location: locations.join('; '),
        remote: it.get('remoteStatus') === 'fully',
        url: it.get('link'),
        postedAt: it.get('pubDate'),
        department: it.get('tt:department'),
        html: it.get('description'),
      },
    });
  });
}

// Phenom career sites (e.g. careers.king.com) load their job list from a /widgets endpoint.
async function phenom(c) {
  const base = c.url.replace(/\/+$/, '');
  const all = [];
  for (let from = 0; from < 1000; from += 50) {
    const data = await fetchJson(`${base}/widgets`, {
      headers: BROWSER_HEADERS,
      body: {
        lang: c.lang || 'en_us', deviceType: 'desktop', country: c.country || 'us', pageName: 'search-results',
        ddoKey: 'refineSearch', sortBy: '', subsearch: '', from, jobs: true, counts: false, all_fields: [],
        size: 50, clearAll: false, jdsource: 'facets', isSliderEnable: false, keywords: '', global: true,
        selected_fields: {}, locationData: {},
      },
    });
    const page = data.refineSearch?.data?.jobs || [];
    all.push(...page);
    if (!page.length || all.length >= (data.refineSearch?.totalHits ?? 0)) break;
  }
  return all.map((j) =>
    makeJob({
      source: 'phenom', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: {
        id: j.jobId || j.reqId || j.jobSeqNo,
        title: j.title,
        location: (j.multi_location?.length ? j.multi_location : [j.location]).join('; '),
        remote: /remote/i.test(j.type || ''),
        url: j.jobUrl,
        applyUrl: j.applyUrl,
        postedAt: j.postedDate || j.dateCreated,
        department: j.category,
        text: [j.ml_job_parser?.descriptionTeaser || j.descriptionTeaser, j.ml_skills?.join(', ')].filter(Boolean).join('\n\n'),
      },
    }),
  );
}

// Microsoft careers (covers Mojang / Minecraft and the rest of Xbox). Searched by keyword.
async function microsoft(c) {
  const byId = new Map();
  for (const q of c.searches || [c.name]) {
    for (let start = 0; start < 200; ) {
      const data = await fetchJson(
        `https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=${encodeURIComponent(q)}&start=${start}&sort_by=relevance`,
        { headers: { ...BROWSER_HEADERS, referer: 'https://apply.careers.microsoft.com/careers' } },
      );
      const page = data.data?.positions || [];
      for (const p of page) byId.set(p.id, p);
      start += page.length;
      if (!page.length || start >= (data.data?.count ?? 0)) break;
    }
  }
  return [...byId.values()].map((p) =>
    makeJob({
      source: 'microsoft', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: {
        id: p.id,
        title: p.name,
        // "United States, Washington, Redmond" → "Redmond, Washington, United States"
        location: (p.locations || []).map((l) => l.split(', ').reverse().join(', ')).join('; '),
        remote: /remote/i.test(p.workLocationOption || ''),
        url: `https://apply.careers.microsoft.com/careers/job/${p.id}`,
        postedAt: Number(p.postedTs) || null,
        department: p.department,
        text: p.department,
      },
    }),
  );
}

// Avature career sites (e.g. jobs.ea.com for DICE), searched by keyword. The search result
// pages list every job; the RSS feed only has the first 20, so it's used just for posting dates.
// Neither has a location, so each search is labelled with `c.location`.
async function avature(c) {
  const base = c.url.replace(/\/+$/, '');
  const jobId = (link) => link.match(/\/(\d+)\/?(?:[?#].*)?$/)?.[1];
  const jobs = new Map(); // id → { title, link }
  const dates = new Map(); // id → pubDate
  for (const q of c.searches || []) {
    const search = `${base}/SearchJobs/${encodeURIComponent(q)}`;
    for (const it of rssItems(await fetchText(`${search}/feed/`, { headers: BROWSER_HEADERS }))) {
      dates.set(jobId(it.get('link')), it.get('pubDate'));
    }
    for (let offset = 0; offset < 1000; offset += 20) {
      const html = await fetchText(`${search}/?jobRecordsPerPage=20&jobOffset=${offset}`, { headers: BROWSER_HEADERS });
      const before = jobs.size;
      for (const [, link, inner] of html.matchAll(/<a\b[^>]*href="([^"]*\/JobDetail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const title = htmlToText(inner);
        const id = jobId(link);
        if (id && title && !/^more information$/i.test(title) && !jobs.has(id)) jobs.set(id, { title, link });
      }
      if (jobs.size === before) break; // past the last page
    }
  }
  return [...jobs.entries()].map(([id, j]) =>
    makeJob({
      source: 'avature', kind: 'ats', slug: c.slug, company: c.name, companyTags: c.tags,
      raw: { id, title: j.title, location: c.location || '', url: j.link, postedAt: dates.get(id), text: '' },
    }),
  );
}

export const ATS = { greenhouse, lever, ashby, smartrecruiters, workable, teamtailor, phenom, microsoft, avature };

// ── Public job boards ───────────────────────────────────────────────────────

async function remotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs');
  return data.jobs.map((j) =>
    makeJob({
      source: 'remotive', kind: 'board', company: j.company_name,
      raw: {
        id: j.id,
        title: j.title,
        location: `Remote — ${j.candidate_required_location || 'Worldwide'}`,
        remote: true,
        url: j.url,
        postedAt: j.publication_date,
        department: j.category,
        salary: j.salary,
        html: j.description,
      },
    }),
  );
}

async function remoteok() {
  const byId = new Map();
  const tags = ['', 'music', 'audio', 'game-dev'];
  let failures = 0;
  for (const tag of tags) {
    try {
      const data = await fetchJson(`https://remoteok.com/api${tag ? `?tag=${tag}` : ''}`);
      for (const j of data) if (j.id && j.position) byId.set(j.id, j);
    } catch (err) {
      if (++failures === tags.length) throw err;
    }
  }
  return [...byId.values()].map((j) =>
    makeJob({
      source: 'remoteok', kind: 'board', company: fixMojibake(j.company || ''),
      raw: {
        id: j.id,
        title: fixMojibake(j.position),
        location: `Remote${j.location ? ` — ${fixMojibake(j.location)}` : ''}`,
        remote: true,
        url: j.url,
        applyUrl: j.apply_url,
        postedAt: j.epoch || j.date,
        salary: range(j.salary_min, j.salary_max, 'USD'),
        html: fixMojibake(j.description || ''),
      },
    }),
  );
}

async function himalayas(config) {
  const byId = new Map();
  let failures = 0;
  for (const q of config.searches || []) {
    try {
      const data = await fetchJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}`);
      for (const j of data.jobs || []) byId.set(j.guid, j);
    } catch {
      failures++;
    }
  }
  if (failures && failures === (config.searches || []).length) throw new Error('all Himalayas searches failed');
  return [...byId.values()].map((j) =>
    makeJob({
      source: 'himalayas', kind: 'board', company: j.companyName,
      raw: {
        id: j.guid.replace(/^https?:\/\/himalayas\.app\/companies\//, ''),
        title: j.title,
        location: `Remote — ${(j.locationRestrictions || []).join(', ') || 'Worldwide'}`,
        remote: true,
        url: j.applicationLink || j.guid,
        postedAt: j.pubDate,
        department: (j.categories || []).slice(0, 3).join(', ').replace(/-/g, ' '),
        salary: range(j.minSalary, j.maxSalary, j.currency || ''),
        html: j.description,
      },
    }),
  );
}

async function arbeitnow(config) {
  const pages = config.arbeitnowPages ?? 3;
  const bySlug = new Map(); // pages shift as new jobs arrive, so the same job can appear twice
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of data.data) bySlug.set(j.slug, j);
    if (!data.links?.next) break;
  }
  return [...bySlug.values()].map((j) =>
    makeJob({
      source: 'arbeitnow', kind: 'board', company: j.company_name,
      raw: {
        id: j.slug,
        title: j.title,
        location: j.location,
        remote: j.remote,
        url: j.url,
        postedAt: j.created_at,
        department: (j.job_types || []).join(', '),
        html: j.description,
      },
    }),
  );
}

// Platsbanken (Arbetsförmedlingen, Sweden's national job board) via the open JobTech API.
// Each search runs once per configured region and once for remote ads anywhere in Sweden.
async function platsbanken(config) {
  const pb = config.platsbanken || {};
  const queries = [];
  for (const q of pb.searches || []) {
    for (const region of pb.regions || []) queries.push({ q, filter: `region=${encodeURIComponent(region)}`, remote: false });
    if (pb.includeRemote !== false) queries.push({ q, filter: 'remote=true', remote: true });
  }
  const byId = new Map();
  let failures = 0;
  await pool(queries, 4, async ({ q, filter, remote }) => {
    try {
      const data = await fetchJson(
        `https://jobsearch.api.jobtechdev.se/search?${filter}&q=${encodeURIComponent(q)}&limit=100`,
      );
      for (const h of data.hits || []) byId.set(h.id, { ...h, remote: remote || byId.get(h.id)?.remote });
    } catch {
      failures++;
    }
  });
  if (queries.length && failures === queries.length) throw new Error('all Platsbanken searches failed');

  return [...byId.values()].map((h) => {
    const a = h.workplace_address || {};
    const place = [a.municipality || a.city, a.region, a.country].filter(Boolean).join(', ');
    return makeJob({
      source: 'platsbanken', kind: 'board', company: h.employer?.name || h.employer?.workplace,
      raw: {
        id: h.id,
        title: h.headline,
        location: [place, h.remote && 'Remote — Sweden'].filter(Boolean).join('; '),
        remote: h.remote,
        url: h.webpage_url,
        applyUrl: h.application_details?.url || h.webpage_url,
        postedAt: h.publication_date,
        department: h.occupation?.label,
        salary: h.salary_description,
        text: h.description?.text,
      },
    });
  });
}

export const BOARDS = {
  platsbanken: { label: 'Platsbanken', run: platsbanken },
  remotive: { label: 'Remotive', run: remotive },
  remoteok: { label: 'Remote OK', run: remoteok },
  himalayas: { label: 'Himalayas', run: himalayas },
  arbeitnow: { label: 'Arbeitnow', run: arbeitnow },
};
