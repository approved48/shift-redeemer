#!/usr/bin/env node
// SHiFT Redeemer — local web app.
//   Packaged app: double-click it; it opens its own window.
//   From source:  `node server.js`, then open http://localhost:4777
// Binds to 127.0.0.1 only; your SHiFT session never leaves this machine except to talk to Gearbox.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { Store } from './lib/store.js';
import { ShiftClient, parseCookieInput } from './lib/shift.js';
import { Engine } from './lib/engine.js';
import { extractCodes } from './lib/catalog.js';
import * as rt from './lib/runtime.js';
import { buildReport } from './lib/rewards.js';
import * as updater from './lib/updater.js';

const ROOT = rt.isPackaged ? path.dirname(process.execPath) : path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const BASE_PORT = Number(process.env.PORT) || 4777;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || (rt.isPackaged ? rt.appDataDir() : path.join(ROOT, 'data'));
const BASE_URL = process.env.SHIFT_BASE_URL || 'https://shift.gearboxsoftware.com';
// Started by the updater after installing a new version: "window" means the old window is still
// open and will reconnect by itself (we open a new one only if it doesn't), "background" means no
// window was open.
const AFTER_UPDATE = (process.argv.find((a) => a.startsWith('--after-update')) || '').split('=')[1] || (process.argv.includes('--after-update') ? 'window' : null);
const BACKGROUND = process.argv.includes('--background') || AFTER_UPDATE === 'background';
const NO_WINDOW = BACKGROUND || !!AFTER_UPDATE || process.argv.includes('--no-open') || process.env.NO_OPEN === '1';
// Packaged app quits a little while after its window is closed (unless auto-pilot is on).
const CLOSE_WITH_WINDOW = rt.isPackaged ? process.env.STAY_OPEN !== '1' : process.env.CLOSE_WITH_WINDOW === '1';

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`Node.js 20 or newer is required (you have ${process.version}).`);
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
rt.initLog(DATA_DIR);
process.on('uncaughtException', (e) => rt.out(`Unexpected error: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => rt.out(`Unexpected error: ${e?.stack || e}`));

const store = new Store(DATA_DIR);
const shift = new ShiftClient({
  baseUrl: BASE_URL,
  cookies: store.session.cookies || {},
  onCookies: (cookies) => store.saveSession({ cookies }),
});
const engine = new Engine({ store, shift });
const app = { version: rt.VERSION, packaged: rt.isPackaged, platform: process.platform, dataDir: DATA_DIR, autostart: false, autostartSupported: rt.autostartSupported, update: null, updateCheckedAt: null, updateError: null, installKind: updater.installKind().kind, justUpdated: !!AFTER_UPDATE };
let port = BASE_PORT;

// ------------------------------------------------------------------ SSE

const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
engine.on('log', (e) => broadcast('log', e));
engine.on('state', (s) => {
  broadcast('state', s);
  if (!s.running) scheduleIdleExit();
});
engine.on('account', async () => broadcast('account', await accountView()));
engine.on('codes', () => broadcast('codes', { stats: engine.stats() }));
setInterval(() => broadcast('ping', Date.now()), 25_000).unref();

// ------------------------------------------------------------------ lifecycle

let idleTimer = null;
let everConnected = false;
const startedAt = Date.now();
const STARTUP_GRACE = BACKGROUND ? 60_000 : 180_000;
function scheduleIdleExit(delay = 45_000) {
  if (!CLOSE_WITH_WINDOW) return;
  clearTimeout(idleTimer);
  // Before the window has ever connected, wait out the startup grace period instead.
  if (!everConnected) delay = Math.max(delay, STARTUP_GRACE - (Date.now() - startedAt));
  idleTimer = setTimeout(() => {
    if (clients.size || engine.state.running || store.settings.autoRun.enabled) return;
    rt.out('Window closed — shutting down.');
    quit();
  }, delay);
}

function quit(code = 0) {
  try {
    store.flush();
  } catch {
    /* ignore */
  }
  for (const res of clients) res.end();
  setTimeout(() => process.exit(code), 150);
}

const appUrl = () => `http://localhost:${port}`;
const showWindow = () => (rt.isPackaged ? rt.openAppWindow(appUrl()) : rt.openInBrowser(appUrl()));

// ------------------------------------------------------------------ helpers

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const allowedHost = (h) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h || '') || (HOST !== '127.0.0.1' && HOST !== 'localhost');

async function fullState() {
  const s = store.settings;
  const sourceStatus = store.db.sourceStatus;
  return {
    app,
    account: await accountView(),
    engine: engine.publicState(),
    settings: s,
    stats: engine.stats(),
    catalog: engine.catalog(),
    sources: engine.sourceDefs().map((d) => ({ id: d.id, name: d.name, site: d.site, description: d.description, enabled: d.enabled, custom: !!d.custom, unsure: !!d.unsure, status: sourceStatus[d.id] || null })),
    logs: engine.logs.slice(-200),
    games: await engine.gameInfo(),
    baseUrl: BASE_URL,
  };
}

async function accountView() {
  return { ...engine.account, cookieNames: Object.keys(shift.jar.cookies), ...(await engine.credentialsInfo()) };
}

function background(promise) {
  promise.catch((e) => engine.log('error', e.message));
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ------------------------------------------------------------------ routes

const routes = {
  'GET /api/ping': () => ({ app: 'shift-redeemer', version: rt.VERSION, pid: process.pid, afterUpdate: AFTER_UPDATE }),
  'POST /api/update/check': async () => {
    await checkUpdate({ manual: true });
    return { app };
  },
  'POST /api/update/install': () => {
    installUpdate();
    return { app };
  },
  'GET /api/state': () => fullState(),
  'GET /api/report': ({ query }) => {
    const days = Number(query.get('days')) || 0;
    const platform = query.get('platform') || null;
    return buildReport(store.db, { since: days ? Date.now() - days * 86_400_000 : null, platform, wants: (titleId, service) => engine.wantsTitle(null, titleId) && engine.wantsService(service) });
  },
  'GET /api/codes': () => ({ codes: Object.values(store.db.codes).map((c) => engine.codeView(c)), stats: engine.stats() }),

  'POST /api/app/show': () => {
    showWindow();
    return { ok: true };
  },
  'POST /api/app/quit': () => {
    rt.out('Quit requested from the app window.');
    setTimeout(() => quit(), 200);
    return { ok: true };
  },
  'POST /api/app/open-data': () => {
    rt.revealFolder(DATA_DIR);
    return { ok: true };
  },
  'POST /api/app/open-url': ({ body }) => {
    const u = String(body.url || '');
    if (!/^https:\/\//.test(u)) throw bad('Only https links can be opened');
    rt.openInBrowser(u);
    return { ok: true };
  },
  'PUT /api/app/autostart': async ({ body }) => {
    app.autostart = await rt.setAutostart(!!body.enabled);
    return { app };
  },

  'POST /api/account/login': async ({ body }) => {
    if (!body.email || !body.password) throw bad('Email and password are required');
    await engine.login(String(body.email).trim(), String(body.password), { remember: !!body.remember, allowPlaintext: body.allowPlaintext === true });
    return { account: await accountView() };
  },
  'POST /api/account/cookie': async ({ body }) => {
    const cookies = parseCookieInput(body.cookie);
    if (!Object.keys(cookies).length) throw bad('Paste the value of the "si" cookie');
    const account = await engine.useCookies(cookies);
    if (!account.loggedIn) throw bad('SHiFT did not accept that cookie — copy the "si" value again while signed in.');
    return { account };
  },
  'POST /api/account/check': async () => {
    await engine.refreshAccount();
    return { account: await accountView() };
  },
  'POST /api/account/logout': async () => {
    await engine.logout();
    return { account: await accountView() };
  },
  'POST /api/account/forget': async () => {
    await engine.forgetCredentials();
    return { account: await accountView() };
  },

  'PUT /api/settings': async ({ body }) => {
    const allowed = ['titles', 'platforms', 'delaySeconds', 'skipExpired', 'useSourceHints', 'maxChecksPerRun', 'autoRun', 'sources', 'setupComplete', 'gameAssist', 'updates'];
    const patch = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    if (patch.gameAssist) {
      const g = patch.gameAssist;
      if ('mode' in g && !['auto', 'ask', 'off'].includes(g.mode)) throw bad('Unknown game launch mode');
      if ('epicLink' in g) {
        g.epicLink = String(g.epicLink || '').trim();
        if (g.epicLink && !/^com\.epicgames\.launcher:\/\//i.test(g.epicLink)) throw bad('That isn\'t an Epic launch link. It should start with com.epicgames.launcher://');
      }
      if ('warmupSeconds' in g) g.warmupSeconds = Math.min(600, Math.max(20, Number(g.warmupSeconds) || 90));
      if ('playing' in g) g.playing = !!g.playing;
      if ('dontAsk' in g) g.dontAsk = !!g.dontAsk;
      if ('askedAt' in g) g.askedAt = Math.min(Date.now(), Math.max(0, Number(g.askedAt) || 0));
    }
    if (patch.titles?.selected && !Array.isArray(patch.titles.selected)) delete patch.titles.selected;
    if (patch.platforms?.selected && !Array.isArray(patch.platforms.selected)) delete patch.platforms.selected;
    store.updateSettings(patch);
    if ('rememberCredentials' in body && !body.rememberCredentials) await engine.forgetCredentials();
    if ('autoRun' in patch) {
      engine.schedule();
      scheduleIdleExit();
    }
    engine.changed();
    return fullState();
  },

  'POST /api/sources/custom': ({ body }) => {
    let url;
    try {
      url = new URL(String(body.url || '').trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      throw bad('Enter a full http(s) URL');
    }
    if (body.follow) {
      try {
        new RegExp(body.follow);
      } catch {
        throw bad('The link pattern is not a valid regular expression');
      }
    }
    const cs = { id: crypto.randomBytes(4).toString('hex'), name: String(body.name || '').trim() || url.host, url: url.toString(), follow: String(body.follow || '').trim(), enabled: true };
    store.updateSettings({ customSources: [...store.settings.customSources, cs] });
    return fullState();
  },
  'DELETE /api/sources/custom': ({ query }) => {
    store.updateSettings({ customSources: store.settings.customSources.filter((c) => c.id !== query.get('id')) });
    return fullState();
  },

  'POST /api/collect': ({ body }) => {
    background(engine.collect({ only: Array.isArray(body.only) ? body.only : null }));
    return { started: true };
  },
  'POST /api/run': ({ body }) => {
    const codes = Array.isArray(body.codes) ? body.codes.map((c) => String(c).toUpperCase()) : null;
    background(
      (async () => {
        if (body.collectFirst) await engine.collect();
        await engine.run({ codes });
      })(),
    );
    return { started: true };
  },
  'POST /api/games/resume': () => {
    background(engine.run({ assistNow: true }));
    return { started: true };
  },
  'POST /api/games/test': async () => ({ plan: await engine.testLaunch() }),
  'POST /api/games/refresh': async () => {
    engine.gameCache = null;
    return { games: await engine.gameInfo() };
  },
  'POST /api/stop': () => {
    engine.stop();
    return { ok: true };
  },

  'POST /api/codes/add': ({ body }) => {
    const codes = engine.addManual(String(body.text || ''));
    if (!codes.length) throw bad('No SHiFT codes found in that text (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)');
    if (body.redeem) background(engine.run({ codes }));
    return { codes };
  },
  'POST /api/codes/import': ({ body }) => {
    const text = String(body.text || '');
    if (!text.trim()) throw bad('The list is empty');
    const res = engine.importList(text, String(body.filename || ''), { dryRun: body.dryRun === true });
    if (!res.found) throw bad('No SHiFT codes found in that list (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)');
    if (!body.dryRun && body.redeem) background(engine.run({ codes: res.codes }));
    return res;
  },
  'POST /api/games/skip': () => {
    engine.skipAssist();
    return { ok: true };
  },
  'GET /api/llm-instructions': ({ query }) => engine.llmInstructions({ skipKnown: query.get('skipKnown') === '1', version: rt.VERSION }),
  'GET /api/codes/export': ({ query }) => engine.exportList(query.get('format') || 'txt', query.get('which') || 'working', rt.VERSION),
  'POST /api/codes/ignore': ({ body }) => {
    for (const code of extractCodes((body.codes || []).join(' '))) if (store.db.codes[code]) store.db.codes[code].ignored = !!body.ignored;
    engine.changed();
    return { ok: true };
  },
  'POST /api/codes/reset': ({ body }) => {
    for (const code of extractCodes((body.codes || []).join(' '))) {
      const c = store.db.codes[code];
      if (!c) continue;
      delete c.check;
      for (const k of Object.keys(store.db.redemptions)) if (k.startsWith(`${code}|`)) delete store.db.redemptions[k];
    }
    engine.changed();
    return { ok: true };
  },
  'GET /api/export': () => ({ exportedAt: new Date().toISOString(), codes: store.db.codes, redemptions: store.db.redemptions, settings: store.settings }),
};

function serveStatic(url, res) {
  let rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  if (rel.includes('..') || rel.includes('\\')) {
    res.writeHead(403).end();
    return;
  }
  const type = MIME[path.extname(rel)] || 'application/octet-stream';
  const ok = (data) => {
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(data);
  };
  if (rt.isPackaged) {
    const data = rt.getAsset(rel);
    if (data) return ok(data);
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  fs.readFile(path.join(PUBLIC, rel), (err, data) => (err ? res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found') : ok(data)));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!allowedHost(req.headers.host)) {
    res.writeHead(403).end('Forbidden host');
    return;
  }

  if (!url.pathname.startsWith('/api/')) return serveStatic(url, res);

  // CSRF guard: only same-origin JS (which can set this header) may call the API.
  if (req.method !== 'GET' && req.headers['x-shift-redeemer'] !== '1') return send(res, 403, { error: 'Missing app header' });
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      /* malformed */
    }
    if (!allowedHost(host)) return send(res, 403, { error: 'Cross-origin request blocked' });
  }

  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`event: hello\ndata: {}\n\n`);
    clients.add(res);
    everConnected = true;
    clearTimeout(idleTimer);
    req.on('close', () => {
      clients.delete(res);
      if (!clients.size) scheduleIdleExit();
    });
    return;
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'Not found' });
  try {
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
    send(res, 200, await handler({ body, query: url.searchParams }));
  } catch (e) {
    send(res, e.status || 500, { error: e.message, code: e.code, ...(e.extra || {}) });
  }
});

// ------------------------------------------------------------------ start

/** Is another copy of this app already answering on that port? */
async function existingInstance(p) {
  try {
    const r = await fetch(`http://127.0.0.1:${p}/api/ping`, { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    return j && j.app === 'shift-redeemer';
  } catch {
    return false;
  }
}

function listen(p) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => {
      server.off('listening', onOk);
      reject(e);
    };
    const onOk = () => {
      server.off('error', onErr);
      resolve();
    };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(p, HOST);
  });
}

async function start() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const p = BASE_PORT + attempt;
    try {
      await listen(p);
      port = p;
      break;
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
      if (await existingInstance(p)) {
        // Already running: just bring up its window and leave.
        rt.out(`SHiFT Redeemer is already running on port ${p} — opening it.`);
        if (!BACKGROUND) {
          await fetch(`http://127.0.0.1:${p}/api/app/show`, { method: 'POST', headers: { 'x-shift-redeemer': '1' } }).catch(() => {});
        }
        process.exit(0);
      }
      if (attempt === 11) throw new Error(`No free port between ${BASE_PORT} and ${p}`);
    }
  }

  rt.out(`\n  SHiFT Redeemer ${rt.VERSION} is running → ${appUrl()}\n  Data folder: ${DATA_DIR}\n  ${rt.isPackaged ? 'Close the app window to quit.' : 'Press Ctrl+C to stop.'}\n`);
  if (BASE_URL !== 'https://shift.gearboxsoftware.com') rt.out(`  (Using SHiFT endpoint ${BASE_URL})\n`);

  if (AFTER_UPDATE) {
    engine.log('ok', `Updated to SHiFT Redeemer ${rt.VERSION}`);
    // The old window normally reconnects on its own; open one if it doesn't.
    if (AFTER_UPDATE === 'window' && process.env.NO_OPEN !== '1') setTimeout(() => !clients.size && showWindow(), 8000);
  }
  if (!NO_WINDOW) showWindow();
  // Quit if the window never connects (e.g. no browser could open).
  scheduleIdleExit();

  app.autostart = await rt.getAutostart().catch(() => false);
  await engine.migrateCredentials().catch((e) => rt.out(`Could not migrate saved password: ${e.message}`));
  if (store.session.cookies && Object.keys(store.session.cookies).length) await engine.refreshAccount().catch(() => {});
  engine.seedStarter();
  engine.schedule();

  const autoCheck = () => store.settings.updates?.autoCheck !== false && checkUpdate().catch(() => {});
  setTimeout(autoCheck, 5000);
  setInterval(autoCheck, 6 * 3600_000).unref();
  // Auto-install waits until nothing is running.
  setInterval(() => maybeAutoInstall(), 10 * 60_000).unref();
}

// ------------------------------------------------------------------ updates

let lastProgress = 0;
async function checkUpdate({ manual = false } = {}) {
  if (process.env.NO_UPDATE_CHECK === '1' && !process.env.SHIFT_UPDATE_API && !manual) return;
  if (['downloading', 'installing'].includes(app.update?.state)) return;
  try {
    const u = await updater.checkLatest();
    app.update = u ? { ...u, state: 'available', progress: 0, error: null } : null;
    app.updateError = null;
  } catch (e) {
    app.updateError = `Couldn't check for updates: ${e.message}`;
    if (manual) {
      app.updateCheckedAt = Date.now();
      broadcast('app', app);
      throw bad(app.updateError, 502);
    }
  }
  app.updateCheckedAt = Date.now();
  broadcast('app', app);
  maybeAutoInstall();
}

function maybeAutoInstall() {
  const u = app.update;
  if (!store.settings.updates?.autoInstall || !u?.canInstall || u.state !== 'available' || engine.state.running) return;
  engine.log('info', `Installing SHiFT Redeemer ${u.version} automatically (Settings → Updates)`);
  try {
    installUpdate();
  } catch {
    /* tried again later */
  }
}

function installUpdate() {
  const u = app.update;
  if (!u) throw bad('There’s no update to install. Check for updates first.');
  if (!u.canInstall) throw bad(u.reason || 'This update can’t be installed from inside the app.');
  if (engine.state.running) throw bad('Wait for the current run to finish, or press Stop, then update.', 409);
  if (['downloading', 'installing'].includes(u.state)) return;
  Object.assign(u, { state: 'downloading', progress: 0, error: null });
  broadcast('app', app);
  engine.log('step', `Downloading SHiFT Redeemer ${u.version}…`);
  (async () => {
    try {
      const { file } = await updater.download(u.asset, {
        onProgress: (p) => {
          u.progress = p;
          if (Date.now() - lastProgress > 250 || p === 1) {
            lastProgress = Date.now();
            broadcast('app', app);
          }
        },
      });
      u.state = 'installing';
      broadcast('app', app);
      engine.log('step', `Installing SHiFT Redeemer ${u.version}. The app restarts by itself in a moment.`);
      const { target } = updater.installKind();
      updater.startHelper({ kind: u.kind, file, target, relaunchArgs: [`--after-update=${clients.size ? 'window' : 'background'}`] });
      setTimeout(() => quit(), 800);
    } catch (e) {
      Object.assign(u, { state: 'error', error: e.message });
      broadcast('app', app);
      engine.log('error', `Update failed: ${e.message}`);
    }
  })();
}

start().catch((e) => {
  rt.out(`Could not start: ${e.message}`);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => quit());
