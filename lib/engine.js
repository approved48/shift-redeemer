// Orchestrates code discovery, SHiFT checks and redemptions, and the auto-run timer.

import { EventEmitter } from 'node:events';
import { TITLES, PLATFORMS, titleKey, extractCodes, resolveTitle } from './catalog.js';
import { BUILTIN_SOURCES, customSourceDef, fetchText, codesFromText } from './sources.js';
import { out } from './runtime.js';
import * as gamesModule from './games.js';
import { parseCodeList, exportCodeList } from './codelists.js';
import { buildLlmInstructions } from './llm.js';

const cleanExpiry = (v) => {
  const s = String(v || '').trim();
  return !s || extractCodes(s).length || !/\d/.test(s) ? '' : s.slice(0, 40);
};
import { secureStoreInfo, saveSecret, loadSecret, deleteSecret } from './secrets.js';

const DEAD = new Set(['expired', 'invalid', 'redeemed', 'unavailable']);
const DONE = new Set(['success', 'redeemed', 'expired']);
const DAY = 86_400_000;

export const redemptionKey = (code, title, service) => `${code}|${titleKey(title)}|${service}`;

function parseExpiry(s) {
  if (!s) return null;
  const t = Date.parse(String(s).replace(/(\d)(st|nd|rd|th)\b/, '$1'));
  return Number.isFinite(t) ? t : null;
}

export class Engine extends EventEmitter {
  constructor({ store, shift, games = gamesModule }) {
    super();
    this.store = store;
    this.shift = shift;
    this.games = games;
    this.logs = [];
    this.abort = false;
    this.state = { running: false, kind: null, phase: 'idle', current: null, done: 0, total: 0, blocked: [], message: '', assist: null };
    this.account = { loggedIn: false, email: store.session.email || null, checkedAt: null, error: null };
    this.timer = null;
  }

  // -------------------------------------------------------------- utilities

  log(level, msg, extra = {}) {
    const entry = { t: Date.now(), level, msg, ...extra };
    this.logs.push(entry);
    if (this.logs.length > 600) this.logs.splice(0, this.logs.length - 600);
    this.emit('log', entry);
    const tag = { info: ' ', ok: '+', warn: '!', error: 'x', step: '>' }[level] || ' ';
    if (process.env.QUIET !== '1') out(`[${new Date(entry.t).toLocaleTimeString()}] ${tag} ${msg}`);
  }

  setState(patch) {
    Object.assign(this.state, patch);
    this.emit('state', this.publicState());
  }

  publicState() {
    const s = this.store.settings;
    return {
      ...this.state,
      lastRun: this.store.db.lastRun,
      lastCollect: this.store.db.lastCollect,
      nextRun: s.autoRun.enabled && this.nextRunAt ? this.nextRunAt : null,
    };
  }

  changed() {
    this.store.save();
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => this.emit('codes'), 400);
  }

  async sleep(ms) {
    const end = Date.now() + ms;
    while (!this.abort && Date.now() < end) await new Promise((r) => setTimeout(r, Math.min(250, end - Date.now())));
  }

  // -------------------------------------------------------------- account

  async refreshAccount() {
    try {
      const { loggedIn } = await this.shift.checkLogin();
      this.account = { ...this.account, loggedIn, checkedAt: Date.now(), error: null };
    } catch (e) {
      this.account = { ...this.account, loggedIn: false, checkedAt: Date.now(), error: e.message };
    }
    this.emit('account', this.account);
    return this.account;
  }

  /** Sign in to SHiFT. With `remember`, the password is saved in the OS's secure store; if that
   *  isn't possible it is only saved in plain text when `allowPlaintext` is true (the user agreed). */
  async login(email, password, { remember = false, allowPlaintext = false } = {}) {
    await this.shift.login(email, password);
    this.store.saveSession({ email });
    this.account = { loggedIn: true, email, checkedAt: Date.now(), error: null };
    this.log('ok', `Signed in to SHiFT as ${email}`);
    this.emit('account', this.account);

    const prev = this.store.session.credentials;
    if (!remember) {
      if (prev) await this.forgetCredentials({ quiet: true });
      return this.account;
    }
    try {
      const store = await saveSecret(email, password);
      if (prev && prev.store !== 'plaintext' && prev.email !== email) await deleteSecret(prev.email);
      this.store.saveSession({ credentials: { email, store } });
      this.log('info', `Password saved securely in ${(await secureStoreInfo()).name} for auto-pilot`);
    } catch (e) {
      if (!allowPlaintext) {
        if (prev) await this.forgetCredentials({ quiet: true });
        const info = await secureStoreInfo();
        throw Object.assign(new Error(`Signed in, but your password could not be saved in ${info.name}: ${e.message}`), {
          status: 409,
          code: 'SECURE_STORE_UNAVAILABLE',
          extra: { reason: e.message, storeName: info.name, account: this.account },
        });
      }
      if (prev && prev.store !== 'plaintext') await deleteSecret(prev.email);
      this.store.saveSession({ credentials: { email, store: 'plaintext', password } });
      this.log('warn', 'Password saved WITHOUT encryption (you chose this because secure storage was unavailable)');
    }
    this.emit('account', this.account);
    return this.account;
  }

  /** Remove any saved password, wherever it is stored. */
  async forgetCredentials({ quiet = false } = {}) {
    const cred = this.store.session.credentials;
    if (cred && cred.store !== 'plaintext') await deleteSecret(cred.email);
    this.store.saveSession({ credentials: undefined });
    if (!quiet && cred) this.log('info', 'Saved password removed');
    this.emit('account', this.account);
  }

  /** What the UI needs to know about the saved password (never the password itself). */
  async credentialsInfo() {
    const cred = this.store.session.credentials;
    const info = await secureStoreInfo();
    return {
      secureStore: { name: info.name, where: info.where, available: info.available, reason: info.reason },
      saved: cred ? { email: cred.email, secure: cred.store !== 'plaintext', storeName: cred.store === 'plaintext' ? 'plain text file' : info.name } : null,
    };
  }

  /** Move passwords saved by older versions (plain text) into secure storage when possible. */
  async migrateCredentials() {
    const cred = this.store.session.credentials;
    if (!cred || !cred.password || (cred.store && cred.store !== 'plaintext')) return;
    if (!(await secureStoreInfo()).available) {
      if (!cred.store) this.store.saveSession({ credentials: { ...cred, store: 'plaintext' } });
      return;
    }
    try {
      const store = await saveSecret(cred.email, cred.password);
      this.store.saveSession({ credentials: { email: cred.email, store } });
      this.log('ok', `Moved your saved password into ${(await secureStoreInfo()).name}`);
    } catch {
      if (!cred.store) this.store.saveSession({ credentials: { ...cred, store: 'plaintext' } });
    }
  }

  async useCookies(cookies) {
    this.shift.setCookies(cookies);
    const acc = await this.refreshAccount();
    if (acc.loggedIn) this.log('ok', 'Imported browser session — signed in to SHiFT');
    return acc;
  }

  async logout() {
    this.shift.setCookies({});
    this.store.saveSession({ cookies: {} });
    await this.forgetCredentials({ quiet: true });
    this.account = { loggedIn: false, email: this.store.session.email || null, checkedAt: Date.now(), error: null };
    this.log('info', 'Signed out (session and saved password removed)');
    this.emit('account', this.account);
  }

  async ensureLogin() {
    const acc = await this.refreshAccount();
    if (acc.loggedIn) return true;
    const cred = this.store.session.credentials;
    if (!cred || !cred.email) return false;
    const password = cred.store === 'plaintext' ? cred.password : await loadSecret(cred.email);
    if (!password) {
      this.log('error', `Session expired and the saved password could not be read from ${(await secureStoreInfo()).name}. Sign in again on the Account tab.`);
      return false;
    }
    this.log('info', 'Session expired — signing in again with your saved password');
    try {
      await this.shift.login(cred.email, password);
      this.account = { loggedIn: true, email: cred.email, checkedAt: Date.now(), error: null };
      this.emit('account', this.account);
      return true;
    } catch (e) {
      this.log('error', `Automatic sign-in failed: ${e.message}`);
      return false;
    }
  }

  // -------------------------------------------------------------- sources

  sourceDefs() {
    const s = this.store.settings;
    return [...BUILTIN_SOURCES, ...s.customSources.map(customSourceDef)].map((d) => ({
      ...d,
      enabled: s.sources[d.id]?.enabled ?? (d.custom ? s.customSources.find((c) => `custom:${c.id}` === d.id)?.enabled !== false : d.defaultEnabled),
    }));
  }

  /** Merge discovered code records into the database. Returns number of new codes. */
  ingest(records, source) {
    const db = this.store.db;
    let added = 0;
    const now = Date.now();
    for (const r of records) {
      if (!r || !r.code) continue;
      let c = db.codes[r.code];
      if (!c) {
        c = db.codes[r.code] = { code: r.code, games: [], platforms: [], reward: '', expires: '', sources: [], firstSeen: r.seenAt || now };
        added++;
      }
      c.lastSeen = now;
      for (const g of r.games || []) if (g && !c.games.includes(g)) c.games.push(g);
      for (const p of r.platforms || []) if (p && !c.platforms.includes(p)) c.platforms.push(p);
      if (r.reward && (!c.reward || c.reward.length < 4)) c.reward = r.reward;
      // Some feeds put the code itself (or other junk) in the expiry field.
      if (c.expires && !cleanExpiry(c.expires)) c.expires = '';
      const exp = cleanExpiry(r.expires);
      if (exp && !c.expires) c.expires = exp;
      if (r.expired) c.sourceExpired = true;
      if (!c.sources.some((s) => s.id === source.id)) c.sources.push({ id: source.id, name: source.name, url: r.url || null });
    }
    return added;
  }

  async collect({ only = null } = {}) {
    if (this.state.running) throw new Error(`Busy: ${this.state.kind} in progress`);
    this.abort = false;
    const defs = this.sourceDefs().filter((d) => (only ? only.includes(d.id) : d.enabled));
    this.setState({ running: true, kind: 'collect', phase: 'Finding codes', done: 0, total: defs.length, current: null, message: '' });
    this.log('step', `Searching ${defs.length} source(s) for SHiFT codes…`);
    const s = this.store.settings;
    const ctx = {
      fetchText,
      log: (lvl, m) => this.log(lvl, m),
      titleFilter: (id) => s.titles.mode === 'all' || s.titles.selected.includes(id),
    };
    let totalNew = 0;
    try {
      for (const d of defs) {
        if (this.abort) break;
        this.setState({ current: d.name });
        const started = Date.now();
        try {
          const recs = await d.collect(ctx);
          const added = this.ingest(recs, d);
          totalNew += added;
          this.store.db.sourceStatus[d.id] = { at: Date.now(), ok: true, found: new Set(recs.map((r) => r.code)).size, added, ms: Date.now() - started };
          this.log(added ? 'ok' : 'info', `${d.name}: ${this.store.db.sourceStatus[d.id].found} code(s), ${added} new`);
        } catch (e) {
          this.store.db.sourceStatus[d.id] = { at: Date.now(), ok: false, error: e.message, ms: Date.now() - started };
          this.log('warn', `${d.name}: ${e.message}`);
        }
        this.setState({ done: this.state.done + 1 });
        this.changed();
      }
    } finally {
      this.store.db.lastCollect = { at: Date.now(), added: totalNew };
      this.setState({ running: false, kind: null, phase: 'idle', current: null });
      this.changed();
    }
    this.log('step', `Code search finished — ${totalNew} new code(s)`);
    return totalNew;
  }

  addManual(text) {
    const recs = codesFromText(text, { note: 'Added manually' });
    if (!recs.length) {
      // fall back to bare extraction in case the context parser missed something
      for (const code of extractCodes(text)) recs.push({ code, games: [], platforms: [] });
    }
    const added = this.ingest(recs, { id: 'manual', name: 'Added manually' });
    this.changed();
    this.log('info', `Added ${recs.length} code(s) manually (${added} new)`);
    return recs.map((r) => r.code);
  }

  /** Import a shared list of codes. With dryRun, only reports what would be added. */
  importList(text, filename = '', { dryRun = false } = {}) {
    const { kind, records, app } = parseCodeList(text);
    const db = this.store.db;
    const fresh = records.filter((r) => !db.codes[r.code]);
    const result = {
      kind,
      found: records.length,
      fresh: fresh.length,
      known: records.length - fresh.length,
      codes: records.map((r) => r.code),
      sample: records.slice(0, 8).map((r) => ({ code: r.code, reward: r.reward || '', isNew: !db.codes[r.code] })),
    };
    if (dryRun || !records.length) return result;
    const label = filename || (app && !/^SHiFT Redeemer/i.test(app) ? app : '');
    const name = label ? `Imported list (${String(label).slice(0, 40)})` : 'Imported list';
    this.ingest(records, { id: `import:${name}`, name });
    this.changed();
    this.log('info', `Imported ${records.length} code(s) from ${filename || 'a pasted list'} (${fresh.length} new)`);
    return result;
  }

  /** Instructions for an AI assistant to find codes, personalised with the user's targets. */
  llmInstructions({ skipKnown = false, version = '' } = {}) {
    const s = this.store.settings;
    const known = skipKnown
      ? Object.values(this.store.db.codes)
          .sort((a, b) => (b.lastSeen || b.firstSeen || 0) - (a.lastSeen || a.firstSeen || 0))
          .slice(0, 400)
          .map((c) => c.code)
      : [];
    return buildLlmInstructions({
      titles: s.titles.mode === 'all' ? [] : s.titles.selected,
      platforms: s.platforms.mode === 'all' ? [] : s.platforms.selected,
      known,
      version,
    });
  }

  /** Export codes as txt / csv / json. which: working | queue | all. */
  exportList(format = 'txt', which = 'working', version = '') {
    const dead = new Set(['expired', 'invalid', 'unavailable', 'stale']);
    const queue = new Set(['new', 'pending', 'partial', 'retry']);
    const list = Object.values(this.store.db.codes)
      .filter((c) => {
        const st = this.statusOf(c);
        if (which === 'all') return true;
        if (which === 'queue') return queue.has(st);
        return !dead.has(st) && st !== 'ignored';
      })
      .sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0));
    return exportCodeList(list.map((c) => ({ ...c, expires: cleanExpiry(c.expires) })), ['txt', 'csv', 'json'].includes(format) ? format : 'txt', version);
  }

  // -------------------------------------------------------------- selection

  wantsTitle(title, titleId) {
    const t = this.store.settings.titles;
    if (t.mode === 'all') return true;
    return t.selected.includes(titleId || titleKey(title));
  }

  wantsService(service) {
    const p = this.store.settings.platforms;
    return p.mode === 'all' || p.selected.includes(service);
  }

  redemption(code, title, service) {
    return this.store.db.redemptions[redemptionKey(code, title, service)];
  }

  /** Offers on a code that match the current targets and are not yet finished. */
  pendingOffers(code, offers) {
    return offers.filter((o) => {
      if (!this.wantsTitle(o.title, o.titleId) || !this.wantsService(o.service)) return false;
      const r = this.redemption(code, o.title, o.service);
      return !(r && DONE.has(r.status));
    });
  }

  expiryOf(c) {
    return parseExpiry(cleanExpiry(c.expires));
  }

  /** Summary status of a code for the UI. */
  statusOf(c) {
    if (c.ignored) return 'ignored';
    const chk = c.check;
    if (chk && DEAD.has(chk.status)) return chk.status;
    const exp = this.expiryOf(c);
    if (!chk || chk.status !== 'ok') {
      if (exp && exp + 1.5 * DAY < Date.now()) return 'stale';
      if (c.sourceExpired) return 'stale';
      if (!chk) return this.matchesHints(c) ? 'new' : 'filtered';
      return 'retry';
    }
    const offers = (chk.offers || []).filter((o) => this.wantsTitle(o.title, o.titleId) && this.wantsService(o.service));
    if (!offers.length) return 'filtered';
    const done = offers.filter((o) => DONE.has(this.redemption(c.code, o.title, o.service)?.status)).length;
    if (done === offers.length) return 'redeemed';
    return done ? 'partial' : 'pending';
  }

  matchesHints(c) {
    const s = this.store.settings;
    if (!s.useSourceHints) return true;
    if (s.titles.mode === 'select' && c.games.length) {
      const known = c.games.map((g) => resolveTitle(g) || g);
      if (!known.some((g) => s.titles.selected.includes(g))) return false;
    }
    if (s.platforms.mode === 'select' && c.platforms.length) {
      if (!c.platforms.some((p) => s.platforms.selected.includes(p))) return false;
    }
    return true;
  }

  /** Codes worth sending to SHiFT in an automatic run, most urgent first. */
  queue() {
    const s = this.store.settings;
    const list = Object.values(this.store.db.codes).filter((c) => {
      const st = this.statusOf(c);
      if (st === 'stale') return !s.skipExpired;
      return ['new', 'pending', 'partial', 'retry'].includes(st);
    });
    const soon = (c) => this.expiryOf(c) ?? Infinity;
    return list.sort((a, b) => soon(a) - soon(b) || (b.firstSeen || 0) - (a.firstSeen || 0));
  }

  stats() {
    const counts = { total: 0, new: 0, pending: 0, partial: 0, retry: 0, redeemed: 0, expired: 0, invalid: 0, unavailable: 0, stale: 0, filtered: 0, ignored: 0 };
    for (const c of Object.values(this.store.db.codes)) {
      counts.total++;
      const st = this.statusOf(c);
      counts[st] = (counts[st] || 0) + 1;
    }
    const successes = Object.values(this.store.db.redemptions).filter((r) => r.status === 'success').length;
    return { ...counts, queue: this.queue().length, successes };
  }

  // -------------------------------------------------------------- redemption

  async withRetry(fn, label) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fn();
      } catch (e) {
        res = { status: 'error', message: e.message };
      }
      if (res.status !== 'slowdown' || attempt >= 3 || this.abort) return res;
      const wait = 60 * (attempt + 1);
      this.log('warn', `SHiFT asked us to slow down — waiting ${wait}s before retrying ${label}`);
      this.setState({ message: `Rate limited — pausing ${wait}s` });
      await this.sleep(wait * 1000);
      this.setState({ message: '' });
    }
  }

  /**
   * Redeem the queue (or just `codes`). When SHiFT says "launch a SHiFT-enabled title first",
   * game launch assist starts a game, waits, closes it and carries on — up to MAX_ASSISTS times.
   * With `assistNow`, a game is launched first (the user pressed "Launch game & resume").
   */
  async run({ codes: only = null, assistNow = false } = {}) {
    if (this.state.running) throw new Error(`Busy: ${this.state.kind} in progress`);
    this.abort = false;
    this.setState({ running: true, kind: 'redeem', phase: 'Signing in', done: 0, total: 0, current: null, blocked: [], message: '', assist: null });
    const db = this.store.db;
    const summary = { at: Date.now(), checked: 0, redeemed: 0, already: 0, dead: 0, errors: 0, stopped: null, pause: null, assists: 0 };
    const MAX_ASSISTS = 2;
    try {
      if (!(await this.ensureLogin())) {
        summary.stopped = 'Not signed in';
        this.log('error', 'Not signed in to SHiFT — open the Account tab to connect.');
        return summary;
      }
      if (assistNow) {
        const services = db.lastRun?.pause?.services?.length ? db.lastRun.pause.services : ['steam'];
        const res = await this.assistLaunch(services, { force: true, probe: () => this.probeUnblocked(services, summary) });
        if (res.launched) summary.assists++;
        else if (!res.plan?.ok) this.log('warn', `Couldn't launch a game: ${res.plan?.reason || 'unknown reason'}. Trying to redeem anyway.`);
      }
      for (;;) {
        const blocked = await this.redeemPass(only, summary);
        if (this.abort || summary.stopped || !blocked.size) break;

        const services = [...blocked];
        const waiting = this.queue().length;
        if (summary.assists >= MAX_ASSISTS) {
          summary.stopped = 'Launch a game';
          summary.pause = { services, waiting, why: 'still-blocked', message: `SHiFT is still asking for a game launch after ${summary.assists} attempt(s). Play for a few minutes, then press Resume.` };
          this.log('warn', summary.pause.message);
          break;
        }
        const res = await this.assistLaunch(services, { probe: () => this.probeUnblocked(services, summary) });
        if (this.abort) break;
        if (!res.launched) {
          summary.stopped = 'Launch a game';
          summary.pause = {
            services,
            waiting,
            why: res.ask ? 'ask' : res.plan?.ok === false ? 'cannot-launch' : 'off',
            canLaunch: !!res.plan?.ok,
            game: res.plan?.title || null,
            via: res.plan?.via || null,
            message: res.plan?.ok ? `Ready to launch ${res.plan.title} via ${res.plan.via}.` : res.plan?.reason || 'Game launch assist is off.',
          };
          this.log('warn', `Redeeming paused — SHiFT needs a game launched on ${services.join(', ')}. ${summary.pause.message}`);
          break;
        }
        summary.assists++;
        this.setState({ blocked: [], message: '' });
      }
      if (this.abort && !summary.stopped) summary.stopped = 'Stopped by you';
    } finally {
      summary.finishedAt = Date.now();
      db.lastRun = summary;
      this.setState({ running: false, kind: null, phase: 'idle', current: null, message: '', assist: null });
      this.changed();
    }
    this.log(
      summary.pause ? 'warn' : 'step',
      `Run ${summary.pause ? 'paused' : 'finished'} — ${summary.redeemed} redeemed, ${summary.already} already had, ${summary.dead} expired/invalid, ${summary.errors} error(s)${summary.assists ? `, ${summary.assists} game launch(es)` : ''}${summary.stopped && !summary.pause ? ` · ${summary.stopped}` : ''}`,
    );
    return summary;
  }

  /** One pass over the queue. Returns the set of services SHiFT blocked with "launch a game". */
  async redeemPass(only, summary) {
    const db = this.store.db;
    const s = this.store.settings;
    const list = only ? only.map((c) => db.codes[c]).filter(Boolean) : this.queue();
    const delay = Math.max(2, Number(s.delaySeconds) || 5) * 1000;
    const blocked = new Set();
    this.setState({ phase: 'Redeeming', total: list.length, done: 0 });
    this.log('step', `Processing ${list.length} code(s) — titles: ${s.titles.mode === 'all' ? 'all' : s.titles.selected.join(', ')}; platforms: ${s.platforms.mode === 'all' ? 'all linked' : s.platforms.selected.join(', ')}`);

    for (const c of list) {
      if (this.abort) break;
      if (s.maxChecksPerRun && summary.checked >= s.maxChecksPerRun) {
        this.log('info', `Reached the limit of ${s.maxChecksPerRun} checks for this run`);
        break;
      }
      this.setState({ current: c.code });
      let res = await this.withRetry(() => this.shift.checkCode(c.code), c.code);
      if (res.status === 'auth' && (await this.ensureLogin())) res = await this.withRetry(() => this.shift.checkCode(c.code), c.code);
      summary.checked++;

      c.check = {
        status: res.status,
        message: res.message,
        at: Date.now(),
        offers: (res.offers || []).map((o) => ({ title: o.title, titleId: o.titleId, service: o.service })),
      };
      for (const o of res.offers || []) {
        if (!o.titleId && o.title) db.discoveredTitles[titleKey(o.title)] = o.title;
        if (o.service && !db.seenServices.includes(o.service)) db.seenServices.push(o.service);
      }
      this.changed();

      if (res.status === 'auth') {
        summary.stopped = 'Signed out';
        this.log('error', 'SHiFT session is no longer valid — sign in again from the Account tab.');
        this.refreshAccount();
        break;
      }
      if (res.status !== 'ok') {
        if (DEAD.has(res.status)) summary.dead++;
        else summary.errors++;
        this.log(DEAD.has(res.status) ? 'info' : 'warn', `${c.code}: ${res.message}`, { code: c.code, status: res.status });
        this.setState({ done: this.state.done + 1 });
        await this.sleep(delay);
        continue;
      }

      const titles = [...new Set(res.offers.map((o) => o.title))].join(', ');
      const todo = this.pendingOffers(c.code, res.offers);
      if (!todo.length) this.log('info', `${c.code}: valid for ${titles} — nothing to do for your targets`, { code: c.code });
      await this.sleep(delay);

      for (const o of todo) {
        if (this.abort) break;
        if (blocked.has(o.service)) continue;
        this.setState({ current: `${c.code} → ${o.title} (${o.service})` });
        const r = await this.withRetry(() => this.shift.redeemOffer(o.formData), c.code);
        const key = redemptionKey(c.code, o.title, o.service);
        db.redemptions[key] = { status: r.status, message: r.message, at: Date.now(), title: o.title, service: o.service };
        this.changed();
        const where = `${o.title} / ${o.service}`;
        if (r.status === 'success') {
          summary.redeemed++;
          this.log('ok', `Redeemed ${c.code} for ${where}${c.reward ? ` — ${c.reward}` : ''}`, { code: c.code, status: 'success' });
        } else if (r.status === 'redeemed') {
          summary.already++;
          this.log('info', `${c.code} already redeemed on ${where}`, { code: c.code, status: 'redeemed' });
        } else if (r.status === 'trylater') {
          blocked.add(o.service);
          this.setState({ blocked: [...blocked], message: `SHiFT paused ${[...blocked].join(', ')} until a game is launched` });
          this.log('warn', `SHiFT paused redemptions on ${o.service} until a SHiFT-enabled game is launched. Carrying on with other platforms first.`, { status: 'trylater', service: o.service });
        } else if (r.status === 'expired') {
          c.check.status = 'expired';
          summary.dead++;
          this.log('info', `${c.code}: expired`, { code: c.code, status: 'expired' });
          break;
        } else if (r.status === 'auth') {
          summary.stopped = 'Signed out';
          this.log('error', 'SHiFT session expired mid-run — sign in again.');
          this.abort = true;
        } else {
          summary.errors++;
          this.log('warn', `${c.code} on ${where}: ${r.message}`, { code: c.code, status: r.status });
        }
        await this.sleep(delay);
      }
      this.setState({ done: this.state.done + 1 });

      const services = s.platforms.mode === 'all' ? db.seenServices : s.platforms.selected;
      if (blocked.size && services.length && services.every((x) => blocked.has(x))) break;
    }
    return blocked;
  }

  // -------------------------------------------------------------- game launch assist

  async gameInfo() {
    if (!this.gameCache || Date.now() - this.gameCache.at > 30_000) {
      const steam = await this.games.detectSteam().catch(() => ({ found: false, installed: [] }));
      this.gameCache = { at: Date.now(), steam };
    }
    return { steam: this.gameCache.steam };
  }

  /**
   * Launch a game so SHiFT lifts its block, wait for it to register, then close it.
   * Returns { launched, plan, ask }.
   */
  /**
   * While a game is open for SHiFT: try one of the paused redemptions again. Returns true once SHiFT
   * accepts codes again (so the game can be closed early), false while it's still blocked.
   */
  async probeUnblocked(services, summary) {
    const db = this.store.db;
    const entry = Object.entries(db.redemptions).find(([, r]) => r.status === 'trylater' && services.includes(r.service));
    if (!entry) return false;
    const [key, prev] = entry;
    const code = key.split('|')[0];
    try {
      const res = await this.shift.checkCode(code);
      if (res.status !== 'ok') return res.status !== 'trylater' && res.status !== 'slowdown' && res.status !== 'error';
      const o = (res.offers || []).find((x) => x.service === prev.service && x.title === prev.title);
      if (!o) return false;
      const r = await this.shift.redeemOffer(o.formData);
      if (r.status === 'trylater' || r.status === 'slowdown' || r.status === 'error') return false;
      db.redemptions[key] = { status: r.status, message: r.message, at: Date.now(), title: prev.title, service: prev.service };
      if (r.status === 'success') {
        summary.redeemed++;
        this.log('ok', `Redeemed ${code} for ${prev.title} / ${prev.service}${db.codes[code]?.reward ? ` — ${db.codes[code].reward}` : ''}`, { code, status: 'success' });
      } else if (r.status === 'redeemed') summary.already++;
      this.changed();
      return true;
    } catch {
      return false;
    }
  }

  /** Skip the rest of the wait while a game is open for SHiFT ("Close game & resume"). */
  skipAssist() {
    if (this.state.assist) this.assistSkip = true;
  }

  // Wait in 1-second steps so Stop and "Close game & resume" react straight away.
  async waitAssist(ms) {
    for (let i = 0; i < Math.ceil(ms / 1000); i++) {
      if (this.abort || this.assistSkip) return;
      await this.sleep(Math.min(1000, ms - i * 1000));
    }
  }

  async assistLaunch(services, { force = false, probe = null } = {}) {
    const ga = this.store.settings.gameAssist;
    this.gameCache = null;
    const { steam } = await this.gameInfo();
    const planned = await this.games.planLaunch(services, ga, steam);
    const beforeAll = new Set((await this.games.listProcesses()).map((p) => p.pid));
    const already = await this.games.runningGames();
    // Someone is already playing: SHiFT should notice that game, so just give it time, whatever
    // the launch mode. Nothing is started, and a game we didn't start is never closed.
    if (!already.length) {
      if (!planned.ok) return { launched: false, plan: planned };
      if (!force && ga.mode !== 'auto') return { launched: false, plan: planned, ask: ga.mode === 'ask' };
    }
    const plan = already.length ? { ...planned, ok: true, title: this.games.titleName(already[0].titleId), via: 'the game you have open' } : planned;
    const setAssist = (step, extra = {}) => this.setState({ assist: { step, title: plan.title, via: plan.via, service: plan.service, ...extra } });

    if (already.length) {
      this.log('info', `${this.games.titleName(already[0].titleId)} is already running — giving SHiFT time to notice it`);
    } else {
      this.setState({ phase: 'Launching game', current: `${plan.title} via ${plan.via}` });
      setAssist('launching');
      this.log('step', `SHiFT paused redemptions on ${services.join(', ')}. Launching ${plan.title} via ${plan.via} to unlock them…`);
      try {
        await this.games.launch(plan.target);
      } catch (e) {
        this.log('error', `Couldn't launch ${plan.title}: ${e.message}`);
        this.setState({ assist: null });
        return { launched: false, plan: { ok: false, reason: e.message } };
      }
    }

    // Wait for the game process to appear (Steam may need to start first).
    let proc = already[0] || null;
    const startBy = Date.now() + 240_000;
    setAssist('starting', { since: Date.now() });
    while (!proc && !this.abort && Date.now() < startBy) {
      await this.sleep(3000);
      proc = (await this.games.runningGames()).find((p) => !beforeAll.has(p.pid)) || null;
    }
    if (this.abort) return { launched: false, plan };
    if (!proc) this.log('warn', `Couldn't see ${plan.title} start. If it's running, SHiFT should still notice it — waiting anyway.`);

    // Wait for SHiFT to notice the game. After a short head start, quietly retry one of the
    // paused codes every 15 seconds and move on as soon as SHiFT accepts it, so the game is only
    // open as long as it needs to be. warmupSeconds is the longest it will wait.
    const warm = Math.max(0, Number(ga.warmupSeconds ?? 90)) * 1000;
    const headStart = Math.min(30_000, warm);
    const startedAt = Date.now();
    this.assistSkip = false;
    this.setState({ phase: 'Game running', current: `${plan.title}: waiting for SHiFT` });
    setAssist('warmup', { since: startedAt, endsAt: startedAt + warm, warm });
    this.log('info', `${plan.title} is running — waiting for SHiFT to notice it (up to ${Math.round(warm / 1000)}s)`);
    await this.waitAssist(headStart);
    let waited = headStart;
    let unblocked = false;
    while (!this.abort && !this.assistSkip && waited < warm && probe) {
      setAssist('warmup', { since: startedAt, endsAt: startedAt + warm, warm, checking: true });
      if (await probe()) {
        unblocked = true;
        this.log('ok', `SHiFT is accepting codes again after ${Math.round((Date.now() - startedAt) / 1000)}s`);
        break;
      }
      setAssist('warmup', { since: startedAt, endsAt: startedAt + warm, warm });
      const step = Math.min(15_000, warm - waited);
      await this.waitAssist(step);
      waited += step;
    }
    if (!probe && !this.assistSkip) await this.waitAssist(warm - headStart);
    if (this.assistSkip && !unblocked) this.log('info', 'Skipping the rest of the wait');
    this.assistSkip = false;

    const close = async () => {
      if (!(ga.closeAfter && proc && !beforeAll.has(proc.pid))) return;
      this.setState({ phase: 'Closing game', current: plan.title });
      setAssist('closing');
      this.log('info', `Closing ${plan.title}`);
      await this.games.closeProcess(proc.pid).catch(() => {});
    };
    if (this.abort) {
      await close(); // Stop pressed while the game was open: don't leave a game we started running.
      this.setState({ assist: null });
      return { launched: false, plan };
    }

    await close();
    this.setState({ assist: null, phase: 'Redeeming', current: null });
    this.log('ok', 'Game launch done — resuming redemptions');
    return { launched: true, plan };
  }

  /** Launch the configured game once, without redeeming (Settings → Test). */
  async testLaunch() {
    const { steam } = await this.gameInfo();
    const plan = await this.games.planLaunch(['steam', 'epic'], this.store.settings.gameAssist, steam);
    if (!plan.ok) throw Object.assign(new Error(plan.reason), { status: 400 });
    await this.games.launch(plan.target);
    this.log('info', `Test: launched ${plan.title} via ${plan.via}`);
    return plan;
  }

  stop() {
    if (!this.state.running) return;
    this.abort = true;
    this.setState({ message: 'Stopping…' });
    this.log('info', 'Stopping after the current request…');
  }

  // -------------------------------------------------------------- schedule

  schedule() {
    clearTimeout(this.timer);
    const a = this.store.settings.autoRun;
    this.nextRunAt = null;
    if (a.enabled) {
      const mins = Math.max(15, Number(a.intervalMinutes) || 180);
      this.nextRunAt = Date.now() + mins * 60_000;
      this.timer = setTimeout(() => this.autoRun(), mins * 60_000);
    }
    this.emit('state', this.publicState());
  }

  async autoRun() {
    try {
      if (!this.state.running) {
        this.log('step', 'Auto-run starting');
        if (this.store.settings.autoRun.collectFirst) await this.collect();
        await this.run();
      }
    } catch (e) {
      this.log('error', `Auto-run failed: ${e.message}`);
    } finally {
      this.schedule();
    }
  }

  // -------------------------------------------------------------- views

  catalog() {
    const db = this.store.db;
    return {
      titles: [
        ...TITLES.map(({ id, name, short, color, steamAppId }) => ({ id, name, short, color, steamAppId })),
        ...Object.entries(db.discoveredTitles).map(([id, name]) => ({ id, name, short: name, color: '#9a9a9a', discovered: true })),
      ],
      platforms: PLATFORMS.map(({ id, name, glyph }) => ({ id, name, glyph, linked: db.seenServices.includes(id) })),
    };
  }

  codeView(c) {
    const offers = c.check?.offers || [];
    return {
      code: c.code,
      games: c.games,
      platforms: c.platforms,
      reward: c.reward,
      expires: cleanExpiry(c.expires),
      expiresAt: this.expiryOf(c),
      sources: c.sources,
      firstSeen: c.firstSeen,
      ignored: !!c.ignored,
      status: this.statusOf(c),
      check: c.check ? { status: c.check.status, message: c.check.message, at: c.check.at } : null,
      offers: offers.map((o) => ({
        title: o.title,
        titleId: o.titleId,
        service: o.service,
        targeted: this.wantsTitle(o.title, o.titleId) && this.wantsService(o.service),
        result: this.redemption(c.code, o.title, o.service) || null,
      })),
    };
  }
}
