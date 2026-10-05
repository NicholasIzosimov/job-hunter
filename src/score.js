// Relevance scoring. Pure functions: (job, compiled profile) → { score, cats, matched, level, where, excluded }.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = '[\\p{L}\\p{N}]';

/**
 * 'royalt*' → starts with; '*utvecklare' → ends with (Swedish compounds like "systemutvecklare");
 * '*musik*' → contains; anything else → exact word. Spaces also match hyphens.
 */
function termsRegex(terms = []) {
  terms = terms.filter((t) => t.replace(/\*/g, '').trim());
  if (!terms.length) return null;
  const parts = terms.map((t) => {
    const prefix = t.endsWith('*');
    const suffix = t.startsWith('*');
    const core = escapeRe(t.replace(/^\*|\*$/g, '')).replace(/\s+/g, '[\\s-]+');
    return `${suffix ? `${WORD}*` : ''}${core}${prefix ? `${WORD}*` : `(?!${WORD})`}`;
  });
  return new RegExp(`(?<!${WORD})(?:${parts.join('|')})`, 'giu');
}

function findAll(re, text, max = 8) {
  if (!re || !text) return [];
  const found = new Set();
  for (const m of text.matchAll(re)) {
    found.add(m[0].toLowerCase().replace(/[\s-]+/g, ' '));
    if (found.size >= max) break;
  }
  return [...found];
}
const has = (re, text) => findAll(re, text, 1).length > 0;

export function compileProfile(profile) {
  const cats = {};
  for (const [key, c] of Object.entries(profile.categories)) {
    cats[key] = {
      ...c,
      textRe: termsRegex(c.terms),
      titleRe: termsRegex([...(c.terms || []), ...(c.titleTerms || [])]),
    };
  }
  const loc = profile.location || {};
  const exp = profile.experience || {};
  return {
    ...profile,
    cats,
    exp,
    excludeRe: termsRegex(profile.excludeTitle),
    leadRe: termsRegex(exp.leadTerms),
    seniorRe: termsRegex(exp.seniorTerms),
    thesisRe: termsRegex(exp.thesisTerms),
    entryRe: termsRegex(exp.entryTerms),
    unrealisticRe: termsRegex(exp.unrealisticTerms),
    pipelineRe: termsRegex(exp.pipelineTerms),
    skillsRe: termsRegex(exp.mySkills),
    roleFit: (exp.roleFit || []).map((g) => ({ ...g, re: termsRegex(g.terms) })),
    homeRe: termsRegex(loc.home),
    countryRe: termsRegex(loc.country),
    remoteRegionRe: termsRegex(loc.remoteRegions),
  };
}

// ── How many years of experience does the posting ask for? ──────────────────
// Reads "3+ years of experience", "2-4 years", "minst 5 års erfarenhet", "five years"…
// Returns the lowest requirement found (0–12), 0 for "no experience needed", or null.
const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  två: 2, tre: 3, fyra: 4, fem: 5, sju: 7, åtta: 8, nio: 9, tio: 10,
};
const YEARS_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(\\d{1,2}|${Object.keys(NUM_WORDS).join('|')})\\s*(?:\\+|plus)?\\s*(?:(?:-|–|to|till)\\s*\\d{1,2}\\s*)?\\+?\\s*(?:years?|yrs?|års?|år)(?![\\p{L}])`,
  'giu',
);
const EXPERIENCE_NEAR = /experien|erfarenhet|track record|background in|working (?:with|in|as)|professional|in the industry|i branschen/i;
const COMPANY_BOAST = /\b(?:we have|our team|founded|since|for over|for more than|history|anniversary)\b|vi har|grundades/i;
const NO_EXPERIENCE = /\bno (?:prior |previous )?experience (?:is )?(?:required|needed|necessary)\b|\bentry[- ]level\b|\brecent graduates?\b|\bnew grads?\b|ingen (?:tidigare )?erfarenhet|nyexaminerad/i;
const SOME_YEARS = /\b(?:several|many) years\b|\bextensive (?:professional |industry )?experience\b|\bproven track record\b|flera års erfarenhet|gedigen erfarenhet|lång erfarenhet|mångårig erfarenhet/i;

export function yearsRequired(text) {
  if (!text) return null;
  let min = null;
  for (const m of text.matchAll(YEARS_RE)) {
    const n = NUM_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
    if (!(n >= 0 && n <= 12)) continue; // "0–2 years" counts; "25 years" is a company boast
    const around = text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70);
    if (!EXPERIENCE_NEAR.test(around) || COMPANY_BOAST.test(around)) continue;
    min = min == null ? n : Math.min(min, n);
  }
  if (min != null) return min;
  if (NO_EXPERIENCE.test(text)) return 0;
  if (SOME_YEARS.test(text)) return 4;
  return null;
}

// ── Where is the job, from your point of view? ──────────────────────────────
//   home             on-site/hybrid in your city
//   remote           remote and open to your country / Europe / worldwide
//   remote-unclear   remote, but the posting doesn't say from where
//   country          on-site elsewhere in your country
//   remote-elsewhere remote, but only for other regions (e.g. "Remote – US")
//   elsewhere        on-site somewhere else
//   unknown          no location given
const WHERE_RANK = ['elsewhere', 'remote-elsewhere', 'unknown', 'country', 'remote-unclear', 'remote', 'home'];
const REMOTE_WORD = /\b(remote|distans|anywhere|worldwide|work from home|wfh)\b/i;
const FILLER = /\b(remote|distans|fully|full|time|first|only|friendly|work|from|home|position|role|ok|wfh|100%)\b/gi;

export function classifyLocation(job, rules) {
  const segments = (job.location || '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return job.remote ? 'remote-unclear' : 'unknown';
  // ATS "remote" flag with a plain city ("New York") means remote *from* that place.
  const flagOnly = job.remote && !segments.some((s) => REMOTE_WORD.test(s));
  let best = 0;
  for (const seg of segments) {
    let where;
    if (REMOTE_WORD.test(seg) || flagOnly) {
      if (has(rules.homeRe, seg) || has(rules.countryRe, seg) || has(rules.remoteRegionRe, seg)) where = 'remote';
      else if (!seg.replace(FILLER, '').replace(/[^\p{L}\p{N}]+/gu, '')) where = 'remote-unclear';
      else where = 'remote-elsewhere';
    } else if (has(rules.homeRe, seg)) where = 'home';
    else if (has(rules.countryRe, seg)) where = 'country';
    else where = 'elsewhere';
    best = Math.max(best, WHERE_RANK.indexOf(where));
  }
  return WHERE_RANK[best];
}

const MUSIC_TAGS = ['music', 'audio'];

export function scoreJob(job, rules) {
  const title = job.title || '';
  const text = job.description || '';
  const tags = job.companyTags || [];

  let score = 0;
  const matched = {};
  const inTitle = {};

  for (const [key, c] of Object.entries(rules.cats)) {
    const t = findAll(c.titleRe, title);
    const d = c.textWeight ? findAll(c.textRe, text) : [];
    if (t.length) {
      score += c.titleWeight;
      inTitle[key] = true;
    }
    if (d.length) score += c.textWeight;
    if (t.length || d.length) matched[key] = [...new Set([...t, ...d])].slice(0, 6);
  }

  for (const tag of tags) score += rules.companyTagBonus?.[tag] ?? 0;

  const cats = new Set(Object.keys(matched));
  if (tags.some((t) => MUSIC_TAGS.includes(t))) cats.add('music');
  if (tags.includes('games')) cats.add('games');
  if (tags.includes('ai')) cats.add('ai');

  // Music/audio on one side, games/tech/AI on the other, with at least one of them in the title.
  const musicSide = inTitle.music || tags.some((t) => MUSIC_TAGS.includes(t));
  const otherSide = inTitle.games || inTitle.tech || inTitle.ai || tags.includes('games');
  if (musicSide && otherSide && (inTitle.music || inTitle.games || inTitle.tech || inTitle.ai)) {
    score += rules.blendBonus ?? 0;
    cats.add('blend');
  }

  // Everything above is "is this my field?". Location, level and experience below only reorder
  // relevant jobs; they can't make an unrelated job (e.g. "Junior Sales, Stockholm") show up.
  const relevance = score;
  const why = []; // human-readable adjustments, shown in the job's details
  const adjust = (points, reason) => {
    if (!points) return;
    score += points;
    why.push(`${points > 0 ? '+' : ''}${points} ${reason}`);
  };

  const where = classifyLocation(job, rules);
  adjust(rules.location?.bonus?.[where] ?? 0, WHERE_REASON[where] || where);

  // Aggregator boards re-list jobs from elsewhere and vet them less than a company's own board.
  adjust(rules.sourceBonus?.[job.source] ?? 0, `listed on an aggregator (${job.source})`);

  // ── How realistic is it for you? ──
  const exp = rules.exp;
  let level = '';
  if (has(rules.leadRe, title)) level = 'lead';
  else if (has(rules.seniorRe, title)) level = 'senior';
  else if (has(rules.thesisRe, title)) level = 'thesis';
  else if (has(rules.entryRe, title)) level = 'entry';
  adjust(exp.levelBonus?.[level] ?? 0, LEVEL_REASON[level] || level);

  const years = yearsRequired(`${title}\n${text}`);
  if (years != null) {
    const band = (exp.yearsBonus || []).find((b) => years <= b.max);
    adjust(band?.points ?? 0, years === 0 ? 'no experience required' : `asks for ${years}+ years of experience`);
  }

  const phd = has(rules.unrealisticRe, `${title}\n${text}`);
  if (phd) adjust(exp.unrealisticBonus ?? 0, 'PhD-level role');
  // Recruiters' and boards' talent pools aren't real openings; a company's own open application is.
  if (job.kind !== 'ats' && has(rules.pipelineRe, title)) {
    adjust(exp.pipelineBonus ?? 0, 'talent pool / open application, not a specific opening');
  }

  let goodFit = false;
  for (const group of rules.roleFit) {
    if (!has(group.re, title) || (group.requiresMusic && !musicSide)) continue;
    adjust(group.points, group.label);
    if (group.points > 0) goodFit = true;
  }

  const juniorFriendly = level === 'entry' || (years != null && years <= 2);
  if (inTitle.tech && !STUDIO_ROLE.test(title) && !level && !juniorFriendly && !goodFit) {
    adjust(exp.unmarkedTechBonus ?? 0, 'developer/engineer role not marked junior (usually needs experience)');
  }

  const skills = findAll(rules.skillsRe, `${title}\n${text}`, 12);
  if (skills.length) {
    matched.skills = skills;
    adjust(Math.min(skills.length * (exp.skillPoints ?? 1), exp.skillMax ?? 4), `uses your skills (${skills.slice(0, 4).join(', ')})`);
  }

  return {
    score,
    relevance,
    cats: [...cats],
    matched,
    level,
    years,
    phd,
    where,
    why,
    excluded: has(rules.excludeRe, title),
  };
}

// Studio "engineer" titles are music-production jobs, not software engineering.
const STUDIO_ROLE = /\b(?:audio|sound|mix(?:ing)?|master(?:ing)?|recording|studio)\s+engineer|ljudtekniker/i;

const WHERE_REASON = {
  home: 'in your area',
  remote: 'remote, open to you',
  'remote-unclear': 'remote (region not stated)',
  country: 'elsewhere in your country',
  'remote-elsewhere': 'remote only for other regions',
  elsewhere: 'on-site abroad',
};
const LEVEL_REASON = {
  entry: 'junior / intern / trainee role',
  senior: 'senior role',
  lead: 'lead / principal / director role',
  thesis: "thesis role (usually for master's students)",
};

/** A job is worth listing if it's in your field (relevance) and still scores well overall. */
export function isRelevant(s, profile) {
  return !s.excluded && s.relevance >= (profile.minRelevance ?? 0) && s.score >= (profile.minScore ?? 0);
}
