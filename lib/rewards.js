// Turns reward descriptions ("5 Golden Keys", "50 Golden Keys in multiple games plus 20 Diamond
// Keys in Borderlands 3", "Cosmic Skin") into per-title counts for the rewards report.

import { TITLES, detectTitles, titleKey } from './catalog.js';

export const KEY_TYPES = [
  { id: 'diamond', name: 'Diamond Keys', one: 'Diamond Key', rx: /diamond/i },
  { id: 'golden', name: 'Golden Keys', one: 'Golden Key', rx: /golden/i },
  { id: 'skeleton', name: 'Skeleton Keys', one: 'Skeleton Key', rx: /skeleton/i },
];

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
// Allows a few words between the key type and "Keys" ("50 Golden PAX West Keys") and text glued
// onto the end by code sites ("1 Golden Key2K Japan").
const KEY_RX = /(?:\b(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|fifty|hundred)\s+)?(golden|diamond|skeleton)\s+(?:[a-z0-9'’-]+\s+){0,3}?keys?(?![a-z])/gi;
const ITEM_RX = /\b(skin|head|heads|trinket|weapon|gun|emote|echo theme|theme|decoration|cosmetic|outfit|vehicle|shield|grenade|class mod|artifact|banner|vault card|xp|boost|room|pet|spray|mod|pack|bundle|loot)\b/i;

/**
 * Parse a reward description for one title.
 * Returns { keys: { golden, diamond, skeleton }, item: string|null }.
 * A key mention followed by specific game names only counts for those games.
 */
export function parseReward(text, titleId) {
  const keys = { golden: 0, diamond: 0, skeleton: 0 };
  const src = String(text || '').trim();
  if (!src || /^unknown reward$/i.test(src)) return { keys, item: null, unknown: true };

  const mentions = [...src.matchAll(KEY_RX)];
  mentions.forEach((m, i) => {
    // The text after this mention (up to the next one) says which games it's for, if any.
    const after = src.slice(m.index + m[0].length, i + 1 < mentions.length ? mentions[i + 1].index : undefined);
    const games = detectTitles(after);
    if (games.length && titleId && !games.includes(titleId)) return;
    const n = m[1] ? (/^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()] || 1) : 1;
    keys[m[2].toLowerCase()] += n;
  });

  let item = null;
  if (!mentions.length) item = tidyItem(src);
  else {
    // "3 Golden Keys and a Skin" – keep the extra item too.
    const rest = src.replace(KEY_RX, ' ').replace(/\b(plus|and|in|for|each|multiple|gearbox|games?|borderlands\s*\d?)\b/gi, ' ');
    if (ITEM_RX.test(rest)) item = tidyItem(src);
  }
  return { keys, item, unknown: false };
}

function tidyItem(s) {
  return s
    .replace(/\b(Skin|skin|Head|head|Cosmetic|cosmetic|Cosmetics|Theme|theme|Trinket|trinket|Emote|emote)(?=[A-Z])/g, '$1: ')
    .replace(/\s+/g, ' ')
    .replace(/[!.]+$/, '')
    .trim()
    .slice(0, 80);
}

const monthKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Build the rewards report from the redemption history.
 * opts: { since (ms or null), platform (service id or null), discovered: { key: name } }
 */
export function buildReport(db, { since = null, platform = null } = {}) {
  const titleInfo = (key, rawName) => {
    const t = TITLES.find((x) => x.id === key);
    return t ? { id: t.id, name: t.name, short: t.short, color: t.color } : { id: key, name: rawName || key.replace(/^raw:/, ''), short: rawName || key.replace(/^raw:/, ''), color: '#8f8474' };
  };
  const empty = () => ({ golden: 0, diamond: 0, skeleton: 0 });
  const totals = { rewards: 0, already: 0, codes: new Set(), keys: empty(), items: 0, unknown: 0, platforms: {} };
  const titles = new Map();
  const months = new Map();
  const recent = [];

  for (const [key, r] of Object.entries(db.redemptions || {})) {
    if (r.status !== 'success' && r.status !== 'redeemed') continue;
    if (since && (r.at || 0) < since) continue;
    if (platform && r.service !== platform) continue;
    const code = key.split('|')[0];
    const c = db.codes?.[code] || {};
    const tKey = titleKey(r.title || key.split('|')[1]);
    const tId = tKey.startsWith('raw:') ? null : tKey;
    const parsed = parseReward(c.reward, tId);
    const keyCount = parsed.keys.golden + parsed.keys.diamond + parsed.keys.skeleton;

    if (!titles.has(tKey)) titles.set(tKey, { ...titleInfo(tKey, r.title), rewards: 0, already: 0, keys: empty(), items: [], unknown: 0, platforms: {}, last: 0 });
    const t = titles.get(tKey);
    const row = { at: r.at, code, reward: c.reward || '', title: t.name, titleId: tKey, service: r.service, status: r.status, keys: parsed.keys, item: parsed.item };
    recent.push(row);

    if (r.status === 'redeemed') {
      t.already++;
      totals.already++;
      continue;
    }
    totals.rewards++;
    totals.codes.add(code);
    t.rewards++;
    t.last = Math.max(t.last, r.at || 0);
    t.platforms[r.service] = (t.platforms[r.service] || 0) + 1;
    totals.platforms[r.service] = (totals.platforms[r.service] || 0) + 1;
    for (const k of Object.keys(parsed.keys)) {
      t.keys[k] += parsed.keys[k];
      totals.keys[k] += parsed.keys[k];
    }
    if (parsed.item) {
      t.items.push({ name: parsed.item, at: r.at, service: r.service, code });
      totals.items++;
    }
    if (parsed.unknown || (!keyCount && !parsed.item)) {
      t.unknown++;
      totals.unknown++;
    }
    const mk = monthKey(r.at || Date.now());
    if (!months.has(mk)) months.set(mk, { month: mk, ...empty(), items: 0, rewards: 0 });
    const m = months.get(mk);
    for (const k of Object.keys(parsed.keys)) m[k] += parsed.keys[k];
    if (parsed.item) m.items++;
    m.rewards++;
  }

  // Last 12 months, oldest first, including empty months so the time axis is honest.
  const now = new Date();
  const monthList = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = monthKey(d);
    monthList.push(months.get(mk) || { month: mk, ...empty(), items: 0, rewards: 0 });
  }

  const order = TITLES.map((x) => x.id);
  return {
    generatedAt: Date.now(),
    totals: { ...totals, codes: totals.codes.size },
    titles: [...titles.values()].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)),
    months: monthList,
    recent: recent.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 500),
    keyTypes: KEY_TYPES.map(({ id, name, one }) => ({ id, name, one })),
  };
}
