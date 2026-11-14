#!/usr/bin/env node
// SHiFT Redeemer — local web app. Run `node server.js`, then open http://localhost:4777
// Binds to 127.0.0.1 only; your SHiFT session never leaves this machine except to talk to Gearbox.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { Store } from './lib/store.js';
import { ShiftClient, parseCookieInput } from './lib/shift.js';
import { Engine } from './lib/engine.js';
import { extractCodes } from './lib/catalog.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4777;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const BASE_URL = process.env.SHIFT_BASE_URL || 'https://shift.gearboxsoftware.com';

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(`Node.js 18 or newer is required (you have ${process.version}).`);
  process.exit(1);
}

const store = new Store(DATA_DIR);
const shift = new ShiftClient({
  baseUrl: BASE_URL,
  cookies: store.session.cookies || {},
  onCookies: (cookies) => store.saveSession({ cookies }),
});
const engine = new Engine({ store, shift });

// ------------------------------------------------------------------ SSE

const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
engine.on('log', (e) => broadcast('log', e));
engine.on('state', (s) => broadcast('state', s));
engine.on('account', (a) => broadcast('account', a));
engine.on('codes', () => broadcast('codes', { stats: engine.stats() }));
setInterval(() => broadcast('ping', Date.now()), 25_000).unref();

// ------------------------------------------------------------------ helpers

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
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

function fullState() {
  const s = store.settings;
  const sourceStatus = store.db.sourceStatus;
  return {
    account: { ...engine.account, hasSavedCredentials: !!store.session.credentials, cookieNames: Object.keys(shift.jar.cookies) },
    engine: engine.publicState(),
    settings: s,
    stats: engine.stats(),
    catalog: engine.catalog(),
    sources: engine.sourceDefs().map((d) => ({ id: d.id, name: d.name, site: d.site, description: d.description, enabled: d.enabled, custom: !!d.custom, status: sourceStatus[d.id] || null })),
    logs: engine.logs.slice(-200),
    baseUrl: BASE_URL,
  };
}

function background(promise) {
  promise.catch((e) => engine.log('error', e.message));
}

// ------------------------------------------------------------------ routes

const routes = {
  'GET /api/state': () => fullState(),
  'GET /api/codes': () => ({ codes: Object.values(store.db.codes).map((c) => engine.codeView(c)), stats: engine.stats() }),

  'POST /api/account/login': async ({ body }) => {
    if (!body.email || !body.password) throw Object.assign(new Error('Email and password are required'), { status: 400 });
    return { account: await engine.login(String(body.email).trim(), String(body.password), !!body.remember) };
  },
  'POST /api/account/cookie': async ({ body }) => {
    const cookies = parseCookieInput(body.cookie);
    if (!Object.keys(cookies).length) throw Object.assign(new Error('Paste the value of the "si" cookie'), { status: 400 });
    const account = await engine.useCookies(cookies);
    if (!account.loggedIn) throw Object.assign(new Error('SHiFT did not accept that cookie — copy the "si" value again while signed in.'), { status: 400 });
    return { account };
  },
  'POST /api/account/check': async () => ({ account: await engine.refreshAccount() }),
  'POST /api/account/logout': () => {
    engine.logout();
    return { account: engine.account };
  },

  'PUT /api/settings': ({ body }) => {
    const allowed = ['titles', 'platforms', 'delaySeconds', 'skipExpired', 'useSourceHints', 'maxChecksPerRun', 'autoRun', 'sources'];
    const patch = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    if (patch.titles?.selected && !Array.isArray(patch.titles.selected)) delete patch.titles.selected;
    if (patch.platforms?.selected && !Array.isArray(patch.platforms.selected)) delete patch.platforms.selected;
    store.updateSettings(patch);
    if ('rememberCredentials' in body && !body.rememberCredentials) {
      store.saveSession({ credentials: undefined });
      store.updateSettings({ rememberCredentials: false });
    }
    if ('autoRun' in patch) engine.schedule();
    engine.changed();
    return fullState();
  },

  'POST /api/sources/custom': ({ body }) => {
    let url;
    try {
      url = new URL(String(body.url || '').trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      throw Object.assign(new Error('Enter a full http(s) URL'), { status: 400 });
    }
    if (body.follow) {
      try {
        new RegExp(body.follow);
      } catch {
        throw Object.assign(new Error('The link pattern is not a valid regular expression'), { status: 400 });
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
  'POST /api/stop': () => {
    engine.stop();
    return { ok: true };
  },

  'POST /api/codes/add': ({ body }) => {
    const codes = engine.addManual(String(body.text || ''));
    if (!codes.length) throw Object.assign(new Error('No SHiFT codes found in that text (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)'), { status: 400 });
    if (body.redeem) background(engine.run({ codes }));
    return { codes };
  },
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!allowedHost(req.headers.host)) {
    res.writeHead(403).end('Forbidden host');
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    // CSRF guard: only same-origin JS (which can set this header) may call the API.
    if (req.method !== 'GET' && req.headers['x-shift-redeemer'] !== '1') return send(res, 403, { error: 'Missing app header' });
    const origin = req.headers.origin;
    if (origin && !allowedHost(new URL(origin).host)) return send(res, 403, { error: 'Cross-origin request blocked' });

    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: hello\ndata: {}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return send(res, 404, { error: 'Not found' });
    try {
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
      send(res, 200, await handler({ body, query: url.searchParams }));
    } catch (e) {
      send(res, e.status || 500, { error: e.message });
    }
    return;
  }

  // static files
  let file = path.normalize(path.join(ROOT, 'public', decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(path.join(ROOT, 'public'))) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is in use. Is SHiFT Redeemer already running? Try PORT=4778 node server.js`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  SHiFT Redeemer is running → ${link}\n  Data folder: ${DATA_DIR}\n  Press Ctrl+C to stop.\n`);
  if (BASE_URL !== 'https://shift.gearboxsoftware.com') console.log(`  (Using SHiFT endpoint ${BASE_URL})\n`);
  if (!process.argv.includes('--no-open') && process.env.NO_OPEN !== '1') {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    try {
      spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    } catch {
      /* no browser available */
    }
  }
  if (store.session.cookies && Object.keys(store.session.cookies).length) await engine.refreshAccount().catch(() => {});
  engine.schedule();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}
