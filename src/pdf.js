// Turns a cover letter into a properly typeset A4 PDF using the locally installed Chrome
// (headless "print to PDF"). No extra packages; Chrome is already on the machine.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WORK_DIR = path.join(os.tmpdir(), 'job-hunter-pdf');

export function findChrome() {
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

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function letterHtml(letter, profile) {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const contact = [profile.city, profile.phone, profile.email, profile.linkedin?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  // The letter's own sign-off already has the name and contact details, so the header
  // carries them once at the top and the body is the letter exactly as written.
  const paragraphs = letter
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(name)} - Cover letter</title>
<style>
  @page { size: A4; margin: 22mm 24mm; }
  body { font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif; font-size: 11.5pt; line-height: 1.5; color: #1a1a1a; }
  header { border-bottom: 1px solid #c9c9d6; padding-bottom: 10pt; margin-bottom: 22pt; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 22pt; font-weight: normal; margin: 0 0 4pt; }
  .contact { color: #555; font-size: 10pt; }
  p { margin: 0 0 11pt; }
</style></head>
<body>
  <header><h1>${esc(name)}</h1><div class="contact">${contact}</div></header>
  ${paragraphs}
</body></html>`;
}

/** Resolves to a Buffer with the PDF. Rejects if Chrome isn't available or fails. */
export function letterPdf(letter, profile) {
  const chrome = findChrome();
  if (!chrome) return Promise.reject(new Error('Google Chrome was not found; it is needed to make the PDF.'));
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const htmlFile = path.join(WORK_DIR, `${stamp}.html`);
  const pdfFile = path.join(WORK_DIR, `${stamp}.pdf`);
  fs.writeFileSync(htmlFile, letterHtml(letter, profile));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    // Its own profile, so it never hands the job to the Chrome window you have open.
    `--user-data-dir=${path.join(WORK_DIR, 'chrome-profile')}`,
    `--print-to-pdf=${pdfFile}`,
    pathToFileURL(htmlFile).href,
  ];
  return new Promise((resolve, reject) => {
    execFile(chrome, args, { timeout: 60_000, windowsHide: true }, (err) => {
      try {
        if (!fs.existsSync(pdfFile)) return reject(new Error(err ? `Chrome could not make the PDF: ${err.message}` : 'Chrome did not produce a PDF.'));
        resolve(fs.readFileSync(pdfFile));
      } finally {
        fs.rmSync(htmlFile, { force: true });
        fs.rmSync(pdfFile, { force: true });
      }
    });
  });
}

/** "Nicholas Izosimov - Cover letter - Viaplay.pdf" */
export function letterFileName(profile, company) {
  const clean = (s) => String(s || '').replace(/\b(AB|Group|Sweden|Sverige|publ)\b/gi, '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Cover letter';
  return `${name} - Cover letter - ${clean(company) || 'Application'}.pdf`;
}
