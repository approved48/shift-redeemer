// Launches the *built* app (not the source) against the mock SHiFT server and checks that
// it serves the UI, signs in, redeems a code, refuses a second copy, and quits cleanly.
// Usage: npm run smoke   (after npm run build)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startMock } from '../test/mock-shift.js';
import { secureStoreInfo, loadSecret } from '../lib/secrets.js';
import { listProcesses } from '../lib/games.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'dist', 'build');
const bin =
  process.argv[2] ||
  { win32: path.join(BUILD, 'SHiFT Redeemer.exe'), darwin: path.join(BUILD, 'SHiFT Redeemer.app', 'Contents', 'MacOS', 'shift-redeemer'), linux: path.join(BUILD, 'SHiFT-Redeemer', 'shift-redeemer') }[process.platform];
assert.ok(fs.existsSync(bin), `Built app not found at ${bin} — run npm run build first`);

const PORT = 4791;
const base = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-smoke-'));
process.env.SHIFT_SECRETS_NAMESPACE = `smoke-${process.pid}`;
const mock = await startMock();
const env = { ...process.env, NO_OPEN: '1', NO_UPDATE_CHECK: '1', PORT: String(PORT), DATA_DIR: dataDir, SHIFT_BASE_URL: mock.url };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-shift-redeemer': '1' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${p}: ${j.error}`);
  return j;
};

console.log(`Smoke testing ${bin}`);
const child = spawn(bin, [], { env, stdio: 'ignore' });
let exited = null;
child.on('exit', (code) => (exited = code));

try {
  // 1. comes up
  let ping;
  for (let i = 0; i < 60 && !ping; i++) {
    await sleep(500);
    ping = await fetch(`${base}/api/ping`).then((r) => r.json()).catch(() => null);
    if (exited !== null) throw new Error(`App exited early with code ${exited}`);
  }
  assert.equal(ping?.app, 'shift-redeemer', 'app did not start');
  console.log(`✔ started (v${ping.version})`);

  // 2. serves the embedded UI
  const html = await fetch(`${base}/`).then((r) => r.text());
  assert.match(html, /SHiFT Redeemer/);
  for (const f of ['/app.js', '/help.js', '/report.js', '/lists.js', '/styles.css', '/icon.svg']) assert.equal((await fetch(base + f)).status, 200, `${f} missing`);
  const st = await api('GET', '/api/state');
  assert.equal(st.app.packaged, true, 'not running in packaged mode');
  console.log('✔ UI served from embedded assets');

  // 3. sign in + redeem
  await api('POST', '/api/account/login', { email: 'vault@hunter.test', password: 'hunter2' });
  await api('PUT', '/api/settings', { delaySeconds: 2 });
  await api('POST', '/api/codes/add', { text: 'DDDDD-DDDDD-DDDDD-DDDDD-DDDD1', redeem: true });
  let code;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    code = (await api('GET', '/api/codes')).codes.find((c) => c.code === 'DDDDD-DDDDD-DDDDD-DDDDD-DDDD1');
    if (code?.status === 'redeemed') break;
  }
  assert.equal(code?.status, 'redeemed', `redeem failed: ${JSON.stringify(code)}`);
  assert.ok(fs.existsSync(path.join(dataDir, 'session.json')), 'session not saved');
  console.log('✔ signed in and redeemed a code');
  const rep = await api('GET', '/api/report');
  assert.ok(rep.totals.rewards >= 1 && rep.months.length === 12, 'rewards report missing the redemption');
  console.log(`✔ rewards report counts it (${rep.totals.rewards} reward(s))`);
  const imp = await api('POST', '/api/codes/import', { text: 'code,reward\nEEEEE-EEEEE-EEEEE-EEEEE-EEEE1,Test', filename: 'friend.csv' });
  const exp = await api('GET', '/api/codes/export?format=json&which=all');
  assert.ok(imp.found === 1 && JSON.parse(exp.content).codes.some((c) => c.code === 'EEEEE-EEEEE-EEEEE-EEEEE-EEEE1'), 'import/export round trip failed');
  assert.ok(!/vault@hunter/.test(exp.content), 'export leaked the account email');
  console.log('✔ code list import and export work');

  // 3b. "Keep me signed in" uses the OS password store (Credential Manager / Keychain)
  const login = (extra = {}) =>
    fetch(`${base}/api/account/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shift-redeemer': '1' },
      body: JSON.stringify({ email: 'vault@hunter.test', password: 'hunter2', remember: true, ...extra }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  let r = await login();
  const info = await secureStoreInfo();
  if (r.status === 409) {
    assert.equal(r.body.code, 'SECURE_STORE_UNAVAILABLE');
    console.log(`  secure storage unavailable here (${r.body.reason}) — testing the plain-text consent path`);
    r = await login({ allowPlaintext: true });
  }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const saved = r.body.account.saved;
  assert.ok(saved, 'password not saved');
  const sessionText = fs.readFileSync(path.join(dataDir, 'session.json'), 'utf8');
  if (saved.secure) {
    assert.ok(!sessionText.includes('hunter2'), 'password leaked into session.json');
    assert.equal(await loadSecret('vault@hunter.test'), 'hunter2', `password not readable from ${info.name}`);
    await api('POST', '/api/account/forget');
    assert.equal(await loadSecret('vault@hunter.test'), null, `password still in ${info.name} after Forget`);
    console.log(`✔ password saved to and removed from ${info.name}`);
  } else {
    assert.ok(!info.available || process.platform === 'linux', `expected ${info.name} to work on ${process.platform}`);
    assert.ok(sessionText.includes('hunter2'));
    await api('POST', '/api/account/forget');
    assert.ok(!fs.readFileSync(path.join(dataDir, 'session.json'), 'utf8').includes('hunter2'), 'plain-text password not removed');
    console.log('✔ plain-text fallback saved only with consent, and removed on Forget');
  }

  // 3c. game launch assist plumbing works on this OS (Steam detection + process list)
  const g = await api('POST', '/api/games/refresh');
  assert.equal(typeof g.games?.steam?.found, 'boolean', 'game detection failed');
  const procs = await listProcesses();
  assert.ok(procs.length > 3 && procs.some((p) => p.pid === process.pid), `process list looks wrong (${procs.length} entries)`);
  console.log(`✔ game detection works (Steam ${g.games.steam.found ? 'found' : 'not installed'}; ${procs.length} processes listed)`);

  // 4. a second launch hands over to the running copy and exits
  const second = spawn(bin, ['--background'], { env, stdio: 'ignore' });
  const code2 = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), 20_000);
    second.on('exit', (c) => (clearTimeout(t), resolve(c)));
  });
  assert.equal(code2, 0, 'second instance did not exit cleanly');
  console.log('✔ second launch detected the running app');

  // 5. quit from the UI
  await api('POST', '/api/app/quit');
  for (let i = 0; i < 40 && exited === null; i++) await sleep(250);
  assert.equal(exited, 0, 'app did not quit');
  console.log('✔ quit cleanly');
  console.log('\nSMOKE TEST PASSED');
} catch (e) {
  console.error(`\nSMOKE TEST FAILED: ${e.message}`);
  const log = path.join(dataDir, 'app.log');
  if (fs.existsSync(log)) console.error(`--- app.log ---\n${fs.readFileSync(log, 'utf8')}`);
  process.exitCode = 1;
} finally {
  if (exited === null) child.kill();
  await mock.close();
}
