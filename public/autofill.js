(async function jobHunterFill(cfg) {
  /* Job Hunter "Fill application" bookmarklet. The app wraps this function with your profile:
     javascript:(<this file>)(<config>). It fills EMPTY fields only, never submits, and shows a
     summary of what it did. Keep comments in this style: the code ends up on one line. */
  const p = cfg.profile || {};
  const BOX_ID = 'job-hunter-fill';
  document.getElementById(BOX_ID)?.remove();

  const textOf = (n) => (n && n.textContent ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  const isShown = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };

  /* Everything that describes a field: name, id, placeholder, its label, nearby question text. */
  const describe = (el) => {
    const parts = [el.name, el.id, el.getAttribute('autocomplete'), el.placeholder, el.getAttribute('aria-label'), el.getAttribute('data-qa')];
    if (el.id) {
      try { parts.push(textOf(document.querySelector('label[for="' + CSS.escape(el.id) + '"]'))); } catch (e) { /* ignore */ }
    }
    parts.push(textOf(el.closest('label')));
    for (const id of (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)) parts.push(textOf(document.getElementById(id)));
    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      n = n.parentElement;
      if (!n || n.querySelectorAll('input, textarea, select').length > 2) break;
      const lab = n.querySelector('label, legend, [class*="label" i], [class*="question" i], [class*="title" i]');
      if (lab && !lab.contains(el)) { parts.push(textOf(lab).slice(0, 160)); break; }
    }
    return parts.filter(Boolean).join(' | ').toLowerCase();
  };

  /* Sets a value so React/Vue forms notice it. */
  const setValue = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    for (const type of ['input', 'change', 'blur']) el.dispatchEvent(new Event(type, { bubbles: true }));
    el.style.outline = '2px solid #6246ea';
    el.style.outlineOffset = '1px';
  };

  /* Searchable dropdowns (React Select etc.) look like text inputs; typing into them leaves junk. */
  const isDropdown = (el) =>
    el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete') ||
    el.getAttribute('aria-haspopup') === 'listbox' || /select__input|react-select/.test(el.className + ' ' + el.id) ||
    /* hidden helper inputs that dropdown widgets use for validation */
    el.getAttribute('aria-hidden') === 'true' || el.tabIndex === -1;

  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
  const RULES = [
    ['email', 'email', (d, el) => el.type === 'email' || /e-?mail|e-post/.test(d), p.email],
    ['phone', 'phone', (d, el) => el.type === 'tel' || /\bphone\b|\bmobile\b|telefon|\bmobil\b|mobilnummer/.test(d), p.phone],
    ['firstName', 'first name', (d) => /first.?name|given.?name|förnamn|fname|forename/.test(d), p.firstName],
    ['lastName', 'last name', (d) => /last.?name|family.?name|surname|efternamn|lname/.test(d), p.lastName],
    ['linkedin', 'LinkedIn', (d) => /linkedin/.test(d), p.linkedin],
    ['github', 'GitHub', (d) => /github/.test(d), p.github],
    ['music', 'music link', (d) => /soundcloud|spotify|music link|showreel|\breel\b/.test(d), p.musicLink],
    ['portfolio', 'website', (d) => /portfolio|website|personal.?(site|page)|webbplats|hemsida|urls\[other\]/.test(d), p.portfolio],
    ['fullName', 'name', (d) => /full.?name|\bname\b|\bnamn\b|_systemfield_name/.test(d) && !/company|organi[sz]ation|employer|user|file|school|reference|referee|manager/.test(d), fullName],
    ['city', 'city', (d) => /\bcity\b|location|\bort\b|\bstad\b|bostadsort/.test(d) && !d.includes('?'), p.city],
    ['salary', 'salary', (d) => /salary|compensation|löneanspråk|\blön\b/.test(d), p.salary],
    ['availability', 'availability', (d) => /notice|uppsägningstid|start.?date|earliest|availab|tillträde/.test(d), p.availability],
    ['workAuth', 'work authorisation', (d) => /work.?permit|authori[sz]|right to work|arbetstillstånd|visa|sponsor/.test(d), p.workAuth],
    ['howHeard', 'how you heard', (d) => /hear about|how did you (find|hear)|hittade du|referral source/.test(d), p.howHeard],
  ];
  const LETTER = /cover|letter|personligt brev|motivation|why (do )?you want|why .*(join|us\b)|additional information|comments|message|about yourself|introduce/;

  /* Ask the running Job Hunter app for the current job's cover letter and CV. */
  let kit = null;
  let problem = '';
  try {
    const res = await fetch(cfg.server + '/api/apply-kit?key=' + encodeURIComponent(cfg.key));
    if (res.ok) kit = await res.json();
    else problem = res.status === 403 ? 'old-button' : 'no-job';
  } catch (e) {
    problem = 'blocked'; /* this site's security policy blocks local connections, or the app isn't running */
  }
  const blocked = problem === 'blocked';

  /* Greenhouse hides the cover-letter text box behind an "Enter manually" button (the résumé
     field has one too, so only the one under a "cover letter" label is clicked). */
  const isCoverLetterButton = (btn) => {
    const hint = [btn.getAttribute('data-testid'), btn.id, btn.getAttribute('aria-label')].join(' ');
    if (/cover/i.test(hint)) return true;
    if (/resume|\bcv\b/i.test(hint)) return false;
    let n = btn;
    for (let i = 0; i < 6 && n; i++) {
      n = n.parentElement;
      if (!n) break;
      const labels = [...n.querySelectorAll('label, legend, [class*="label" i]')].map(textOf)
        .filter((t) => t && !/^(enter manually|attach|dropbox|google drive)$/i.test(t));
      if (labels.length) return /cover/i.test(labels[0]);
    }
    return false;
  };
  let letterBoxOpened = false;
  if (!cfg.dryRun && !document.querySelector('textarea[id*="cover" i], textarea[name*="cover" i]')) {
    const btn = [...document.querySelectorAll('button')].find((b) => /enter manually/i.test(b.textContent) && isCoverLetterButton(b));
    if (btn) {
      btn.click();
      letterBoxOpened = true;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const filled = [];
  const wouldFill = [];
  const fields = [...document.querySelectorAll('input, textarea')].filter(
    (el) => !el.disabled && !el.readOnly && isShown(el) && !isDropdown(el) &&
      !['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'password', 'search', 'date', 'number', 'range', 'color'].includes(el.type),
  );
  let letterDone = false;
  for (const el of fields) {
    if (el.value) continue;
    const d = describe(el);
    if (el.tagName === 'TEXTAREA') {
      if (kit && kit.letter && !letterDone && LETTER.test(d)) {
        if (cfg.dryRun) wouldFill.push('cover letter ← ' + d.slice(0, 60));
        else { setValue(el, kit.letter); filled.push('cover letter'); }
        letterDone = true;
      }
      continue;
    }
    for (const [, label, test, value] of RULES) {
      if (!value || !test(d, el)) continue;
      if (cfg.dryRun) wouldFill.push(label + ' ← ' + d.slice(0, 60));
      else { setValue(el, value); filled.push(label); }
      break;
    }
  }

  /* Attach the CV to the résumé upload field. */
  let cvAttached = false;
  if (kit && kit.cv && !cfg.dryRun) {
    const inputs = [...document.querySelectorAll('input[type=file]')];
    const target = inputs.find((f) => /resume|résumé|\bcv\b|curriculum|meritförteckning/.test(describe(f)) && !/cover/.test(describe(f))) ||
      (inputs.length === 1 ? inputs[0] : null);
    if (target && !target.files.length) {
      try {
        const bytes = Uint8Array.from(atob(kit.cv.base64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], kit.cv.name, { type: kit.cv.type || 'application/pdf' }));
        target.files = dt.files;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        cvAttached = true;
        filled.push('CV (' + kit.cv.name + ')');
      } catch (e) { /* some sites only accept files from their own picker */ }
    }
  }

  /* No cover-letter text box filled? Attach the letter as a PDF to a "cover letter" upload field. */
  if (kit && kit.letterFile && !letterDone && !cfg.dryRun) {
    const target = [...document.querySelectorAll('input[type=file]')].find((f) => /cover|letter|personligt brev|motivation/.test(describe(f)));
    if (target && !target.files.length) {
      try {
        const bytes = Uint8Array.from(atob(kit.letterFile.base64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], kit.letterFile.name, { type: 'application/pdf' }));
        target.files = dt.files;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        letterDone = true;
        filled.push('cover letter PDF');
      } catch (e) { /* some sites only accept files from their own picker */ }
    }
  }

  const required = [...document.querySelectorAll('input, textarea, select')].filter(
    (el) => (el.required || el.getAttribute('aria-required') === 'true') && isShown(el) && !el.value && el.type !== 'file' && el.type !== 'hidden',
  ).map((el) => describe(el).split(' | ').reverse().find((s) => s.length > 2 && s.length < 80) || el.name || 'a field');

  if (cfg.dryRun) return { wouldFill, required, kit: kit ? { job: kit.job, hasLetter: !!kit.letter, cv: kit.cv && kit.cv.name } : null, blocked };

  /* Summary box */
  const box = document.createElement('div');
  box.id = BOX_ID;
  box.style.cssText = 'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;max-width:360px;background:#fff;color:#17171c;' +
    'font:14px/1.45 system-ui,Segoe UI,sans-serif;border:1px solid #d9d9e3;border-radius:12px;box-shadow:0 8px 30px #0003;padding:14px 16px;';
  const line = (html, color) => '<div style="margin-top:6px;' + (color ? 'color:' + color + ';' : '') + '">' + html + '</div>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let html = '<div style="display:flex;justify-content:space-between;gap:12px;font-weight:700">Job Hunter' +
    '<span id="' + BOX_ID + '-x" style="cursor:pointer;font-weight:400">✕</span></div>';
  if (kit && kit.job) {
    html += line('For: <b>' + esc(kit.job.title) + '</b> at ' + esc(kit.job.company));
    if (!document.body.innerText.toLowerCase().includes(String(kit.job.company).toLowerCase().split(/\s+/)[0])) {
      html += line('This page doesn\'t mention ' + esc(kit.job.company) + '. Is it the right job? Click Apply in Job Hunter first.', '#9a5b00');
    }
  }
  html += line(filled.length ? 'Filled: ' + esc([...new Set(filled)].join(', ')) : 'Nothing to fill on this page (fields already filled, or not recognised).');
  if (problem === 'blocked') {
    html += line('This site blocks the connection to Job Hunter (or the app isn\'t running), so: the cover letter is on your clipboard (' +
      (letterBoxOpened ? 'its box is open: ' : '') + 'click the box, press Ctrl+V) and attach your CV from Desktop → Job Hunter → cv.', '#9a5b00');
  } else if (problem === 'no-job') {
    html += line('No job selected in Job Hunter: click Apply on this job there first, so the right cover letter and CV are used.', '#9a5b00');
  } else if (problem === 'old-button') {
    html += line('This Fill button is out of date. In Job Hunter open Profile and drag the button to your bookmarks bar again.', '#9a5b00');
  } else {
    if (kit.letter && !letterDone) html += line('No cover-letter box found here; if there is one, it\'s on your clipboard: Ctrl+V.', '#6b6b7b');
    if (kit.cv && !cvAttached) html += line('Attach your CV yourself: ' + esc(kit.cv.name) + ' (Desktop → Job Hunter → cv).', '#9a5b00');
  }
  if (letterDone && /\[[^\]]{3,}\]/.test(kit.letter)) {
    html += line('The cover letter still has [bracketed] parts: rewrite them before you submit.', '#c2185b');
  }
  if (required.length) html += line('Still empty (required): ' + esc(required.slice(0, 6).join(', ')), '#c2185b');
  html += line('Check everything, then press Submit yourself.', '#1a7f4b');
  box.innerHTML = html;
  document.body.appendChild(box);
  document.getElementById(BOX_ID + '-x').onclick = () => box.remove();
})
