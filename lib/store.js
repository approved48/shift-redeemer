// JSON-file persistence in ./data (or $DATA_DIR). Everything stays on your machine.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SETTINGS = {
  titles: { mode: 'all', selected: ['bl4', 'ttw', 'bl3', 'tps', 'bl2', 'bl1'] },
  platforms: { mode: 'all', selected: ['steam'] },
  delaySeconds: 5,
  skipExpired: true,
  useSourceHints: true,
  maxChecksPerRun: 0,
  autoRun: { enabled: false, intervalMinutes: 180, collectFirst: true },
  sources: {},
  customSources: [],
  rememberCredentials: false,
  setupComplete: false,
  // playing: the user plays Borderlands while the app runs (so it never starts/closes games by itself).
  // askedAt / dontAsk: when we last offered to turn automatic launching back on.
  gameAssist: { mode: 'auto', game: 'auto', warmupSeconds: 90, closeAfter: true, epicLink: '', playing: false, askedAt: 0, dontAsk: false },
};

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.dbFile = path.join(dir, 'db.json');
    this.sessionFile = path.join(dir, 'session.json');
    const db = this.read(this.dbFile, {});
    this.db = {
      codes: db.codes || {},
      redemptions: db.redemptions || {},
      sourceStatus: db.sourceStatus || {},
      discoveredTitles: db.discoveredTitles || {},
      seenServices: db.seenServices || [],
      lastRun: db.lastRun || null,
      lastCollect: db.lastCollect || null,
      settings: deepMerge(DEFAULT_SETTINGS, db.settings || {}),
    };
    this.session = this.read(this.sessionFile, {});
    this.timer = null;
  }

  read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  write(file, data, mode) {
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), mode ? { mode } : undefined);
    fs.renameSync(tmp, file);
  }

  get settings() {
    return this.db.settings;
  }

  updateSettings(patch) {
    this.db.settings = deepMerge(this.db.settings, patch);
    this.save();
    return this.db.settings;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    this.write(this.dbFile, this.db);
  }

  saveSession(patch) {
    this.session = { ...this.session, ...patch };
    for (const [k, v] of Object.entries(this.session)) if (v === undefined) delete this.session[k];
    this.write(this.sessionFile, this.session, 0o600);
  }
}
