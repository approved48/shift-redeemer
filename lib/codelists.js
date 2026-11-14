// Import and export lists of SHiFT codes, so people can share them.
//
// Import understands: our own list file (JSON), the community feed's JSON, CSV with a "code"
// column (plus optional reward / game / platform / expires columns), and any plain text.
// Export writes: plain text (one code per line), CSV, or our JSON list file. Exports contain
// only facts about the codes themselves — never anything about the user's account.

import { extractCodes, resolveTitle, resolvePlatform } from './catalog.js';
import { codesFromText } from './sources.js';

export const LIST_FORMAT = 'shift-redeemer-code-list';
const UNIVERSAL_STATES = new Set(['valid', 'expired', 'invalid', 'unavailable']);

function one(code) {
  const c = extractCodes(code)[0];
  return c || null;
}

function normalise(o) {
  if (typeof o === 'string') {
    const code = one(o);
    return code ? { code, games: [], platforms: [], reward: '', expires: '' } : null;
  }
  if (!o || typeof o !== 'object') return null;
  const code = one(o.code || o.Code || o.key || '');
  if (!code) return null;
  const games = [].concat(o.games || o.game || o.title || o.titles || []).flatMap((g) => String(g).split(/[;|]/)).map((g) => g.trim()).filter(Boolean);
  const plats = [].concat(o.platforms || o.platform || []).flatMap((p) => String(p).split(/[;|]/)).map((p) => p.trim()).filter(Boolean);
  const state = String(o.state || o.status || '').toLowerCase();
  return {
    code,
    games: games.map((g) => resolveTitle(g) || g),
    platforms: plats.map((p) => resolvePlatform(p)).filter(Boolean),
    reward: String(o.reward || o.Reward || '').slice(0, 200),
    expires: String(o.expires || o.expiry || o.Expires || '').replace(/^unknown$/i, '').slice(0, 40),
    expired: o.expired === true || state === 'expired' || state === 'invalid',
  };
}

/** Minimal CSV/TSV parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = ['\t', ';', ','].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Parse any supported list into code records ({ code, games, platforms, reward, expires }). */
export function parseCodeList(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (!t) return { kind: 'empty', records: [] };

  if (/^[[{]/.test(t)) {
    try {
      const j = JSON.parse(t);
      let arr;
      if (Array.isArray(j)) arr = j.some((x) => x && Array.isArray(x.codes)) ? j.flatMap((x) => x.codes || []) : j;
      else arr = j.codes || [];
      const kind = j && j.format === LIST_FORMAT ? 'list' : 'json';
      return { kind, records: dedupe(arr.map(normalise).filter(Boolean)) };
    } catch {
      /* not JSON after all — fall through to text */
    }
  }

  const lines = t.split(/\r?\n/);
  if (lines.length > 1 && /(^|[,;\t])\s*"?code"?\s*([,;\t]|$)/i.test(lines[0])) {
    const rows = parseCsv(t);
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const objs = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
    return { kind: 'csv', records: dedupe(objs.map(normalise).filter(Boolean)) };
  }

  const recs = codesFromText(t, { note: 'Imported list' });
  return { kind: 'text', records: dedupe(recs.map((r) => ({ ...r, games: r.games || [], platforms: r.platforms || [] }))) };
}

function dedupe(records) {
  const seen = new Map();
  for (const r of records) if (!seen.has(r.code)) seen.set(r.code, r);
  return [...seen.values()];
}

/** The universal state of a code (never account-specific). */
export function universalState(c) {
  const s = c.check?.status;
  if (s === 'ok' || s === 'redeemed') return 'valid';
  return UNIVERSAL_STATES.has(s) ? s : 'unchecked';
}

export function exportCodeList(codes, format, appVersion) {
  const date = new Date().toISOString().slice(0, 10);
  const rows = codes.map((c) => ({
    code: c.code,
    reward: c.reward || '',
    games: (c.games || []).join('; '),
    platforms: (c.platforms || []).join('; '),
    expires: c.expires || '',
    state: universalState(c),
  }));
  if (format === 'txt') {
    return { filename: `shift-codes-${date}.txt`, mime: 'text/plain', content: `${rows.map((r) => r.code).join('\n')}\n`, count: rows.length };
  }
  if (format === 'csv') {
    const q = (v) => (/[",\n;]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const head = ['code', 'reward', 'games', 'platforms', 'expires', 'state'];
    return {
      filename: `shift-codes-${date}.csv`,
      mime: 'text/csv',
      content: `${[head.join(','), ...rows.map((r) => head.map((h) => q(r[h])).join(','))].join('\r\n')}\r\n`,
      count: rows.length,
    };
  }
  const doc = {
    format: LIST_FORMAT,
    version: 1,
    exported: new Date().toISOString(),
    app: `SHiFT Redeemer ${appVersion || ''}`.trim(),
    codes: codes.map((c) => ({ code: c.code, reward: c.reward || undefined, games: c.games?.length ? c.games : undefined, platforms: c.platforms?.length ? c.platforms : undefined, expires: c.expires || undefined, state: universalState(c) })),
  };
  return { filename: `shift-codes-${date}.json`, mime: 'application/json', content: `${JSON.stringify(doc, null, 2)}\n`, count: rows.length };
}
