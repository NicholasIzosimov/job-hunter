// All state lives in data/jobs.json: scraped jobs, your statuses/notes, and copy-paste snippets.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'jobs.json');

export const STATUSES = ['new', 'saved', 'applied', 'interview', 'offer', 'rejected', 'hidden'];

const DEFAULT_SNIPPETS = [
  {
    id: 'cover-letter',
    name: 'Cover letter',
    default: true,
    text: `Dear {{company}} team,

I'm excited to apply for the {{title}} role.

[Why you + this company — paste your cover letter here once and reuse it. {{company}} and {{title}} are filled in automatically when you copy.]

Best regards,
[Your name]`,
  },
  {
    id: 'links',
    name: 'Links',
    text: 'Portfolio: \nLinkedIn: \nMusic (SoundCloud / Spotify): \nGitHub / itch.io: ',
  },
];

// What the "Fill application" bookmarklet types into forms, plus which CV / letter goes with which job.
export const DEFAULT_PROFILE = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  linkedin: '',
  portfolio: '',
  github: '',
  musicLink: '',
  salary: '',
  availability: '',
  workAuth: '',
  howHeard: '',
  cvMusic: '', // file name in the cv/ folder
  cvTech: '',
  letterMusic: 'cover-letter', // snippet id
  letterTech: 'cover-letter-tech',
};

function fresh() {
  return { version: 1, lastScrape: null, lastSummary: null, jobs: {}, snippets: DEFAULT_SNIPPETS, profile: { ...DEFAULT_PROFILE } };
}

export function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...fresh(), ...db, profile: { ...DEFAULT_PROFILE, ...db.profile } };
  } catch (err) {
    if (err.code === 'ENOENT') return fresh();
    throw new Error(`Could not read ${DB_FILE}: ${err.message}. Fix or restore it from jobs.backup.json.`);
  }
}

/** Atomic write (temp file + rename) so a crash never leaves a half-written database. */
export function saveDb(db, { backup = false } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (backup && fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, path.join(DATA_DIR, 'jobs.backup.json'));
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  try {
    fs.renameSync(tmp, DB_FILE);
  } catch {
    // Windows can refuse the rename if something (e.g. antivirus) briefly holds the file.
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    fs.rmSync(tmp, { force: true });
  }
}
