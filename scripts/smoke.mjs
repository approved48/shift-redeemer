// Launches the *built* app (not the source) against the mock SHiFT server and checks that
// it serves the UI, signs in, redeems a code, refuses a second copy, and quits cleanly.
// Usage: npm run smoke   (after npm run build)

import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startMock } from '../test/mock-shift.js';
import { secureStoreInfo, loadSecret } from '../lib/secrets.js';
import { listProcesses, muteProcesses } from '../lib/games.js';

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

// A pretend GitHub release, "99.0.0", whose download is this OS's own release file, so the
// in-app updater can be tested for real: download, verify, quit, install, restart.
const RELEASE_DIR = path.join(ROOT, 'dist', 'release');
const releaseFiles = fs.existsSync(RELEASE_DIR) ? fs.readdirSync(RELEASE_DIR) : [];
const relServer = http.createServer((req, res) => {
  if (req.url === '/release') {
    const assets = releaseFiles.map((name) => {
      const buf = fs.readFileSync(path.join(RELEASE_DIR, name));
      return { name, size: buf.length, digest: `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`, browser_download_url: `http://127.0.0.1:${relServer.address().port}/dl/${encodeURIComponent(name)}` };
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://example.invalid/release', body: "## What's new\n- Smoke test update\n\n## Download\n", assets }));
  }
  const name = decodeURIComponent((req.url.match(/^\/dl\/(.+)$/) || [])[1] || '');
  if (!releaseFiles.includes(name)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fs.statSync(path.join(RELEASE_DIR, name)).size });
  fs.createReadStream(path.join(RELEASE_DIR, name)).pipe(res);
});
await new Promise((r) => relServer.listen(0, '127.0.0.1', r));

const env = { ...process.env, NO_OPEN: '1', NO_UPDATE_CHECK: '1', PORT: String(PORT), DATA_DIR: dataDir, SHIFT_BASE_URL: mock.url, SHIFT_UPDATE_API: `http://127.0.0.1:${relServer.address().port}/release` };
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
  for (const f of ['/app.js', '/help.js', '/report.js', '/lists.js', '/glossary.js', '/titleart.js', '/zoom.js', '/tour.js', '/styles.css', '/icon.svg']) assert.equal((await fetch(base + f)).status, 200, `${f} missing`);
  const st = await api('GET', '/api/state');
  assert.equal(st.app.packaged, true, 'not running in packaged mode');
  console.log('✔ UI served from embedded assets');
  let starter = 0;
  for (let i = 0; i < 20 && !starter; i++) {
    starter = (await api('GET', '/api/state')).stats.total;
    if (!starter) await sleep(250);
  }
  assert.ok(starter >= 100, `a new install should start with the starter list (has ${starter} codes)`);
  console.log(`✔ new install starts with ${starter} starter codes`);

  // 3. sign in + redeem
  await api('POST', '/api/account/login', { email: 'vault@hunter.test', password: 'hunter2' });
  await api('PUT', '/api/settings', { delaySeconds: 3, smartPace: false });
  assert.equal((await api('GET', '/api/state')).settings.delaySeconds, 3);
  await api('PUT', '/api/settings', { delaySeconds: 1 });
  assert.equal((await api('GET', '/api/state')).settings.delaySeconds, 3, 'the 3-second minimum can\'t be lowered');
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
  const ai = await api('GET', '/api/llm-instructions?skipKnown=1');
  assert.ok(/shift-redeemer-code-list/.test(ai.content) && ai.content.includes('EEEEE-EEEEE-EEEEE-EEEEE-EEEE1') && !/vault@hunter/.test(ai.content), 'AI instructions wrong');
  console.log('✔ AI search instructions generated');

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
  if (process.platform === 'win32') {
    // The mute helper compiles and runs (CI machines may have no sound device: then it reports -1).
    const m = await muteProcesses([process.pid]);
    assert.ok(m.ok, `mute helper failed: ${m.error}`);
    console.log(`✔ game mute helper works (${m.muted < 0 ? 'no sound device here' : `${m.muted} session(s)`})`);
  }

  // 4. a second launch hands over to the running copy and exits
  const second = spawn(bin, ['--background'], { env, stdio: 'ignore' });
  const code2 = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), 20_000);
    second.on('exit', (c) => (clearTimeout(t), resolve(c)));
  });
  assert.equal(code2, 0, 'second instance did not exit cleanly');
  console.log('✔ second launch detected the running app');

  // 5. in-app update: finds the "new" release, downloads and verifies it, quits, installs, restarts
  const chk = (await api('POST', '/api/update/check')).app;
  assert.equal(chk.update?.version, '99.0.0', `update not found: ${JSON.stringify(chk.updateError || chk.update)}`);
  assert.ok(chk.update.canInstall, `update can't install: ${chk.update.reason}`);
  assert.match(chk.update.notes, /Smoke test update/);
  console.log(`✔ update found (${chk.installKind}: ${chk.update.asset.name})`);
  for (let i = 0; i < 120 && (await api('GET', '/api/state')).engine.running; i++) await sleep(500); // updates wait for runs to finish
  const oldPid = (await api('GET', '/api/ping')).pid;
  await api('POST', '/api/update/install');
  for (let i = 0; i < 120 && exited === null; i++) await sleep(500);
  assert.equal(exited, 0, 'app did not quit to install the update');
  let back = null;
  const quickPing = () => fetch(`${base}/api/ping`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => null);
  for (const until = Date.now() + 150_000; Date.now() < until && !(back && back.pid !== oldPid); ) {
    await sleep(1000);
    back = await quickPing();
  }
  if (!(back && back.pid !== oldPid)) {
    const log = path.join(os.tmpdir(), 'shift-redeemer-update', 'update.log');
    if (fs.existsSync(log)) console.error(`--- update.log ---\n${fs.readFileSync(log, 'utf8')}`);
  }
  assert.ok(back && back.pid !== oldPid, 'app did not restart after installing the update');
  assert.equal(back.afterUpdate, 'background');
  let reported = false;
  for (let i = 0; i < 20 && !reported; i++) {
    reported = (await api('GET', '/api/state')).logs.some((l) => /Updated to SHiFT Redeemer/.test(l.msg));
    if (!reported) await sleep(250);
  }
  assert.ok(reported, 'restarted app did not report the update');
  console.log(`✔ update installed and the app restarted by itself (pid ${oldPid} → ${back.pid})`);

  // 6. quit from the UI
  await api('POST', '/api/app/quit');
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (!(await quickPing())) break;
  }
  assert.equal(await quickPing(), null, 'app did not quit');
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
  relServer.close();
}
