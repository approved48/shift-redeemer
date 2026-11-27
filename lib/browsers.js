// Find the SHiFT sign-in in the user's own web browsers, so they can connect without copying the
// "si" cookie by hand. Only cookies for shift.gearboxsoftware.com are ever read, nothing is kept
// apart from the SHiFT session the user asked for, and nothing leaves this computer except to SHiFT.
//
// Firefox keeps cookies in plain SQLite. Chrome-family browsers (Chrome, Edge, Brave, Opera,
// Vivaldi, Chromium) encrypt them: with a key protected by Windows (DPAPI), the macOS Keychain, or
// a fixed or keyring password on Linux. Chrome 127+ on Windows uses "app-bound" encryption that
// other programs can't undo; for those the user gets a clear message and the manual steps.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const HOST = 'shift.gearboxsoftware.com';

const run = (cmd, args, { timeout = 20_000 } = {}) =>
  new Promise((resolve) =>
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : String(stdout).trim())),
  );

// Per browser: where its data lives on each OS, and how its cookie key is protected.
const CHROMIUM = [
  { id: 'chrome', name: 'Google Chrome', win: ['L', 'Google/Chrome/User Data'], mac: 'Google/Chrome', linux: ['google-chrome'], keychain: 'Chrome', secret: 'chrome' },
  { id: 'edge', name: 'Microsoft Edge', win: ['L', 'Microsoft/Edge/User Data'], mac: 'Microsoft Edge', linux: ['microsoft-edge'], keychain: 'Microsoft Edge', secret: 'chromium' },
  { id: 'brave', name: 'Brave', win: ['L', 'BraveSoftware/Brave-Browser/User Data'], mac: 'BraveSoftware/Brave-Browser', linux: ['BraveSoftware/Brave-Browser'], keychain: 'Brave', secret: 'brave' },
  { id: 'opera', name: 'Opera', win: ['R', 'Opera Software/Opera Stable'], mac: 'com.operasoftware.Opera', linux: ['opera'], keychain: 'Opera', secret: 'chromium' },
  { id: 'operagx', name: 'Opera GX', win: ['R', 'Opera Software/Opera GX Stable'], mac: 'com.operasoftware.OperaGX', linux: [], keychain: 'Opera', secret: 'chromium' },
  { id: 'vivaldi', name: 'Vivaldi', win: ['L', 'Vivaldi/User Data'], mac: 'Vivaldi', linux: ['vivaldi'], keychain: 'Vivaldi', secret: 'chromium' },
  { id: 'chromium', name: 'Chromium', win: ['L', 'Chromium/User Data'], mac: 'Chromium', linux: ['chromium', '../snap/chromium/common/chromium'], keychain: 'Chromium', secret: 'chromium' },
];

// SHIFT_BROWSER_HOME (tests) points every browser folder at a pretend home directory.
function ctxOf({ platform = process.platform, env = process.env, home } = {}) {
  const fake = home || env.SHIFT_BROWSER_HOME;
  const h = fake || os.homedir();
  return {
    platform,
    home: h,
    local: (!fake && env.LOCALAPPDATA) || path.join(h, 'AppData', 'Local'),
    roaming: (!fake && env.APPDATA) || path.join(h, 'AppData', 'Roaming'),
  };
}

const exists = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};

function chromiumRoots(b, c) {
  if (c.platform === 'win32') return [path.join(b.win[0] === 'L' ? c.local : c.roaming, b.win[1])];
  if (c.platform === 'darwin') return [path.join(c.home, 'Library', 'Application Support', b.mac)];
  return b.linux.map((p) => path.join(c.home, '.config', p));
}

const cookieFileIn = (dir) => [path.join(dir, 'Network', 'Cookies'), path.join(dir, 'Cookies')].find((f) => exists(f)?.isFile());

function chromiumProfiles(root) {
  let names = {};
  try {
    names = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8'))?.profile?.info_cache || {};
  } catch {
    /* no Local State: profile folder names will do */
  }
  const dirs = [root];
  try {
    for (const d of fs.readdirSync(root)) if (/^(Default|Profile \d+)$/.test(d)) dirs.push(path.join(root, d));
  } catch {
    return [];
  }
  return dirs
    .map((dir) => ({ dir, file: cookieFileIn(dir) }))
    .filter((p) => p.file)
    .map((p) => ({ ...p, label: names[path.basename(p.dir)]?.name || (p.dir === root ? '' : path.basename(p.dir)) }));
}

function firefoxRoots(c) {
  if (c.platform === 'win32') return [path.join(c.roaming, 'Mozilla', 'Firefox', 'Profiles')];
  if (c.platform === 'darwin') return [path.join(c.home, 'Library', 'Application Support', 'Firefox', 'Profiles')];
  return [
    path.join(c.home, '.mozilla', 'firefox'),
    path.join(c.home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
    path.join(c.home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'),
  ];
}

function firefoxProfiles(c) {
  const out = [];
  for (const root of firefoxRoots(c)) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const d of dirs) {
      const file = path.join(root, d, 'cookies.sqlite');
      if (exists(file)?.isFile()) out.push({ dir: path.join(root, d), file, label: d.replace(/^[a-z0-9]{8}\./i, '') });
    }
  }
  return out;
}

/** Browsers installed for this user that keep cookies we can look in. */
export function listBrowsers(opts) {
  const c = ctxOf(opts);
  const list = [];
  const ff = firefoxProfiles(c);
  if (ff.length) list.push({ id: 'firefox', name: 'Firefox', kind: 'firefox', profiles: ff });
  for (const b of CHROMIUM) {
    const profiles = chromiumRoots(b, c).flatMap((root) => chromiumProfiles(root).map((p) => ({ ...p, root })));
    if (profiles.length) list.push({ id: b.id, name: b.name, kind: 'chromium', def: b, profiles });
  }
  return list;
}

// ------------------------------------------------------------------ reading cookie databases

class FriendlyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let sqliteMod;
async function openCopy(file) {
  if (!sqliteMod) {
    // node:sqlite prints an "experimental" warning the first time; it's harmless here.
    const emit = process.emitWarning;
    process.emitWarning = (w, ...rest) => (String(w?.message || w).includes('SQLite') ? undefined : emit.call(process, w, ...rest));
    try {
      sqliteMod = await import('node:sqlite');
    } finally {
      process.emitWarning = emit;
    }
  }
  // Browsers keep their cookie file open, so read a copy (with its write-ahead log, if any).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-ck-'));
  const dest = path.join(tmp, 'cookies.db');
  try {
    fs.copyFileSync(file, dest);
    for (const ext of ['-wal', '-shm']) if (exists(file + ext)) fs.copyFileSync(file + ext, dest + ext);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw new FriendlyError('locked', 'The browser is open and has its cookies locked. Close it completely and try again.');
    throw e;
  }
  const db = new sqliteMod.DatabaseSync(dest);
  return {
    all: (sql, ...args) => db.prepare(sql).all(...args),
    close() {
      try {
        db.close();
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  };
}

const HOST_LIKE = `%${HOST}`;

async function firefoxCookies(p) {
  const db = await openCopy(p.file);
  try {
    const rows = db.all('SELECT name, value, expiry FROM moz_cookies WHERE host LIKE ?', HOST_LIKE);
    const now = Date.now() / 1000;
    // Firefox has stored expiry in seconds and (newer versions) milliseconds.
    return Object.fromEntries(rows.filter((r) => !r.expiry || (r.expiry > 1e11 ? r.expiry / 1000 : r.expiry) > now).map((r) => [r.name, r.value]));
  } finally {
    db.close();
  }
}

// --- Chrome-family decryption

async function windowsMasterKey(root) {
  const ls = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8'));
  const enc = Buffer.from(ls?.os_crypt?.encrypted_key || '', 'base64');
  if (enc.subarray(0, 5).toString() !== 'DPAPI') throw new FriendlyError('nokey', 'Could not find the browser\'s cookie key.');
  const script = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${enc.subarray(5).toString('base64')}'), $null, 'CurrentUser'))`;
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
  if (!out) throw new FriendlyError('nokey', 'Windows would not unlock the browser\'s cookie key.');
  return Buffer.from(out, 'base64');
}

async function unixPassword(def, c, version) {
  if (c.platform === 'darwin') {
    // macOS may ask the user to allow access to the browser's entry in the Keychain.
    const pw = await run('security', ['find-generic-password', '-w', '-s', `${def.keychain} Safe Storage`], { timeout: 60_000 });
    if (!pw) throw new FriendlyError('nokey', 'The Keychain did not share the browser\'s cookie key (select Allow if macOS asks).');
    return pw;
  }
  if (version === 'v10') return 'peanuts';
  for (const app of [def.secret, 'chrome', 'chromium']) {
    const pw = await run('secret-tool', ['lookup', 'application', app]);
    if (pw) return pw;
  }
  throw new FriendlyError('nokey', 'Could not read the browser\'s cookie key from the keyring.');
}

/** Decrypt one Chrome-family encrypted_value. Exported for tests. */
export function decryptChromium(buf, { platform, key, password, dbVersion = 0 }) {
  const v = buf.subarray(0, 3).toString();
  let plain;
  if (platform === 'win32') {
    if (v === 'v20') throw new FriendlyError('appbound', 'This browser locks its cookies so other apps can\'t read them.');
    if (v !== 'v10' && v !== 'v11') throw new FriendlyError('format', 'Unknown cookie format.');
    const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(3, 15));
    d.setAuthTag(buf.subarray(buf.length - 16));
    plain = Buffer.concat([d.update(buf.subarray(15, buf.length - 16)), d.final()]);
  } else {
    if (v !== 'v10' && v !== 'v11') throw new FriendlyError('format', 'Unknown cookie format.');
    const k = crypto.pbkdf2Sync(password, 'saltysalt', platform === 'darwin' ? 1003 : 1, 16, 'sha1');
    const d = crypto.createDecipheriv('aes-128-cbc', k, Buffer.alloc(16, ' '));
    plain = Buffer.concat([d.update(buf.subarray(3)), d.final()]);
  }
  // Since Chrome 130 (cookie database version 24) the value is prefixed with a 32-byte hash.
  if (dbVersion >= 24 && plain.length >= 32) plain = plain.subarray(32);
  return plain.toString('utf8');
}

async function chromiumCookies(b, p, c) {
  const db = await openCopy(p.file);
  try {
    let dbVersion = 0;
    try {
      dbVersion = Number(db.all("SELECT value FROM meta WHERE key = 'version'")[0]?.value) || 0;
    } catch {
      /* very old database without a meta table */
    }
    const rows = db.all('SELECT name, value, encrypted_value FROM cookies WHERE host_key LIKE ?', HOST_LIKE);
    if (!rows.length) return {};
    const out = {};
    let key;
    let password;
    for (const r of rows) {
      if (r.value) {
        out[r.name] = r.value;
        continue;
      }
      const buf = Buffer.from(r.encrypted_value || []);
      if (!buf.length) continue;
      const v = buf.subarray(0, 3).toString();
      if (c.platform === 'win32' && v !== 'v20') key ??= await windowsMasterKey(p.root);
      if (c.platform !== 'win32') password ??= await unixPassword(b.def, c, v);
      out[r.name] = decryptChromium(buf, { platform: c.platform, key, password, dbVersion });
    }
    return out;
  } finally {
    db.close();
  }
}

/**
 * Look for a SHiFT session in installed browsers.
 * @param {{browser?: string}} opts browser id, or 'all'
 * @returns {Promise<Array<{browser, name, profile, cookies?, error?, code?}>>} one entry per profile
 */
export async function findShiftSessions({ browser = 'all', ...opts } = {}) {
  const c = ctxOf(opts);
  const found = [];
  for (const b of listBrowsers(opts).filter((x) => browser === 'all' || x.id === browser)) {
    for (const p of b.profiles) {
      const entry = { browser: b.id, name: b.name, profile: p.label };
      try {
        const cookies = b.kind === 'firefox' ? await firefoxCookies(p) : await chromiumCookies(b, p, c);
        if (cookies.si) entry.cookies = cookies;
        else entry.error = 'Not signed in to SHiFT in this browser.';
        entry.code = cookies.si ? 'found' : 'none';
      } catch (e) {
        entry.code = e.code || 'error';
        entry.error = e instanceof FriendlyError ? e.message : `Could not read its cookies (${e.message}).`;
      }
      found.push(entry);
    }
  }
  return found;
}
