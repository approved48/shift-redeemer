// Code discovery. Each source returns a list of
//   { code, games: [titleId|raw], platforms: [platformId], reward, expires, url, note }
// Sources are best-effort: a failing site never breaks the others.

import { TITLES, resolveTitle, resolvePlatform, detectTitles, extractCodes } from './catalog.js';
import { stripTags, findLinks } from './html.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function fetchText(url, { timeout = 25_000, accept } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...(accept ? { accept } : {}) },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.text();
}

const DATE_RX =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i;

/** Pull codes out of free text, attaching nearby context (reward / expiry / game). */
export function codesFromText(text, { url, games = [], note } = {}) {
  const lines = String(text || '').split(/\n+/);
  const out = new Map();
  lines.forEach((line, i) => {
    const codes = extractCodes(line);
    if (!codes.length) return;
    const ctx = [lines[i - 1] || '', line, lines[i + 1] || ''].join(' ');
    // Several codes on one line (e.g. a pasted list): context can't be attributed reliably.
    const single = codes.length === 1;
    const lineGames = detectTitles(line);
    const ctxGames = !single ? [] : lineGames.length ? lineGames : detectTitles(ctx);
    const expiryMatch = !single ? null : /expir|until|ends|valid/i.test(ctx) ? ctx.match(DATE_RX) : line.match(DATE_RX);
    const reward = !single
      ? ''
      : (line.replace(/\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/gi, '').replace(/\s+/g, ' ').trim() || (extractCodes(lines[i - 1]).length ? '' : lines[i - 1] || ''))
          .replace(/^[\s:|–—-]+|[\s:|–—-]+$/g, '')
          .slice(0, 140);
    for (const code of codes) {
      if (out.has(code)) continue;
      out.set(code, {
        code,
        games: ctxGames.length ? ctxGames : games,
        platforms: [],
        reward,
        expires: expiryMatch ? expiryMatch[0] : '',
        url,
        note,
      });
    }
  });
  return [...out.values()];
}

/** Pull codes from an HTML page, using table rows as context when present. */
export function codesFromHtml(html, opts = {}) {
  const rows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const found = new Map();
  for (const r of rows) {
    const cells = [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1]).replace(/\s+/g, ' ').trim());
    const rowText = cells.join(' | ');
    const codes = extractCodes(rowText);
    if (!codes.length) continue;
    const other = cells.filter((c) => !extractCodes(c).length);
    const dateCell = other.find((c) => DATE_RX.test(c));
    const reward = other.filter((c) => c !== dateCell && c.length > 1).join(' · ').slice(0, 140);
    const games = detectTitles(rowText);
    for (const code of codes)
      found.set(code, {
        code,
        games: games.length ? games : opts.games || [],
        platforms: [],
        reward,
        expires: dateCell ? (dateCell.match(DATE_RX) || [dateCell])[0] : '',
        url: opts.url,
        note: opts.note,
      });
  }
  for (const c of codesFromText(stripTags(html), opts)) if (!found.has(c.code)) found.set(c.code, c);
  return [...found.values()];
}

async function crawl(ctx, { start, follow, maxPages = 5, games = [], note }) {
  const html = await ctx.fetchText(start);
  let out = codesFromHtml(html, { url: start, games, note });
  if (follow) {
    const links = findLinks(html, start, follow).slice(0, maxPages);
    for (const link of links) {
      try {
        const page = await ctx.fetchText(link);
        out = out.concat(codesFromHtml(page, { url: link, games, note }));
      } catch (e) {
        ctx.log('warn', `  ${new URL(link).host}: ${e.message}`);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ built-ins

export const BUILTIN_SOURCES = [
  {
    id: 'feed',
    name: 'Community code feed',
    site: 'github.com/ugoogalizer/autoshift-codes',
    description: 'Machine-readable list of every known code (data from MentalMars), refreshed several times a day. Includes game, reward and expiry.',
    defaultEnabled: true,
    async collect(ctx) {
      const url = 'https://raw.githubusercontent.com/ugoogalizer/autoshift-codes/main/shiftcodes.json';
      const data = JSON.parse(await ctx.fetchText(url, { accept: 'application/json' }));
      const list = Array.isArray(data) ? data.flatMap((d) => d.codes || []) : data.codes || [];
      return list
        .filter((c) => c && c.code && (!c.type || c.type === 'shift'))
        .map((c) => {
          const p = resolvePlatform(c.platform);
          return {
            code: String(c.code).toUpperCase().trim(),
            games: [resolveTitle(c.game) || c.game].filter(Boolean),
            platforms: p ? [p] : [],
            reward: c.reward || '',
            expires: c.expires && !/unknown/i.test(c.expires) ? c.expires : '',
            expired: !!c.expired,
            url: c.link || url,
          };
        });
    },
  },
  {
    id: 'mentalmars',
    name: 'MentalMars (direct)',
    site: 'mentalmars.com',
    description: 'Scrapes the MentalMars SHiFT code tables for each game directly, catching codes before the feed refreshes.',
    defaultEnabled: true,
    async collect(ctx) {
      let out = [];
      for (const t of TITLES.filter((t) => ctx.titleFilter(t.id))) {
        try {
          const html = await ctx.fetchText(t.mentalmars);
          out = out.concat(codesFromHtml(html, { url: t.mentalmars, games: [t.id] }).map((c) => ({ ...c, games: [t.id] })));
        } catch (e) {
          ctx.log('warn', `  ${t.short}: ${e.message}`);
        }
      }
      return out;
    },
  },
  {
    id: 'steamnews',
    name: 'Steam news & announcements',
    site: 'store.steampowered.com',
    description: "Official Gearbox announcements posted to each game's Steam news feed (public Steam Web API, no key needed).",
    defaultEnabled: true,
    async collect(ctx) {
      let out = [];
      for (const t of TITLES.filter((t) => ctx.titleFilter(t.id))) {
        const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${t.steamAppId}&count=40&maxlength=0&format=json`;
        try {
          const data = JSON.parse(await ctx.fetchText(url, { accept: 'application/json' }));
          for (const item of data?.appnews?.newsitems || []) {
            const text = stripTags(String(item.contents || '').replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, '\n'));
            const found = codesFromText(`${item.title}\n${text}`, { url: item.url, games: [t.id], note: item.title });
            out = out.concat(found.map((c) => ({ ...c, seenAt: item.date ? item.date * 1000 : undefined })));
          }
        } catch (e) {
          ctx.log('warn', `  ${t.short}: ${e.message}`);
        }
      }
      return out;
    },
  },
  {
    id: 'reddit',
    name: 'Reddit',
    site: 'reddit.com',
    description: 'Recent posts mentioning SHiFT codes in r/Borderlands, r/Borderlands4, r/borderlands3, r/Borderlands2 and r/TinyTinasWonderlands.',
    defaultEnabled: true,
    async collect(ctx) {
      const url =
        'https://www.reddit.com/r/Borderlands+Borderlands4+borderlands3+Borderlands2+TinyTinasWonderlands/search.json?q=shift%20code&restrict_sr=on&sort=new&t=month&limit=75&raw_json=1';
      const data = JSON.parse(await ctx.fetchText(url, { accept: 'application/json' }));
      let out = [];
      for (const { data: p } of data?.data?.children || []) {
        const text = `${p.title}\n${p.selftext || ''}`;
        const games = detectTitles(`${p.subreddit} ${p.title}`);
        out = out.concat(codesFromText(text, { url: `https://www.reddit.com${p.permalink}`, games, note: p.title }));
      }
      return out;
    },
  },
  {
    id: 'steamguides',
    name: 'Steam Community guides',
    site: 'steamcommunity.com',
    description: 'Searches each game\'s Steam Community guides for "SHiFT codes" and reads the top results. Guides often include older codes — SHiFT weeds out dead ones.',
    defaultEnabled: true,
    async collect(ctx) {
      let out = [];
      for (const t of TITLES.filter((t) => ctx.titleFilter(t.id))) {
        try {
          out = out.concat(
            await crawl(ctx, {
              start: `https://steamcommunity.com/app/${t.steamAppId}/guides/?searchText=shift+codes&browsefilter=trend&browsesort=trend&requiredtags%5B%5D=-1`,
              follow: /steamcommunity\.com\/sharedfiles\/filedetails\/\?id=\d+/,
              maxPages: 3,
              games: [t.id],
            }),
          );
        } catch (e) {
          ctx.log('warn', `  ${t.short}: ${e.message}`);
        }
      }
      return out;
    },
  },
  {
    id: 'ozbargain',
    name: 'OzBargain',
    site: 'ozbargain.com.au',
    description: 'Reads OzBargain\'s "SHiFT Code" and "Borderlands" deal feeds, where Australian bargain hunters post new codes, often within minutes.',
    defaultEnabled: true,
    async collect(ctx) {
      // The search and deal pages refuse automated visits, but the RSS feeds are open.
      const out = new Map();
      for (const url of OZB_FEEDS) {
        try {
          for (const c of codesFromOzbFeed(await ctx.fetchText(url, { accept: 'application/rss+xml, application/xml, text/xml' }))) if (!out.has(c.code)) out.set(c.code, c);
        } catch (e) {
          ctx.log('warn', `  ${new URL(url).pathname}: ${e.message}`);
        }
      }
      return [...out.values()];
    },
  },
];

const OZB_FEEDS = ['https://www.ozbargain.com.au/tag/shift-code/feed', 'https://www.ozbargain.com.au/product/borderlands/feed'];

const xmlText = (s) =>
  stripTags(String(s || '').replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ''))
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Codes from an OzBargain RSS feed. Each deal is one item: the title names the games and the
 * reward ("SHiFT Code for Borderlands 4 - Golden Keys @ Gearbox Software"), the description has
 * the code and usually an Australian-style expiry ("Expires 1/12" = 1 December).
 */
export function codesFromOzbFeed(xml) {
  const out = new Map();
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const tag = (n) => xmlText((m[1].match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\/${n}>`, 'i')) || [])[1]);
    const title = tag('title');
    const desc = tag('description');
    const codes = extractCodes(`${title} ${desc}`);
    if (!codes.length) continue;
    const posted = Date.parse(tag('pubDate')) || Date.now();
    // "All Borderlands" deals work in every game: leave games empty so every title is tried.
    const single = codes.length === 1; // several codes in one deal: details can't be matched to each
    const games = !single || /\ball\b[^@]*borderlands|franchise/i.test(title) ? [] : detectTitles(title);
    const head = title.replace(/\s*@[^@]*$/, '');
    // "SHiFT Code for Borderlands 4 - Golden Keys" or "5 Golden Keys Borderlands 1, 2 & 3"
    const reward = !single ? '' : (head.match(/\s[-–—]\s+(.+)$/) || [])[1] || (head.match(/^(\d+\s.+?)\s+(?:for\s+|in\s+)?(?:all\s+)?borderlands/i) || [])[1] || '';
    for (const code of codes)
      if (!out.has(code))
        out.set(code, { code, games, platforms: [], reward: reward.slice(0, 140), expires: single ? ozbExpiry(desc, posted) : '', url: tag('link'), note: title, seenAt: posted });
  }
  return [...out.values()];
}

/** "Expires 1/12" or "expires 01/12/2026" (day/month, as written in Australia) → YYYY-MM-DD. */
export function ozbExpiry(text, posted = Date.now()) {
  const m = String(text).match(/expir\w*\s*(?:on\s*)?:?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  if (!m) return (String(text).match(DATE_RX) || [''])[0];
  const [d, mo] = [Number(m[1]), Number(m[2])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';
  const p = new Date(posted);
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : p.getFullYear();
  // No year: the next such date after the post (a code posted in December can expire in January).
  if (!m[3] && new Date(y, mo - 1, d) < new Date(p.getFullYear(), p.getMonth(), p.getDate())) y++;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Games-press guides that keep per-game code tables up to date. Each is read only for the
// titles it covers, and only when that title is selected.
const PRESS = {
  eurogamer: { name: 'Eurogamer', site: 'eurogamer.net', pages: { bl4: 'https://www.eurogamer.net/borderlands-4-shift-codes' } },
  pcgamesn: {
    name: 'PCGamesN',
    site: 'pcgamesn.com',
    pages: { bl4: 'https://www.pcgamesn.com/borderlands-4/shift-codes', bl3: 'https://www.pcgamesn.com/borderlands-3/shift-codes' },
  },
  game8: { name: 'Game8', site: 'game8.co', pages: { bl4: 'https://game8.co/games/Borderlands-4/archives/548406' } },
  esportsnet: {
    name: 'esports.net',
    site: 'esports.net',
    pages: { bl3: 'https://www.esports.net/wiki/guides/borderlands-3-shift-codes', ttw: 'https://www.esports.net/news/gaming/tiny-tinas-wonderlands-shift-codes/' },
  },
  fossbytes: { name: 'Fossbytes', site: 'fossbytes.com', pages: { bl3: 'https://fossbytes.com/borderlands-3-shift-codes/' } },
  // German. The article id redirects to the current month's page, so the link keeps working.
  giga: { name: 'GIGA', site: 'giga.de', pages: { bl4: 'https://www.giga.de/games/borderlands-4-shift-codes--01K4SKJZFTVTCGCZE7T6E82V5Q' }, fix: fromGerman },
  // ---- unsure: couldn't be verified (they refused automated visits from our test setup)
  lockercodes: { name: 'Lockercodes', site: 'lockercodes.io', pages: { '*': 'https://lockercodes.io/borderlands/shift-codes' } },
  supercheats: { name: 'Supercheats', site: 'supercheats.com', pages: { bl4: 'https://www.supercheats.com/borderlands-4-shift-codes' } },
  mobalytics: { name: 'Mobalytics', site: 'mobalytics.gg', pages: { bl4: 'https://mobalytics.gg/borderlands-4/shift-codes-borderlands-4' } },
  icyveins: { name: 'Icy Veins', site: 'icy-veins.com', pages: { bl4: 'https://www.icy-veins.com/other-games/news/all-working-shift-codes-in-borderlands-4' } },
  gamestar: { name: 'GameStar', site: 'gamestar.de', pages: { bl4: 'https://www.gamestar.de/artikel/borderlands-4-shift-codes-goldene-schluessel,3439325.html' }, fix: fromGerman },
};

const DE_MONTHS = { januar: 'January', februar: 'February', märz: 'March', maerz: 'March', april: 'April', mai: 'May', juni: 'June', juli: 'July', august: 'August', september: 'September', oktober: 'October', november: 'November', dezember: 'December' };
const DE_DATE = /(\d{1,2})\.\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/i;

/** German reward text and dates ("5x Goldener Schlüssel · 17. November") into English. */
export function fromGerman(c, now = new Date()) {
  let reward = String(c.reward || '');
  let expires = c.expires || '';
  const d = reward.match(DE_DATE);
  if (d && !expires) {
    const month = DE_MONTHS[d[2].toLowerCase()];
    const mi = Object.values(DE_MONTHS).indexOf(month);
    // No year given: the date is this year, unless it's months behind us (then it's next year).
    const year = d[3] || (mi < now.getMonth() - 2 ? now.getFullYear() + 1 : now.getFullYear());
    expires = `${month} ${Number(d[1])}, ${year}`;
  }
  reward = reward
    .split(/\s+·\s+/)
    .filter((p) => !DE_DATE.test(p) && !/^(unbekannt|tbc|unbegrenzt)$/i.test(p.trim()))
    .join(' · ')
    .replace(/(\d+)\s*x\s+Golden(?:e|er|en)?\s+Schlüssel/gi, (m, n) => `${n} Golden Key${n === '1' ? '' : 's'}`)
    .replace(/(\d+)\s*x\s+Diamant(?:en)?[- ]?Schlüssel/gi, (m, n) => `${n} Diamond Key${n === '1' ? '' : 's'}`)
    .replace(/Golden(?:e|er|en)?\s+Schlüssel/gi, 'Golden Keys')
    .replace(/\bfür\b/gi, 'for')
    .replace(/\bund\b/gi, 'and');
  return { ...c, reward: reward.trim(), expires };
}

function pressSource(id, description, { unsure = false } = {}) {
  const p = PRESS[id];
  const covers = Object.keys(p.pages);
  return {
    id,
    name: p.name,
    site: p.site,
    description,
    covers,
    unsure,
    // "Unsure" sources couldn't be checked when they were added (they refused automated visits from
    // our test setup), so they start switched off.
    defaultEnabled: !unsure,
    async collect(ctx) {
      let out = [];
      for (const [titleId, url] of Object.entries(p.pages)) {
        // "*" = a page covering several games: games are worked out from the text around each code.
        if (titleId !== '*' && !ctx.titleFilter(titleId)) continue;
        try {
          const tidy = (c) => ({ ...c, games: titleId === '*' ? c.games : [titleId], reward: String(c.reward || '').replace(/^redeem (?:it )?for\s+/i, '').replace(/\s*\((?:new|updated)!?\)/gi, '').trim() });
          out = out.concat(codesFromHtml(await ctx.fetchText(url), { url, games: titleId === '*' ? [] : [titleId] }).map((c) => (p.fix ? p.fix(tidy(c)) : tidy(c))));
        } catch (e) {
          ctx.log('warn', `  ${p.name} (${titleId}): ${e.message}`);
        }
      }
      return out;
    },
  };
}

BUILTIN_SOURCES.push(
  pressSource('eurogamer', "Eurogamer's Borderlands 4 SHiFT code list, with rewards and expiry dates."),
  pressSource('pcgamesn', "PCGamesN's code lists for Borderlands 4 and Borderlands 3, with rewards."),
  pressSource('game8', "Game8's Borderlands 4 code table, updated weekly with rewards and expiry dates."),
  pressSource('esportsnet', "esports.net's code lists for Borderlands 3 and Tiny Tina's Wonderlands."),
  pressSource('fossbytes', "Fossbytes' Borderlands 3 code list, with Golden and Diamond Key rewards."),
  pressSource('giga', 'GIGA (Germany): a Borderlands 4 code list updated several times a month. Rewards are translated to English.'),
  pressSource('lockercodes', 'A code list covering several Borderlands games.', { unsure: true }),
  pressSource('supercheats', "Supercheats' Borderlands 4 code list, including codes that don't expire.", { unsure: true }),
  pressSource('mobalytics', "Mobalytics' Borderlands 4 code list.", { unsure: true }),
  pressSource('icyveins', "Icy Veins' list of working Borderlands 4 codes.", { unsure: true }),
  pressSource('gamestar', 'GameStar (Germany): a Borderlands 4 code list. Rewards are translated to English.', { unsure: true }),
);

export function customSourceDef(cs) {
  return {
    id: `custom:${cs.id}`,
    name: cs.name || new URL(cs.url).host,
    site: (() => {
      try {
        return new URL(cs.url).host;
      } catch {
        return cs.url;
      }
    })(),
    description: cs.follow ? `Reads ${cs.url} and follows links matching /${cs.follow}/` : `Reads ${cs.url}`,
    custom: true,
    async collect(ctx) {
      let follow = null;
      if (cs.follow) follow = new RegExp(cs.follow, 'i');
      return crawl(ctx, { start: cs.url, follow, maxPages: cs.maxPages || 5, games: cs.games || [] });
    },
  };
}
