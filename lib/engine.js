// Orchestrates code discovery, SHiFT checks and redemptions, and the auto-run timer.

import { EventEmitter } from 'node:events';
import { TITLES, PLATFORMS, titleKey, extractCodes, resolveTitle } from './catalog.js';
import { BUILTIN_SOURCES, customSourceDef, fetchText, codesFromText } from './sources.js';
import { out } from './runtime.js';

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
  constructor({ store, shift }) {
    super();
    this.store = store;
    this.shift = shift;
    this.logs = [];
    this.abort = false;
    this.state = { running: false, kind: null, phase: 'idle', current: null, done: 0, total: 0, blocked: [], message: '' };
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

  async login(email, password, remember) {
    await this.shift.login(email, password);
    this.store.saveSession({ email, credentials: remember ? { email, password } : undefined });
    this.store.updateSettings({ rememberCredentials: !!remember });
    this.account = { loggedIn: true, email, checkedAt: Date.now(), error: null };
    this.log('ok', `Signed in to SHiFT as ${email}`);
    this.emit('account', this.account);
    return this.account;
  }

  async useCookies(cookies) {
    this.shift.setCookies(cookies);
    const acc = await this.refreshAccount();
    if (acc.loggedIn) this.log('ok', 'Imported browser session — signed in to SHiFT');
    return acc;
  }

  logout() {
    this.shift.setCookies({});
    this.store.saveSession({ cookies: {}, credentials: undefined });
    this.account = { loggedIn: false, email: this.store.session.email || null, checkedAt: Date.now(), error: null };
    this.log('info', 'Signed out (local session cleared)');
    this.emit('account', this.account);
  }

  async ensureLogin() {
    const acc = await this.refreshAccount();
    if (acc.loggedIn) return true;
    const cred = this.store.session.credentials;
    if (cred && cred.email && cred.password) {
      this.log('info', 'Session expired — signing in again with saved credentials');
      try {
        await this.login(cred.email, cred.password, true);
        return true;
      } catch (e) {
        this.log('error', `Automatic sign-in failed: ${e.message}`);
      }
    }
    return false;
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
      if (r.expires && !c.expires) c.expires = r.expires;
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
    return parseExpiry(c.expires);
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

  async run({ codes: only = null } = {}) {
    if (this.state.running) throw new Error(`Busy: ${this.state.kind} in progress`);
    this.abort = false;
    this.setState({ running: true, kind: 'redeem', phase: 'Signing in', done: 0, total: 0, current: null, blocked: [], message: '' });
    const db = this.store.db;
    const summary = { at: Date.now(), checked: 0, redeemed: 0, already: 0, dead: 0, errors: 0, stopped: null };
    try {
      if (!(await this.ensureLogin())) {
        summary.stopped = 'Not signed in';
        this.log('error', 'Not signed in to SHiFT — open the Account tab to connect.');
        return summary;
      }
      const s = this.store.settings;
      const list = only ? only.map((c) => db.codes[c]).filter(Boolean) : this.queue();
      const delay = Math.max(2, Number(s.delaySeconds) || 5) * 1000;
      const blocked = new Set();
      this.setState({ phase: 'Redeeming', total: list.length });
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
            this.setState({ blocked: [...blocked] });
            this.log('warn', `SHiFT wants you to launch a SHiFT-enabled game on ${o.service} before redeeming more. Skipping ${o.service} for the rest of this run.`, { status: 'trylater', service: o.service });
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
        if (blocked.size && services.length && services.every((x) => blocked.has(x))) {
          summary.stopped = 'Launch a game';
          this.log('warn', 'Every target platform needs a game launch before SHiFT will redeem more. Launch any SHiFT-enabled Borderlands game, sit at the main menu for a minute, then run again.');
          break;
        }
      }
      if (this.abort && !summary.stopped) summary.stopped = 'Stopped by you';
    } finally {
      summary.finishedAt = Date.now();
      db.lastRun = summary;
      this.setState({ running: false, kind: null, phase: 'idle', current: null, message: '' });
      this.changed();
    }
    this.log(
      'step',
      `Run finished — ${summary.redeemed} redeemed, ${summary.already} already had, ${summary.dead} expired/invalid, ${summary.errors} error(s)${summary.stopped ? ` · ${summary.stopped}` : ''}`,
    );
    return summary;
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
      expires: c.expires,
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
