// Known SHiFT-enabled titles and platforms.
// SHiFT itself is the source of truth: any title it reports that is not listed
// here is still tracked and shown in the UI as a "discovered" title.

export const TITLES = [
  {
    id: 'bl4',
    name: 'Borderlands 4',
    short: 'BL4',
    steamAppId: 1285190,
    color: '#ffd400',
    aliases: ['Borderlands 4', 'BL4', 'Borderlands4'],
    mentalmars: 'https://mentalmars.com/game-news/borderlands-4-shift-codes/',
  },
  {
    id: 'ttw',
    name: "Tiny Tina's Wonderlands",
    short: 'TTW',
    steamAppId: 1286680,
    color: '#b979ff',
    aliases: ["Tiny Tina's Wonderlands", 'Tiny Tinas Wonderlands', 'Wonderlands', 'TTW'],
    mentalmars: 'https://mentalmars.com/game-news/tiny-tinas-wonderlands-shift-codes/',
  },
  {
    id: 'bl3',
    name: 'Borderlands 3',
    short: 'BL3',
    steamAppId: 397540,
    color: '#ff7a1a',
    aliases: ['Borderlands 3', 'BL3', 'Borderlands3'],
    mentalmars: 'https://mentalmars.com/game-news/borderlands-3-golden-keys/',
  },
  {
    id: 'tps',
    name: 'Borderlands: The Pre-Sequel',
    short: 'TPS',
    steamAppId: 261640,
    color: '#5ec8f2',
    aliases: ['Borderlands: The Pre-Sequel', 'Borderlands The Pre-Sequel', 'The Pre-Sequel', 'Pre-Sequel', 'Presequel', 'BLTPS', 'TPS'],
    mentalmars: 'https://mentalmars.com/game-news/bltps-golden-keys/',
  },
  {
    id: 'bl2',
    name: 'Borderlands 2',
    short: 'BL2',
    steamAppId: 49520,
    color: '#e8c547',
    aliases: ['Borderlands 2', 'BL2', 'Borderlands2'],
    mentalmars: 'https://mentalmars.com/game-news/borderlands-2-golden-keys/',
  },
  {
    id: 'bl1',
    name: 'Borderlands: Game of the Year Edition',
    short: 'BL GOTY',
    steamAppId: 729040,
    color: '#c79a5b',
    aliases: [
      'Borderlands: Game of the Year Edition',
      'Borderlands Game of the Year Edition',
      'Borderlands Game of the Year Enhanced',
      'Borderlands GOTY',
      'Borderlands GOTY Enhanced',
      'Borderlands 1',
      'BL1',
    ],
    mentalmars: 'https://mentalmars.com/game-news/borderlands-golden-keys/',
  },
];

export const PLATFORMS = [
  { id: 'steam', name: 'Steam', glyph: 'ST', aliases: ['steam', 'pc'] },
  { id: 'epic', name: 'Epic Games', glyph: 'EG', aliases: ['epic', 'epicgames', 'egs'] },
  { id: 'psn', name: 'PlayStation', glyph: 'PS', aliases: ['psn', 'playstation', 'ps4', 'ps5', 'sony'] },
  { id: 'xboxlive', name: 'Xbox', glyph: 'XB', aliases: ['xbox', 'xboxlive', 'xbl', 'microsoft'] },
  { id: 'nintendo', name: 'Nintendo Switch', glyph: 'NS', aliases: ['nintendo', 'switch', 'nintendoswitch'] },
];

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const aliasIndex = new Map();
for (const t of TITLES) for (const a of [t.name, ...t.aliases]) aliasIndex.set(norm(a), t.id);

/** Map any free-form game name to a known title id, or null. */
export function resolveTitle(name) {
  const n = norm(name);
  if (!n) return null;
  if (aliasIndex.has(n)) return aliasIndex.get(n);
  if (n.includes('wonderlands')) return 'ttw';
  if (n.includes('presequel')) return 'tps';
  if (n.includes('borderlands4')) return 'bl4';
  if (n.includes('borderlands3')) return 'bl3';
  if (n.includes('borderlands2')) return 'bl2';
  if (n.includes('gameoftheyear') || n.includes('goty')) return 'bl1';
  return null;
}

/** Stable key for a title as SHiFT reports it (known id, or raw:<normalized>). */
export const titleKey = (name) => resolveTitle(name) || `raw:${norm(name)}`;

/** Map a platform/service string to a known platform id ("universal" -> null). */
export function resolvePlatform(name) {
  const n = norm(name);
  if (!n || n === 'universal' || n === 'all' || n === 'any') return null;
  for (const p of PLATFORMS) if (p.id === n || p.aliases.includes(n)) return p.id;
  return n;
}

/** Detect which titles a piece of free text is talking about. */
export function detectTitles(text) {
  const s = ` ${String(text || '').toLowerCase()} `;
  const found = new Set();
  const rx = [
    ['bl4', /borderlands\s*4|\bbl4\b/],
    ['bl3', /borderlands\s*3|\bbl3\b/],
    ['bl2', /borderlands\s*2|\bbl2\b/],
    ['tps', /pre-?\s?sequel|\btps\b|\bbltps\b/],
    ['ttw', /wonderlands|\bttw\b/],
    ['bl1', /game of the year|\bgoty\b|\bbl1\b/],
  ];
  for (const [id, r] of rx) if (r.test(s)) found.add(id);
  return [...found];
}

export const CODE_RX = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/gi;

/** Extract unique, upper-cased SHiFT codes from any text. */
export function extractCodes(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(CODE_RX)) {
    const c = m[0].toUpperCase();
    // Reject obvious non-codes such as XXXXX-XXXXX-... placeholders.
    if (/^(X{5}-){4}X{5}$/.test(c) || /^(0{5}-){4}0{5}$/.test(c)) continue;
    out.add(c);
  }
  return [...out];
}
