// Turns reward descriptions ("5 Golden Keys", "50 Golden Keys in multiple games plus 20 Diamond
// Keys in Borderlands 3", "Cosmic Skin") into per-title counts for the rewards report.

import { TITLES, detectTitles, titleKey } from './catalog.js';

export const KEY_TYPES = [
  { id: 'diamond', name: 'Diamond Keys', one: 'Diamond Key', rx: /diamond/i },
  { id: 'golden', name: 'Golden Keys', one: 'Golden Key', rx: /golden/i },
  { id: 'skeleton', name: 'Skeleton Keys', one: 'Skeleton Key', rx: /skeleton/i },
];

const TITLE_IDS = new Set(TITLES.map((t) => t.id));
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
// Allows a few words between the key type and "Keys" ("50 Golden PAX West Keys"), text glued
// onto the end by code sites ("1 Golden Key2K Japan") and the "x3 Golden Keys" / "Golden Key x5"
// styles some guides use.
// Groups: 1 = leading count, 2 = "x3" count, 3 = key type, 4 = trailing "x5" count.
const KEY_RX = /(?:\b(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|fifty|hundred)\s*[x×]?\s+|\b[x×](\d{1,3})\s+)?(golden|diamond|skeleton)\s+(?:[a-z0-9'’-]+\s+){0,3}?keys?(?![a-z])(?:\s*\(?[x×]\s?(\d{1,3})\b\)?)?/gi;
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
    const n = m[1] ? (/^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()] || 1) : m[2] ? Number(m[2]) : m[4] ? Number(m[4]) : 1;
    let type = m[3].toLowerCase();
    // Shared codes are listed once for several games, but each game gives its own kind of key:
    // Wonderlands calls Golden Keys Skeleton Keys, and only Borderlands 3 has Diamond Keys.
    if (TITLE_IDS.has(titleId)) {
      if (titleId === 'ttw' && type === 'golden') type = 'skeleton';
      else if (titleId !== 'ttw' && type === 'skeleton') type = 'golden';
      else if (titleId !== 'bl3' && type === 'diamond') return;
    }
    keys[type] += n;
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

// Cosmetic and item types, most specific first ("ECHO-4 Drone Skin" is a drone skin, not a
// character skin). Shown in the report and explained in Help → Rewards guide.
export const ITEM_KINDS = [
  { id: 'head', name: 'Heads', one: 'Head', rx: /\bheads?\b/i },
  { id: 'drone', name: 'ECHO-4 drone cosmetics', one: 'ECHO-4 drone cosmetic', rx: /\becho-?4\b|\bdrone\b/i },
  { id: 'weapon', name: 'Weapon skins', one: 'Weapon skin', rx: /\b(weapon|gun)\s+(skin|paint|cosmetic)s?\b/i },
  { id: 'trinket', name: 'Weapon trinkets', one: 'Weapon trinket', rx: /\btrinkets?\b/i },
  { id: 'echo', name: 'ECHO themes', one: 'ECHO theme', rx: /\becho\b.*\b(theme|skin)s?\b|\btheme\b/i },
  { id: 'emote', name: 'Emotes', one: 'Emote', rx: /\bemotes?\b/i },
  { id: 'decor', name: 'Room decorations', one: 'Room decoration', rx: /\bdecorations?\b|\bdecor\b/i },
  { id: 'vehicle', name: 'Vehicle skins', one: 'Vehicle skin', rx: /\bvehicle\b/i },
  { id: 'pack', name: 'Cosmetic packs', one: 'Cosmetic pack', rx: /\b(pack|bundle|cosmetics|collection)\b/i },
  { id: 'skin', name: 'Character skins', one: 'Character skin', rx: /\b(skins?|outfit|cosmetic)\b/i },
  { id: 'gear', name: 'Weapons & gear', one: 'Weapon or gear', rx: /\b(weapon|gun|shield|grenade|class mod|artifact|relic|spell|ring|amulet|pistol|rifle|shotgun|smg|launcher|sniper)\b/i },
  { id: 'boost', name: 'Boosts', one: 'Boost', rx: /\b(xp|boost|loot\s+boost|exp)\b/i },
  { id: 'other', name: 'Other rewards', one: 'Other reward', rx: /./ },
];

/** Split an item description into its parts and say what kind of cosmetic each one is. */
export function classifyItem(name) {
  const text = String(name || '').replace(KEY_RX, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const parts = text
    .split(/\s+\+\s+|\s+plus\s+|\s*,\s+(?=[A-Z])/i)
    .map((p) => p.replace(/^((and|a|an)\s+)+/i, '').replace(/^[\s:·–—-]+|[\s:·–—-]+$/g, '').trim())
    .filter((p) => p && !/^(and|in|for|each|multiple|games?)$/i.test(p));
  return parts.map((p) => ({ name: p, kind: (ITEM_KINDS.find((k) => k.rx.test(p)) || ITEM_KINDS.at(-1)).id }));
}

function tidyItem(s) {
  return s
    .replace(/([a-z])(Cosmetic|Skin|Head|Trinket|Emote)\b/g, '$1 $2')
    .replace(/\b(Skin|skin|Head|head|Cosmetic|cosmetic|Cosmetics|Theme|theme|Trinket|trinket|Emote|emote)(?=[A-Z“"])/g, '$1: ')
    .replace(/\s*\((new|updated|new!)\)\s*/gi, ' ')
    .replace(/^\s*(?:[x×]\d{1,3}|\d{1,3}\s*[x×])\s+/i, '')
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
export function buildReport(db, { since = null, platform = null, titleIds = null, wants = () => true } = {}) {
  // platform: one service id, a list of them, or null for all. titleIds: a list, or null for all.
  const plats = platform == null ? null : new Set([].concat(platform));
  const onPlatform = (svc) => !plats || plats.has(svc);
  const onTitle = (tk) => !titleIds || titleIds.includes(tk);
  const titleInfo = (key, rawName) => {
    const t = TITLES.find((x) => x.id === key);
    return t ? { id: t.id, name: t.name, short: t.short, color: t.color } : { id: key, name: rawName || key.replace(/^raw:/, ''), short: rawName || key.replace(/^raw:/, ''), color: '#8f8474' };
  };
  const empty = () => ({ golden: 0, diamond: 0, skeleton: 0 });
  const totals = { rewards: 0, already: 0, codes: new Set(), keys: empty(), items: 0, unknown: 0, platforms: {}, kinds: {} };
  const cosmetics = [];
  const titles = new Map();
  const months = new Map();
  const recent = [];

  for (const [key, r] of Object.entries(db.redemptions || {})) {
    if (r.status !== 'success' && r.status !== 'redeemed') continue;
    if (since && (r.at || 0) < since) continue;
    if (!onPlatform(r.service)) continue;
    const code = key.split('|')[0];
    const c = db.codes?.[code] || {};
    const tKey = titleKey(r.title || key.split('|')[1]);
    if (!onTitle(tKey)) continue;
    const tId = tKey.startsWith('raw:') ? null : tKey;
    const parsed = parseReward(c.reward, tId);
    const keyCount = parsed.keys.golden + parsed.keys.diamond + parsed.keys.skeleton;

    if (!titles.has(tKey)) titles.set(tKey, { ...titleInfo(tKey, r.title), rewards: 0, already: 0, keys: empty(), items: [], kinds: {}, unknown: 0, platforms: {}, last: 0 });
    const t = titles.get(tKey);
    const parts = parsed.item ? classifyItem(parsed.item) : [];
    const row = { at: r.at, code, reward: c.reward || '', title: t.name, titleId: tKey, service: r.service, status: r.status, keys: parsed.keys, item: parsed.item, kinds: [...new Set(parts.map((p) => p.kind))] };
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
      t.items.push({ name: parsed.item, at: r.at, service: r.service, code, kinds: row.kinds });
      totals.items++;
      for (const p of parts) {
        t.kinds[p.kind] = (t.kinds[p.kind] || 0) + 1;
        totals.kinds[p.kind] = (totals.kinds[p.kind] || 0) + 1;
        cosmetics.push({ name: p.name, kind: p.kind, title: t.name, titleId: tKey, at: r.at, service: r.service, code });
      }
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

  // Where each game stands against your SHiFT account, counted per code and platform: what this app
  // redeemed, what SHiFT said was already redeemed (on the website or in a game), and what's still
  // to do for the games and platforms you target. Always all-time, since it's about the account now.
  const DEAD = new Set(['expired', 'invalid', 'unavailable']);
  const account = new Map();
  for (const [code, c] of Object.entries(db.codes || {})) {
    const dead = DEAD.has(c.check?.status);
    for (const o of c.check?.offers || []) {
      if (!onPlatform(o.service)) continue;
      const tk = o.titleId || titleKey(o.title);
      if (!onTitle(tk)) continue;
      const r = db.redemptions?.[`${code}|${titleKey(o.title)}|${o.service}`];
      const st = r?.status === 'success' ? 'app' : r?.status === 'redeemed' ? 'already' : dead || !wants(tk, o.service) ? null : 'todo';
      if (!st) continue;
      if (!account.has(tk)) account.set(tk, { app: 0, already: 0, todo: 0, title: o.title });
      account.get(tk)[st]++;
    }
  }
  for (const [tk, a] of account) {
    if (!titles.has(tk)) {
      if (!a.todo) continue; // nothing redeemed or to do: no card needed
      titles.set(tk, { ...titleInfo(tk, a.title), rewards: 0, already: 0, keys: empty(), items: [], kinds: {}, unknown: 0, platforms: {}, last: 0 });
    }
    const { title: _t, ...counts } = a;
    titles.get(tk).account = { ...counts, total: counts.app + counts.already + counts.todo };
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
    // One entry per cosmetic per game, newest first. The same item on several platforms shows once.
    cosmetics: dedupeCosmetics(cosmetics),
    itemKinds: ITEM_KINDS.map(({ id, name, one }) => ({ id, name, one })),
  };
}

function dedupeCosmetics(list) {
  const seen = new Map();
  for (const c of list.sort((a, b) => (b.at || 0) - (a.at || 0))) {
    const k = `${c.titleId}|${c.name.toLowerCase()}`;
    const prev = seen.get(k);
    if (prev) {
      if (!prev.services.includes(c.service)) prev.services.push(c.service);
    } else seen.set(k, { ...c, services: [c.service] });
  }
  return [...seen.values()].slice(0, 400);
}
