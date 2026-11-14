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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'dist', 'build');
const bin =
  process.argv[2] ||
  { win32: path.join(BUILD, 'SHiFT Redeemer.exe'), darwin: path.join(BUILD, 'SHiFT Redeemer.app', 'Contents', 'MacOS', 'shift-redeemer'), linux: path.join(BUILD, 'SHiFT-Redeemer', 'shift-redeemer') }[process.platform];
assert.ok(fs.existsSync(bin), `Built app not found at ${bin} — run npm run build first`);

const PORT = 4791;
const base = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-smoke-'));
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
  for (const f of ['/app.js', '/styles.css', '/icon.svg']) assert.equal((await fetch(base + f)).status, 200, `${f} missing`);
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
