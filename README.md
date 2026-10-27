# Job Hunter

Pulls jobs from company career boards and remote job boards, ranks them by how well they
fit **music × games × tech**, and gives you a fast apply-and-track workflow.

No installs: just Node.js (v20+), no npm packages.

## Run it

Double-click **`Start Job Hunter.bat`**, or:

```bash
npm start
```

Your browser opens at http://localhost:3000. If the last refresh was more than 6 hours
ago, it refreshes automatically in the background (takes ~15–20 s).

## Applying fast

| Key | Action |
| --- | --- |
| `j` / `k` | next / previous job |
| `Enter` | **Apply**: copies the right cover letter, opens the application page |
| `a` | mark as applied (or click **✓ I applied** after Apply) |
| `c` | copy the right cover letter for this job, filled in |
| `s` | save for later |
| `x` | hide (not interested) |
| `e` | details: full description, why it matched, notes |
| `u` | undo the last status change |
| `/` | search |

Suggested loop: `j` → `Enter` → **⚡ Fill application** on the form → rewrite the one
bracketed sentence → Submit → come back → `a` → `j`…

### ⚡ Fill application (one-click form filling)

Set up once in **Profile & autofill**: your details, your CV files (put them in the `cv`
folder), which CV and letter go with music vs tech/games jobs. Then drag the
**⚡ Fill application** button to Chrome's bookmarks bar (`Ctrl`+`Shift`+`B` shows it).

When you click **Apply**, Job Hunter remembers the job, copies its cover letter and opens the
form. Clicking **⚡ Fill application** on the form then:

* fills name, email, phone, city, LinkedIn/website/GitHub and any common questions you answered
  (salary, availability, work authorisation, how you heard) into **empty** fields only;
* pastes the cover letter and attaches the right CV (Lever, Teamtailor, Workable,
  SmartRecruiters; Chrome may ask once per site to allow local access);
* on Greenhouse and Ashby, which block that connection: fills the text fields, opens the cover
  letter box, and you paste (`Ctrl`+`V`) and attach the CV yourself;
* skips dropdowns and job-specific essay questions, and lists required fields still empty;
* **never submits**. You check everything and press Submit.

It warns when the letter still has [bracketed] text to rewrite, or when the page doesn't
look like the job you clicked Apply on. Letters can use `{{name}}`, `{{phone}}`, `{{email}}`,
`{{linkedin}}` and `{{portfolio}}` from your profile.

After changing your profile, drag the button to the bookmarks bar again.

* **Snippets** (top right): put your cover letter, links, "why this company" blurbs here once.
* **+ Add job**: track jobs you found anywhere else (LinkedIn, Indeed, a friend's tip).
* **Applied / Interviewing / Offer / Rejected** tabs are your tracker. **Export CSV** downloads it.
* The header counts how many you applied to today and this week.

### 📧 Mail: replies from companies

Click **📧 Mail** and connect Gmail with an *app password* (create one at
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords); it needs 2-Step
Verification). Job Hunter then checks your inbox every 10 minutes (`mailCheckMinutes` in `config.js`)
and shows emails from companies you've applied to on the matching job: a **📧 1 unread** badge on the
card, the emails in its details, and an unread count on the Mail button. Each email opens in Gmail.

* It only reads: the inbox is opened read-only and nothing is marked as read, sent, moved or deleted.
* An email matches a job when it comes from the company's own domain, or when it's clearly about an
  application ("application", "ansökan", "interview"…) and names the company in the sender or subject,
  and arrived after the day before you applied. Newsletters from the company don't count.
* Wrong match? **Not this job** removes it for good.
* The app password is stored only in `data/jobs.json` on this computer. **Disconnect** deletes it;
  also withdraw it on Google's App passwords page.

## Scores and tags

Scores run from 0 to 100, where **100 = your dream job** (`profile.perfectJob` in `config.js`).
Each job's points are shown as a percentage of the dream job's points, capped at 100.
Open a job's details (▾) to see the points behind it.

Each job gets points for music/audio, games, tech, AI and creative keywords in English
and Swedish (more for title matches), a bonus for music/games companies, and a big bonus
for **✦ Blend** roles that mix music/audio with games, tech or AI. Hover a tag to see which words matched.

Location counts too (set in `config.js` → `profile.location`):

| Tag | Meaning | Points |
| --- | --- | --- |
| **Stockholm** | on-site / hybrid in your commute area | +4 |
| **Remote ✓** | remote and open to Sweden / Europe / worldwide | +3 |
| **Remote ?** | says remote but not from where; check the posting | +1 |
| **Sweden** | on-site elsewhere in Sweden | +1 |
| **Remote · other region** | e.g. "Remote – US only" | −3 |
| **Relocation** | on-site in another country | −3 |

The **Where** filter defaults to *Stockholm + remote*; switch to *Anywhere* to see the rest.

How realistic a job is counts too (`config.js` → `profile.experience`):

| Signal | Points |
| --- | --- |
| Junior / intern / trainee / graduate title | +5 |
| Senior title | −5 |
| Lead / principal / director title | −8 |
| Asks for 0–2 years of experience (or "no experience required") | +2 |
| Asks for 3–4 years | −2 |
| Asks for 5+ years | −5 |
| PhD-level role | −8 |
| Talent pool / open application from a recruiter or job board | −4 |
| Mentions your skills (JavaScript, C#, Godot, Pro Tools, metadata…) | +1 each, up to +4 |
| Music-side role at a music company (curation, catalogue, rights, artist services) | +6 |
| QA / testing role | +5 |
| AI music/audio evaluation work | +4 |
| Support role | +3 |
| Developer/engineer title not marked junior (studio engineer roles exempt) | −5 |
| Specialist engineering (backend, C++, ML, embedded…) | −4 |
| Visual art role (UI artist, animator…) | −5 |
| Outside your field (finance, legal, sales, HR) | −5 |

Role types are matched on the job title and set in `profile.experience.roleFit`.

A job also has to be in your field (`minRelevance`), so "Junior Sales, Stockholm" never shows up.
The **Level** filter defaults to *Realistic for me* (not senior, asks for ≤3 years).
Open a job's details (▾) to see exactly how its score was calculated.

## Sources

* **Company job boards** (most trustworthy, straight from the company): King, EA / DICE,
  Mojang, Spotify, Epidemic Sound, Embark, Paradox, Avalanche, Arrowhead, Fatshark, Sharkmob,
  Starbreeze, Stillfront, Soundtrap, Storytel, Acast, Teenage Engineering, Soundtrack, Amuse,
  Riot, Epic, Roblox, Suno, ElevenLabs and ~35 more.
* **Platsbanken** (Arbetsförmedlingen's open API): Stockholm-region and remote ads for
  music, audio, games, dev and AI searches (`config.js` → `platsbanken`).
* **Aggregator boards**: Remote OK, Remotive, Himalayas, Arbeitnow. These re-list jobs from
  elsewhere, so they score 2 points lower (`profile.sourceBonus`). Before applying, check the
  job is also on the company's own site.
* **Not covered** (no usable job feed): Hazelight, MachineGames, Toca Boca. Check their sites now and then.

## Customising: `config.js`

* **Add companies**: open one of their job posts and copy the slug from the URL
  (instructions at the top of the file). Greenhouse, Lever, Ashby, SmartRecruiters, Workable
  and Teamtailor are supported.
* **Tune matching**: add or remove keywords, change weights, change your home area.
* **Teaching jobs** are excluded by default (`excludeTitle`); remove those entries if you'd consider them.
* **`minScore`**: raise it for fewer, sharper results; lower it to see more.

Changes apply on the next **Refresh jobs**, no restart needed.

## Where things live

* `data/jobs.json`: all jobs, your statuses and notes (a backup is written to
  `data/jobs.backup.json` on each refresh). Don't delete it unless you want to start over.
* `src/sources.js`: one adapter per job source. Add new sources here.
* `src/score.js`: the ranking logic.
* `npm run scrape`: refresh from the command line without opening the UI.

Remote OK, Remotive, Himalayas and Arbeitnow jobs link back to their sites, as their API terms require.
