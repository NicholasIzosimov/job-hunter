// ─────────────────────────────────────────────────────────────────────────────
//  Job Hunter config
//  Edit freely. Changes are picked up the next time you click "Refresh jobs"
//  (no restart needed, except for `port`).
// ─────────────────────────────────────────────────────────────────────────────

export default {
  port: 3000,

  // Which browser the dashboard opens in: 'chrome' (falls back to your default if Chrome
  // isn't installed) or 'default'. Job links always open in a new tab of that browser.
  browser: 'chrome',

  // When the app starts, refresh automatically if the last scrape is older than this.
  autoRefreshHours: 6,

  // ── Companies to follow ───────────────────────────────────────────────────
  // ats: greenhouse | lever | ashby | smartrecruiters | workable | teamtailor
  //      (plus phenom / microsoft / avature for the big studios below; see those entries)
  //
  // To add a company, open one of its job postings and look at the URL:
  //   job-boards.greenhouse.io/<slug>/...  → ats: 'greenhouse'
  //   jobs.lever.co/<slug>/...             → ats: 'lever'
  //   jobs.ashbyhq.com/<slug>/...          → ats: 'ashby'
  //   jobs.smartrecruiters.com/<slug>/...  → ats: 'smartrecruiters'
  //   apply.workable.com/<slug>/...        → ats: 'workable'
  //   <slug>.teamtailor.com/jobs/...       → ats: 'teamtailor'  (very common in Sweden; if the
  //                                          company uses its own domain, e.g. careers.embark-studios.com,
  //                                          that's usually Teamtailor too: add url: 'https://careers.…')
  //
  // `tags` give every job at that company a relevance boost (see profile.companyTagBonus).
  // Set `enabled: false` to pause a company without deleting it.
  companies: [
    // ── Stockholm: big studios (each runs its own careers platform)
    { name: 'King', ats: 'phenom', url: 'https://careers.king.com', tags: ['games'] },
    // DICE and EA SEED hire through EA's site; the feed is a keyword search, labelled with `location`.
    { name: 'EA / DICE', ats: 'avature', url: 'https://jobs.ea.com/en_US/careers', searches: ['Stockholm'], location: 'Stockholm, Sweden', tags: ['games'] },
    // Mojang hires through Microsoft's careers site.
    { name: 'Mojang (Minecraft)', ats: 'microsoft', searches: ['Mojang', 'Minecraft'], tags: ['games'] },

    // ── Stockholm / Sweden: games
    { name: 'Arrowhead Game Studios', ats: 'teamtailor', url: 'https://jobs.arrowheadgamestudios.com', tags: ['games'] },
    { name: 'Thunderful', ats: 'teamtailor', url: 'https://career.thunderful.com', tags: ['games'] },
    { name: 'Embark Studios', ats: 'teamtailor', slug: 'embarkstudios', tags: ['games'] },
    { name: 'Paradox Interactive', ats: 'teamtailor', slug: 'paradox-interactive', tags: ['games'] },
    { name: 'Avalanche Studios', ats: 'lever', slug: 'avalanchestudios', tags: ['games'] },
    { name: 'Fatshark', ats: 'teamtailor', slug: 'fatshark', tags: ['games'] },
    { name: 'Sharkmob', ats: 'teamtailor', slug: 'sharkmob', tags: ['games'] },
    { name: 'Starbreeze', ats: 'teamtailor', slug: 'starbreeze', tags: ['games'] },
    { name: 'Stillfront Group', ats: 'teamtailor', slug: 'stillfrontgroup', tags: ['games'] },
    { name: 'Raw Fury', ats: 'teamtailor', slug: 'rawfury', tags: ['games'] },
    { name: 'Coffee Stain', ats: 'teamtailor', slug: 'coffeestainstudios', tags: ['games'] },
    { name: 'Liquid Swords', ats: 'teamtailor', slug: 'liquidswords', tags: ['games'] },
    { name: 'Neon Giant', ats: 'teamtailor', slug: 'neongiant', tags: ['games'] },
    { name: 'Snowprint Studios', ats: 'teamtailor', slug: 'snowprintstudios', tags: ['games'] },
    { name: 'Goodbye Kansas', ats: 'teamtailor', slug: 'goodbyekansas', tags: ['games'] },

    // ── Stockholm / Sweden: music, audio & AI
    { name: 'Soundtrap', ats: 'teamtailor', slug: 'soundtrap', tags: ['music'] },
    { name: 'Storytel', ats: 'teamtailor', slug: 'storytel', tags: ['audio'] },
    { name: 'BookBeat', ats: 'teamtailor', slug: 'bookbeat', tags: ['audio'] },
    { name: 'Nextory', ats: 'teamtailor', slug: 'nextory', tags: ['audio'] },
    { name: 'Teenage Engineering', ats: 'teamtailor', url: 'https://careers.teenage.engineering', tags: ['music'] },
    { name: 'Soundtrack', ats: 'teamtailor', url: 'https://careers.soundtrack.io', tags: ['music'] },
    { name: 'Amuse', ats: 'teamtailor', url: 'https://careers.amuse.io', tags: ['music'] },
    { name: 'Acast', ats: 'teamtailor', url: 'https://careers.acast.com', tags: ['audio'] },
    { name: 'Lovable', ats: 'ashby', slug: 'lovable', tags: ['ai'] },
    // (Spotify and Epidemic Sound, below, are both headquartered in Stockholm.)
    // Not followed (no usable job feed): Hazelight, MachineGames, Toca Boca. Check their sites now and then.

    // ── Music & audio
    { name: 'Spotify', ats: 'lever', slug: 'spotify', tags: ['music'] },
    { name: 'Warner Music Group', ats: 'lever', slug: 'wmg', tags: ['music'] },
    { name: 'Vevo', ats: 'lever', slug: 'vevo', tags: ['music'] },
    { name: 'Musixmatch', ats: 'lever', slug: 'musixmatch', tags: ['music'] },
    { name: 'Splice', ats: 'greenhouse', slug: 'splice', tags: ['music'] },
    { name: 'DistroKid', ats: 'greenhouse', slug: 'distrokid', tags: ['music'] },
    { name: 'Fender', ats: 'greenhouse', slug: 'fender', tags: ['music'] },
    { name: 'Universal Audio', ats: 'greenhouse', slug: 'universalaudio', tags: ['music'] },
    { name: 'Yousician', ats: 'greenhouse', slug: 'yousician', tags: ['music'] },
    { name: 'Epidemic Sound', ats: 'ashby', slug: 'epidemic-sound', tags: ['music'] },
    { name: 'Believe', ats: 'smartrecruiters', slug: 'Believe', tags: ['music'] },
    { name: 'Focusrite Group', ats: 'workable', slug: 'focusrite', tags: ['music'] },

    // Music × AI / audio AI
    { name: 'Suno', ats: 'ashby', slug: 'suno', tags: ['music', 'ai'] },
    { name: 'Udio', ats: 'greenhouse', slug: 'udio', tags: ['music', 'ai'] },
    { name: 'ElevenLabs', ats: 'ashby', slug: 'elevenlabs', tags: ['audio', 'ai'] },
    { name: 'Stability AI', ats: 'greenhouse', slug: 'stabilityai', tags: ['ai'] },

    // Games
    { name: 'Epic Games', ats: 'greenhouse', slug: 'epicgames', tags: ['games'] },
    { name: 'Riot Games', ats: 'greenhouse', slug: 'riotgames', tags: ['games'] },
    { name: 'Roblox', ats: 'greenhouse', slug: 'roblox', tags: ['games'] },
    { name: 'Rockstar Games', ats: 'greenhouse', slug: 'rockstargames', tags: ['games'] },
    { name: 'Naughty Dog', ats: 'greenhouse', slug: 'naughtydog', tags: ['games'] },
    { name: 'Insomniac Games', ats: 'greenhouse', slug: 'insomniac', tags: ['games'] },
    { name: 'Bungie', ats: 'greenhouse', slug: 'bungie', tags: ['games'] },
    { name: 'Gearbox', ats: 'greenhouse', slug: 'gearbox', tags: ['games'] },
    { name: 'Remedy Entertainment', ats: 'greenhouse', slug: 'remedy', tags: ['games'] },
    { name: '2K', ats: 'greenhouse', slug: '2k', tags: ['games'] },
    { name: 'Krafton', ats: 'greenhouse', slug: 'krafton', tags: ['games'] },
    { name: 'Scopely', ats: 'greenhouse', slug: 'scopely', tags: ['games'] },
    { name: 'Larian Studios', ats: 'lever', slug: 'larian', tags: ['games'] },
    { name: 'Supercell', ats: 'ashby', slug: 'supercell', tags: ['games'] },
    { name: 'HoYoverse', ats: 'ashby', slug: 'hoyoverse', tags: ['games'] },
    { name: 'Ubisoft', ats: 'smartrecruiters', slug: 'Ubisoft2', tags: ['games'] },
    { name: 'Discord', ats: 'greenhouse', slug: 'discord', tags: ['games'] },
    { name: 'Twitch', ats: 'greenhouse', slug: 'twitch', tags: ['games'] },
  ],

  // ── Public job boards ─────────────────────────────────────────────────────
  boards: {
    platsbanken: true, // Sweden's national job board (Arbetsförmedlingen), see `platsbanken` below
    remotive: true, // remote jobs, all categories (one request; they ask for max ~4 fetches a day)
    remoteok: true, // remote jobs (newest + music / audio / game tags)
    himalayas: true, // remote jobs, searched with `searches` below
    arbeitnow: true, // Europe-heavy (lots of Germany); `arbeitnowPages` pages of ~100 newest jobs
  },
  arbeitnowPages: 3,

  // Platsbanken: every search runs in each region below, plus once for remote ads anywhere in Sweden.
  // Region codes: 01 Stockholm, 03 Uppsala, 12 Skåne, 14 Västra Götaland (Gothenburg).
  platsbanken: {
    regions: ['01'],
    includeRemote: true,
    searches: [
      'musik', 'music', 'ljud', 'audio', 'sound', 'skivbolag', 'podcast',
      'spelutvecklare', 'spelutveckling', 'game developer', 'game', 'gaming', 'unity', 'unreal', 'godot',
      'utvecklare', 'developer', 'programmerare', 'software engineer', 'AI', 'machine learning',
      'creative technologist',
      // junior / entry routes in
      'junior utvecklare', 'junior developer', 'praktik', 'praktikant', 'internship', 'trainee', 'nyexaminerad',
      'speltestare', 'QA tester',
      // music rights & publishing (STIM, SAMI, publishers and labels usually advertise here)
      'musikförlag', 'upphovsrätt', 'royalty', 'rättigheter musik', 'STIM',
      // support work (on-site in Stockholm or remote anywhere in Sweden)
      'kundtjänst', 'kundsupport', 'kundservice', 'IT-support', 'helpdesk', 'servicedesk', 'supporttekniker', 'customer support',
      // other fits: hands-on audio, language work, media production, admin, moderation
      'ljudtekniker', 'eventtekniker', 'produktionsassistent', 'redigerare', 'lokalisering', 'översättare', 'språkgranskare',
      'svensktalande', 'administratör', 'koordinator', 'moderator',
    ],
  },

  // Search terms for boards that support search (Himalayas).
  searches: [
    'music',
    'audio',
    'sound designer',
    'composer',
    'music technology',
    'record label',
    'music publishing',
    'music rights',
    'game developer',
    'game designer',
    'gameplay programmer',
    'unity developer',
    'unreal engine',
    'godot',
    'audio programmer',
    'creative technologist',
    'junior developer',
    'game tester',
    'customer support',
    'technical support',
    'chat support',
    'swedish',
    'localization',
    'content moderator',
    'audio editor',
    'podcast',
  ],

  // ── What counts as a good match ───────────────────────────────────────────
  // Terms are matched as whole words, case-insensitive:
  //   'royalt*'     starts with   (royalty, royalties)
  //   '*utvecklare' ends with     (systemutvecklare, webbutvecklare: handy for Swedish compounds)
  //   '*musik*'     contains      (musiker, filmmusik, musikproducent)
  //   terms       → count in the job title (titleWeight) and the description (textWeight, once)
  //   titleTerms  → count in the title only (for words that are noisy in descriptions)
  profile: {
    categories: {
      music: {
        label: 'Music & Audio',
        titleWeight: 6,
        textWeight: 2,
        terms: [
          'music*', 'musician*', 'audio*', 'composer*', 'composition', 'songwrit*', 'song*', 'lyric*',
          'soundtrack*', 'sound design*', 'sound engineer*', 'sound effects',
          'record label*', 'label services', 'a&r', 'artist relations', 'artist development',
          'artist services', 'artist manag*', 'music publish*', 'royalt*', 'sync licens*',
          'neighbouring rights', 'neighboring rights', 'mixing', 'mastering', 'daw', 'synth', 'synths', 'synthesizer*',
          'midi', 'foley', 'wwise', 'fmod', 'acoustic*', 'podcast*', 'playlist*', 'concert*',
          'live music', 'festival*', 'touring', 'orchestra', 'orchestral', 'ableton', 'pro tools',
          'logic pro', 'spatial audio', 'dolby atmos',
          // Swedish
          '*musik*', '*ljud*', 'låtskriv*', 'kompositör*', 'skivbolag*', 'podd*', 'ljudbok*',
        ],
        titleTerms: [
          'sound*', 'voice', 'vocal*', 'band', 'dsp', 'radio', 'speech', 'label', 'copyright*', 'rights', 'metadata', 'catalogue*',
          'catalog manager', 'catalog coordinator', 'catalog specialist', 'catalog operations', 'music catalog*',
          'music licens*', 'upphovsrätt*', 'rättighet*',
        ],
      },
      games: {
        label: 'Games',
        titleWeight: 5,
        textWeight: 2,
        terms: [
          'game*', 'gaming', 'gamer*', 'unity', 'unreal', 'ue4', 'ue5', 'godot', 'esports', 'e-sports',
          'level design*', 'playstation', 'xbox', 'nintendo', 'multiplayer', 'liveops', 'live ops',
          'roblox', 'fortnite',
          // Swedish
          '*spelutveckl*', 'spelstudio*', 'spelbransch*', 'spelföretag*', '*dataspel*', '*datorspel*', 'tv-spel*',
        ],
        titleTerms: ['player*', 'world build*', 'combat', 'quest*'],
      },
      tech: {
        label: 'Tech',
        titleWeight: 4,
        textWeight: 1,
        terms: [
          'software*', 'engineer*', 'engineering', 'developer*', 'programmer*', 'programming',
          'full stack', 'fullstack', 'backend', 'back end', 'frontend', 'front end', 'web', 'mobile',
          'ios', 'android', 'devops', 'sre', 'site reliability', 'cloud', 'data scien*', 'data engineer*',
          'data analy*', 'analytics', 'quality assurance', 'test automation', 'automation',
          'python', 'javascript', 'typescript', 'c++', 'c#', 'rust', 'golang', 'java', 'sql',
          'technolog*', 'entwickler*', 'informatik*',
          // Swedish (not plain '*utvecklare': that also catches affärsutvecklare = business developer)
          'utvecklare', '*systemutvecklare', '*mjukvaru*', '*programvaru*', '*programmerare', '*webbutvecklare',
          'apputvecklare', 'frontendutvecklare', 'backendutvecklare', 'fullstackutvecklare', 'dataanalytiker',
          'dataingenjör*', 'it-tekniker',
        ],
        titleTerms: ['qa', 'tester*', 'technical', 'tools', 'platform', 'systems', 'security', 'infrastructure', 'it support'],
      },
      ai: {
        label: 'AI',
        titleWeight: 3,
        textWeight: 1,
        terms: [
          'ai', 'a.i.', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'generative',
          'genai', 'llm*', 'neural', 'computer vision', 'nlp', 'research scien*',
          'artificiell intelligens', 'maskininlärning',
        ],
        titleTerms: [],
      },
      support: {
        label: 'Support',
        // General IT / customer support (chat, phone, helpdesk): good temporary or remote work.
        titleWeight: 4,
        textWeight: 0,
        terms: [],
        titleTerms: [
          'customer support', 'customer service', 'customer care', 'customer success', 'customer experience',
          'support agent', 'support specialist', 'support representative', 'support engineer', 'support technician',
          'technical support', 'tech support', 'it support', 'chat support', 'player support', 'helpdesk',
          'help desk', 'service desk', 'first line', '1st line', '2nd line', 'call center', 'contact center',
          'kundtjänst*', 'kundsupport*', 'kundservice*', 'kundmottag*', 'supporttekniker', 'it-tekniker',
          'it-support*', 'servicedesk*', 'helpdesk*', 'första linjen', 'kundrådgivare', 'supportmedarbetare',
        ],
      },
      otherfit: {
        label: 'Other fits',
        // Non-tech work your background fits: hands-on audio, Swedish/English language work,
        // media production support, admin/coordination and moderation.
        titleWeight: 4,
        textWeight: 0,
        terms: [],
        titleTerms: [
          'audio editor', 'sound technician', 'audio technician', 'ljudtekni*', 'podcast producer', 'podcast editor',
          'live sound', 'event technician', 'eventtekni*', 'scentekni*', 'broadcast*', 'sändningstekni*',
          'production assistant', 'produktionsassistent*', 'studio assistant', 'studio technician', 'video editor',
          'redigerare', 'klippare', 'localization', 'localisation', 'lokaliser*', 'translator', 'översättare',
          'linguist', 'proofreader', 'språkgranskare', 'language tester', 'lqa', 'swedish speaking',
          'svensktalande', 'administrator', 'administratör', 'administrat*', 'office coordinator', 'office assistant',
          'kontorsassistent', 'operations coordinator', 'operations assistant', 'koordinator', 'data entry',
          'registrator', 'content moderator', 'community moderator', 'moderator',
        ],
      },
      creative: {
        label: 'Creative',
        titleWeight: 2,
        textWeight: 0,
        terms: [],
        titleTerms: [
          'design*', 'artist*', 'art', 'animat*', 'writer*', 'narrative', 'producer*', 'creative*',
          'content*', 'video*', 'vfx', 'ux', 'ui', 'illustrat*', 'editor*', 'product manag*',
          'product owner', 'project manag*', 'program manag*', 'coordinator*', 'community*',
          'producent', 'formgivare', 'grafisk*', 'animatör*', 'projektledare', 'kreatör*',
        ],
      },
    },

    // Extra points for every job at a company with this tag.
    companyTagBonus: { music: 4, audio: 3, games: 2, ai: 1 },

    // Extra points when a job blends music/audio with games, tech or AI: your sweet spot.
    blendBonus: 5,

    // Points by source. Aggregator boards re-list jobs collected from elsewhere and check
    // them less than a company's own careers site, so they rank a little lower.
    // Platsbanken (run by Arbetsförmedlingen) stays neutral.
    sourceBonus: { himalayas: -2, remoteok: -2, remotive: -2, arbeitnow: -2 },

    // ── Where you can work ──
    location: {
      label: 'Stockholm', // shown on job cards
      // Your commute area (on-site / hybrid is fine here).
      home: [
        'stockholm*', 'solna', 'sundbyberg', 'kista', 'nacka', 'lidingö', 'sollentuna', 'täby', 'danderyd',
        'huddinge', 'järfälla', 'bromma', 'södertälje', 'uppsala',
      ],
      // Your country: remote jobs limited to it are fine; on-site elsewhere in it counts as "Sweden".
      country: ['sweden', 'sverige', 'swedish'],
      // Remote jobs open to any of these regions are ones you can take.
      remoteRegions: [
        'worldwide', 'anywhere', 'global*', 'international', 'europe', 'european union', 'eu', 'eea', 'emea',
        'nordic*', 'scandinavia*', 'cet', 'cest', 'utc+1', 'utc+2', 'gmt+1', 'gmt+2',
      ],
      // Points per location type. Negative values push jobs you can't realistically take
      // down (and often below minScore, so they never clutter your list).
      bonus: {
        home: 4, // on-site / hybrid in Stockholm
        remote: 3, // remote, open to Sweden / Europe / worldwide
        'remote-unclear': 1, // says "Remote" but not from where; check the posting
        country: 1, // on-site elsewhere in Sweden
        unknown: 0,
        'remote-elsewhere': -3, // e.g. "Remote – US only"
        elsewhere: -3, // on-site in another country
      },
    },

    // ── How realistic is the job for you? ──
    // You: freelance producer & publishing founder, Salt full-stack bootcamp (JS/C#) + 4 months
    // as a consultant, now making games in Godot. So junior roles rank up and senior ones down.
    experience: {
      // Points by the level in the job title.
      levelBonus: { entry: 5, senior: -5, lead: -8, thesis: 0 },
      // Points by the years of experience the posting asks for (first band that fits wins).
      yearsBonus: [
        { max: 2, points: 2 }, // "0–2 years", "no experience required"
        { max: 4, points: -2 }, // "3+ years"
        { max: 99, points: -5 }, // "5+ years"
      ],
      // PhD-level roles (mentions of a PhD / doctorate, research scientist titles).
      unrealisticTerms: ['phd', 'ph.d.', 'doctorate', 'doctoral', 'postdoc*', 'postdoktor*', 'doktorand*', 'research scientist*'],
      unrealisticBonus: -8,
      // Not a specific opening: talent pools and open applications posted by recruiters or on job
      // boards. (An open application on a company's own careers site isn't penalised: in Sweden
      // that's a normal way in.)
      pipelineTerms: [
        'talent pool', 'talent community', 'talent network', 'open application', 'spontaneous application',
        'general application', 'spontanansökan', 'öppen ansökan', 'intresseanmälan',
      ],
      pipelineBonus: -4,
      // Your skills: +skillPoints per one mentioned in the posting, up to skillMax.
      mySkills: [
        'javascript', 'typescript', 'reactjs', 'react.js', 'react native', 'node.js', 'nodejs', 'c#', '.net', 'asp.net', 'html', 'css', 'tdd', 'agile',
        'godot', 'gdscript', 'unity', 'pro tools', 'logic pro', 'ableton', 'music publish*', 'royalt*',
        'music rights', 'music production', 'musikproduktion', 'metadata', 'isrc', 'iswc', 'ddex', 'stim',
        'world of warcraft', 'mmo', 'mmorpg', 'raid', 'raiding', 'theorycraft*', 'excel', 'google sheets', 'spreadsheet*',
      ],
      skillPoints: 1,
      skillMax: 4,

      // Developer/engineer titles NOT marked junior (and not asking ≤2 years) usually expect
      // professional development experience; audio engineering and QA roles are exempt.
      unmarkedTechBonus: -5,

      // Role types (matched in the title) by how well they fit where you are now.
      // Each group counts once; groups can stack. Mirrors "Where you fit" in the CV doc.
      roleFit: [
        {
          label: 'hands-on audio work you can do now',
          points: 4,
          terms: [
            'audio editor', 'sound technician', 'audio technician', 'ljudtekni*', 'podcast producer', 'podcast editor',
            'mixing engineer', 'mastering engineer', 'recording engineer', 'live sound', 'eventtekni*', 'scentekni*',
          ],
        },
        {
          label: 'needs a language you do not speak',
          points: -10,
          terms: [
            'norwegian', 'danish', 'finnish', 'german', 'french', 'spanish', 'italian', 'portuguese', 'dutch', 'polish',
            'arabic', 'turkish', 'russian', 'ukrainian', 'japanese', 'korean', 'chinese', 'mandarin', 'cantonese',
            'hindi', 'urdu', 'bengali', 'persian', 'farsi', 'hebrew', 'greek', 'czech', 'hungarian', 'romanian', 'thai',
            'vietnamese', 'indonesian', 'tagalog', 'swahili', 'amharic', 'somali', 'wolof', 'malagasy', 'shona',
            'oromo', 'mongolian', 'norsk*', 'dansk*', 'finsk*', 'tysk*', 'fransk*', 'spansk*', 'italiensk*',
          ],
        },
        {
          label: 'Swedish + English language work',
          points: 4,
          // Only when the title is about Swedish/English (or is a Swedish-language title).
          requires: ['swedish', 'svensk*', 'english', 'engelsk*', 'nordic', 'scandinavia*', 'översättare', 'språkgranskare'],
          terms: ['localization', 'localisation', 'lokaliser*', 'translator', 'översättare', 'linguist', 'proofreader', 'språkgranskare', 'language tester', 'lqa', 'swedish speaking', 'svensktalande'],
        },
        {
          label: 'music-side role you can do now (curation, catalogue, rights, artist services)',
          points: 6,
          requiresMusic: true, // only at a music/audio company or with music in the title
          terms: [
            'curat*', 'catalog*', 'catalogue*', 'metadata', 'rights', 'royalt*', 'licens*', 'sync', 'a&r',
            'artist relations', 'artist services', 'artist support', 'artist development', 'label services',
            'label manager', 'label assistant', 'content operations', 'music operations', 'music coordinator',
            'music supervisor', 'music programmer', 'playlist*', 'editorial', 'upphovsrätt*', 'rättighet*',
            'musikförlag*', 'skivbolag*',
          ],
        },
        {
          label: 'QA / testing role',
          points: 5,
          terms: ['qa', 'quality assurance', 'tester*', 'test analyst', 'playtest*', 'speltestare', 'game tester'],
        },
        {
          label: 'games role your player background supports (design, live ops, community)',
          points: 3,
          terms: [
            'game design*', 'systems design*', 'combat design*', 'encounter design*', 'level design*',
            'economy design*', 'balance', 'live ops', 'liveops', 'game analyst', 'player support',
            'player experience', 'community manager', 'community specialist', 'esports',
          ],
        },
        {
          label: 'AI music/audio evaluation work',
          points: 4,
          terms: ['annotat*', 'evaluator*', 'rater', 'ai trainer', 'music expert', 'audio expert', 'data label*'],
        },
        {
          label: 'support role',
          points: 3,
          terms: [
            'customer support', 'support agent', 'support specialist', 'customer success', 'player support',
            'community support', 'kundtjänst*', 'kundsupport*', 'kundservice*', 'helpdesk*', 'servicedesk*', 'support',
          ],
        },
        {
          label: 'specialist engineering (a stretch for now)',
          points: -4,
          terms: [
            'backend', 'back end', 'c++', 'embedded', 'firmware', 'devops', 'sre', 'site reliability',
            'infrastructure', 'platform engineer*', 'data engineer*', 'analytics engineer*', 'machine learning',
            'ml', 'data scientist*', 'security', 'architect', 'android', 'ios', 'mechanical', 'electrical',
            'thermal', 'hardware', 'reverse engineer*', 'anti-cheat', 'physics', 'rendering', 'graphics',
            'network engineer*', 'solutions engineer*', 'forward deployed',
          ],
        },
        {
          label: 'visual art role (a different skill set)',
          points: -5,
          terms: [
            'technical artist', 'ui artist', 'game artist', '2d artist', '2d game artist', '3d artist', 'concept artist',
            'character artist', 'environment artist', 'vfx artist', 'lighting artist', 'texture artist',
            'animator*', 'animatör*', 'illustrator*', 'art director', 'art lead',
          ],
        },
        {
          label: 'outside your field (finance, legal, sales, HR)',
          points: -5,
          terms: [
            'tax', 'accountant*', 'accounting', 'finance', 'financial', 'controller', 'fp&a', 'treasury',
            'legal', 'counsel', 'lawyer', 'compliance', 'recruit*', 'talent acquisition', 'people partner', 'hr',
            'payroll', 'procurement', 'sales', 'sälj*', 'försäljning*', 'account executive', 'business development', 'partnerships',
            'product developer', // in retail (H&M etc.) this is garment development, not software
            'investor relations', 'facilities',
          ],
        },
      ],

      // Title words that set the level (checked in this order: lead, senior, thesis, entry).
      leadTerms: [
        'principal', 'staff', 'lead', 'head', 'director', 'vp', 'vice president', 'chief', 'chef',
        'engineering manager', 'general manager', 'managing director',
      ],
      seniorTerms: ['senior', 'sr', 'sr.', 'experienced', 'erfaren*', 'seasoned', 'iii', 'iv'],
      thesisTerms: ['thesis', 'master thesis', 'examensarbete*', 'exjobb*'],
      entryTerms: [
        'junior', 'jr', 'jr.', 'intern', 'interns', 'internship*', 'graduate', 'grad', 'entry level', 'trainee', 'apprentice*',
        'assistant', 'werkstudent*', 'praktik*', 'student*', 'nyexaminerad*', 'sommarjobb*', 'summer job',
      ],
    },

    // A job must be in your field: at least this many points from keywords, company and blend
    // (before location / level / experience adjustments). Stops "Junior Sales, Stockholm" showing up.
    minRelevance: 4,

    // Your dream job. Its score becomes 100 and every other job is shown as a percentage of it
    // (capped at 100). Change it and the whole list re-scales on the next refresh.
    perfectJob: {
      title: 'Junior Sound Designer',
      description: 'Music and audio for games. 0-2 years of experience. Pro Tools, Ableton, Godot.',
      location: 'Stockholm, Sweden',
      companyTags: ['music', 'games'],
      source: 'teamtailor',
      kind: 'ats',
    },

    // Jobs scoring below this overall are never added to your list (raw points, before the 0–100 scaling).
    minScore: 5,

    // Titles containing any of these are dropped completely.
    // Teaching roles are excluded because Platsbanken is full of music-teacher ads;
    // delete those entries if you'd consider teaching.
    // Sales jobs that are often low-integrity (cold calling, door to door, commission only).
    excludeTitle: ['telemarket*', 'telefonförsälj*', 'dörrförsälj*', 'door to door', 'commission only', 'provisionsbaserad*', '*lärare', 'lärarvikarie*', 'teacher*', 'förskol*', 'fritidshem*', 'barnskötare', 'rektor', 'elevassistent*'],
  },
};
