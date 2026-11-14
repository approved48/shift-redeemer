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
    description: 'Searches OzBargain deals and forum posts for Borderlands SHiFT codes shared as part of promotions.',
    defaultEnabled: true,
    async collect(ctx) {
      return crawl(ctx, {
        start: 'https://www.ozbargain.com.au/search/node/borderlands%20shift%20code',
        follow: /ozbargain\.com\.au\/node\/\d+$/,
        maxPages: 6,
      });
    },
  },
];

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
};

function pressSource(id, description) {
  const p = PRESS[id];
  const covers = Object.keys(p.pages);
  return {
    id,
    name: p.name,
    site: p.site,
    description,
    covers,
    defaultEnabled: true,
    async collect(ctx) {
      let out = [];
      for (const [titleId, url] of Object.entries(p.pages)) {
        if (!ctx.titleFilter(titleId)) continue;
        try {
          out = out.concat(codesFromHtml(await ctx.fetchText(url), { url, games: [titleId] }).map((c) => ({ ...c, games: [titleId] })));
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
