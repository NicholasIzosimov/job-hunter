// Writes a cover letter for one job with Claude, through the locally installed `claude` CLI
// (Claude Code in non-interactive mode), so it runs on your Claude subscription. Claude only
// sees the job ad and data/letter-facts.md; it gets no tools and no access to your files.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './store.js';

export const FACTS_FILE = path.join(ROOT, 'data', 'letter-facts.md');
const TIMEOUT_MS = 4 * 60 * 1000;

const DEFAULT_FACTS = `# Facts for AI cover letters
Everything here must be TRUE. Claude may only use what is written here. Edit freely.

## Basics
- Nicholas Izosimov, lives in central Stockholm (Vasastan).
- Swedish: native. English: fluent (English-speaking household; studied two years in Los Angeles).
- Has a standard car driving licence (B).

## Education
- B.M. in Music Production, Berklee College of Music, completed October 2026.
- A.S. in Music Production & Sound Engineering, Los Angeles Recording School, 2019-2021, graduated summa cum laude.
- Base year in music, Royal College of Music (KMH), Stockholm, 2021-2022: music theory, instrumentation, music business.
- IT & Service Design distance courses, Luleå University of Technology, 2023-2025 (courses, not a full degree).
- Full-stack JavaScript bootcamp, Salt, 2022: 3-month intensive with JavaScript, React, Node, test-driven development and mob programming. Afterwards 3 months on Salt's consultant team, without a client placement.

## Work
- Freelance music producer (N.I.K Productions) since 2015: production, arrangement and mixing for independent artists and labels, including 11:11 Music Group. Co-produced one single released via Capitol Records (work-for-hire).
- 11:11 Music Group, 2019-2021: produced tracks for the label's lo-fi, rap/pop and singer-songwriter catalogue with a team of eight artists, producers and managers. The productions have 40M+ streams across platforms (Jan 2026).
- NIX Music Publishing (own sole-trader company, registered 2024): helped independent artists register their works and set up royalty collection (splits, metadata, collecting-society registration). Learned first-hand what goes wrong when registrations or timing slip.
- The Kennel (record label), summer internship 2017-2019: studio and office support, sat in on producers' sessions, hosted studio sessions with artists.
- Waiter at a fine-dining restaurant (YOLO, Danderyd), 2015-2016, about one year: guests with high service expectations.
- Volunteer in Nepal, 2018: built dog shelters, taught basic English and computing to children.

## Skills
- Audio: Pro Tools, Logic Pro X, Ableton Live; mixing and sound design. Uses both Windows and Mac.
- Music business: rights registration, splits, metadata, release workflows.
- Data: Excel / Google Sheets modelling.
- Code: working knowledge of JavaScript and HTML/CSS; basics of C#, React and GDScript.
- Building a small game in Godot 4 since July 2026 (AI-assisted; in progress, not finished).
- Uses AI tools like Claude daily; built "Job Hunter" with Claude: a tool that collects job listings from 50+ sites, ranks them and fills in application forms. Lesson: stay on top of the architecture and review what the AI writes.

## Gaming (mention ONLY for games-related jobs)
- World of Warcraft, Midnight Season 1: ranked #36 worldwide among Warlocks in Mythic raiding, 99.1 average parse (Warcraft Logs). Builds spreadsheets to plan character progression.

## Never claim
- No professional software-development job.
- No SaaS, CRM, UX-research, public-sector/procurement or professional translation experience.
- Did not work directly with Universal Music / Capitol (only co-produced one single, work-for-hire).
- Not an authorised (certified) translator.
`;

export function readFacts() {
  if (!fs.existsSync(FACTS_FILE)) {
    fs.mkdirSync(path.dirname(FACTS_FILE), { recursive: true });
    fs.writeFileSync(FACTS_FILE, DEFAULT_FACTS);
  }
  return fs.readFileSync(FACTS_FILE, 'utf8');
}

function buildPrompt(job, profile, facts) {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'the candidate';
  const contact = [profile.phone, profile.email].filter(Boolean).join(' · ');
  return `Write a cover letter for the job below, on behalf of the candidate described in CANDIDATE FACTS. Output only the letter itself: no preamble, no notes, no markdown.

Rules:
- Use only facts from CANDIDATE FACTS. Never invent experience, employers, numbers, tools or skills. Respect the "Never claim" list.
- If the ad asks for something the candidate lacks, don't claim it. You may acknowledge one gap briefly and positively (for example, eager to learn it), at most once.
- Write in the same language as the job ad: a Swedish ad gets a Swedish letter, an English ad an English letter.
- 200-300 words in 4-5 short paragraphs. Warm, direct and specific; no clichés such as "I am writing to express my interest".
- Choose the 2-3 facts most relevant to this job and connect each to something the ad asks for. Leave out facts that don't help this application.
- Include one sentence on why this company or role, based only on what the ad says.
- No [brackets] or placeholders anywhere.
- Open with a greeting to the company (for example "Hi ${job.company} team," or "Hej ${job.company}!") and end with exactly:
Best regards / Med vänliga hälsningar (match the letter's language)
${name}
${contact}

JOB
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'not stated'}
Ad text:
<<<
${job.description || '(The ad text is not available; base the letter on the title and company only, and keep it general.)'}
>>>

CANDIDATE FACTS
<<<
${facts}
>>>`;
}

/** Runs `claude -p` with the prompt on stdin. Resolves to the letter text. */
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--tools', '', '--no-session-persistence', '--output-format', 'text'], {
      cwd: os.tmpdir(), // nothing project-related for it to read
      windowsHide: true,
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Claude took longer than 4 minutes. Try again.'));
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT' ? 'The claude command-line tool was not found.' : e.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = out.trim();
      if (code === 0 && text) return resolve(text);
      const detail = (err || out).trim().split('\n').slice(-3).join(' ');
      if (/auth|log ?in|oauth|expired/i.test(detail)) {
        return reject(new Error('Claude is signed out. Open a terminal, run "claude", sign in, then try again.'));
      }
      reject(new Error(detail || `claude exited with code ${code}`));
    });
    child.stdin.end(prompt);
  });
}

// One letter at a time, so several clicks don't start parallel runs on your subscription.
let queue = Promise.resolve();
export function writeLetter(job, profile) {
  const run = queue.then(() => runClaude(buildPrompt(job, profile, readFacts())));
  queue = run.catch(() => {});
  return run;
}
