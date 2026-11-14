// End-to-end tests against the mock SHiFT server. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMock, CODES } from './mock-shift.js';
import { Store } from '../lib/store.js';
import { ShiftClient, parseCookieInput, classifyMessage } from '../lib/shift.js';
import { Engine } from '../lib/engine.js';
import { parseOffers } from '../lib/html.js';
import { extractCodes, resolveTitle, detectTitles } from '../lib/catalog.js';
import { codesFromHtml, codesFromText } from '../lib/sources.js';

process.env.QUIET = '1';
let mock;
let dir;
const made = [];

function makeEngine() {
  const store = new Store(dir);
  const shift = new ShiftClient({ baseUrl: mock.url, cookies: store.session.cookies || {}, onCookies: (cookies) => store.saveSession({ cookies }) });
  const engine = new Engine({ store, shift });
  made.push({ store, engine });
  return { store, shift, engine };
}

before(async () => {
  mock = await startMock();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-redeemer-'));
});
after(async () => {
  for (const { store, engine } of made) {
    store.flush();
    clearTimeout(engine.changeTimer);
  }
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('helpers: code extraction, titles, messages, cookies', () => {
  assert.deepEqual(extractCodes('x t9rjb-3xwbs-6tjjj-3tbtj-sfxzk y XXXXX-XXXXX-XXXXX-XXXXX-XXXXX'), ['T9RJB-3XWBS-6TJJJ-3TBTJ-SFXZK']);
  assert.equal(resolveTitle('Borderlands The Pre-Sequel'), 'tps');
  assert.equal(resolveTitle('Borderlands: Game of the Year Edition'), 'bl1');
  assert.equal(resolveTitle("Tiny Tina's Wonderlands"), 'ttw');
  assert.equal(resolveTitle('Some Future Game'), null);
  assert.deepEqual(detectTitles('New BL4 code!'), ['bl4']);
  assert.equal(classifyMessage('To continue to redeem SHiFT codes, please launch a SHiFT-enabled title first!'), 'trylater');
  assert.equal(classifyMessage('Your code was successfully redeemed'), 'success');
  assert.equal(classifyMessage('Failed to redeem your SHiFT code. This SHiFT code has already been redeemed'), 'redeemed');
  assert.equal(classifyMessage('This SHiFT code has expired'), 'expired');
  assert.deepEqual(parseCookieInput('abc123'), { si: 'abc123' });
  assert.deepEqual(parseCookieInput('Cookie: si=abc; _session_id=zz'), { si: 'abc', _session_id: 'zz' });
});

test('source parsing: tables and free text', () => {
  const html = `<table><tr><th>Reward</th><th>Expires</th><th>Code</th></tr>
    <tr><td>5 Golden Keys</td><td>Nov 17, 2026</td><td><code>S6RJJ-6THZT-BJJTJ-TB3JT-R995J</code></td></tr></table>`;
  const [c] = codesFromHtml(html, { games: ['bl4'] });
  assert.equal(c.code, 'S6RJJ-6THZT-BJJTJ-TB3JT-R995J');
  assert.equal(c.reward, '5 Golden Keys');
  assert.equal(c.expires, 'Nov 17, 2026');
  const [t] = codesFromText('Borderlands 3 code for 3 Golden Keys: ABCDE-12345-ABCDE-12345-ABCDE expires Dec 1, 2026');
  assert.deepEqual(t.games, ['bl3']);
  assert.equal(t.expires, 'Dec 1, 2026');
});

test('offer parser assigns forms to their headings', async () => {
  const html = `<h2>Borderlands 3</h2><form class="new_archway_code_redemption" action="/code_redemptions"><input name="archway_code_redemption[service]" value="steam"><input type="submit" name="commit" value="Redeem for Steam"></form>
    <h2>Borderlands 2</h2><form action="/code_redemptions"><input name="archway_code_redemption[service]" value="epic"></form>`;
  const offers = parseOffers(html);
  assert.deepEqual(offers.map((o) => [o.title, o.service]), [['Borderlands 3', 'steam'], ['Borderlands 2', 'epic']]);
  assert.equal(offers[0].formData.commit, 'Redeem for Steam');
});

test('login rejects bad credentials, accepts good ones, cookie persists', async () => {
  const { engine, store } = makeEngine();
  await assert.rejects(engine.login('vault@hunter.test', 'nope'));
  await engine.login('vault@hunter.test', 'hunter2');
  assert.ok(store.session.cookies.si);
  assert.equal(store.session.credentials, undefined);
  // new client from persisted cookie
  const again = makeEngine();
  assert.equal((await again.engine.refreshAccount()).loggedIn, true);
  // cookie import path
  const imp = makeEngine();
  await imp.engine.logout();
  assert.equal((await imp.engine.useCookies({ si: store.session.cookies.si })).loggedIn, true);
});

test('full run respects title & platform targets', async () => {
  const { engine, store } = makeEngine();
  engine.addManual(Object.keys(CODES).join('\n'));
  store.updateSettings({ delaySeconds: 0, titles: { mode: 'select', selected: ['bl3', 'bl4', 'bl1'] }, platforms: { mode: 'select', selected: ['steam'] }, useSourceHints: false });
  engine.sleep = async () => {};
  const summary = await engine.run();
  // C: BL3/steam (BL2 untargeted, epic untargeted); D: BL4/steam; F: BL GOTY/steam (future game untargeted); E: TTW untargeted
  assert.equal(summary.redeemed, 3, JSON.stringify(summary));
  assert.equal(summary.dead, 2);
  assert.ok(mock.redeemed.has('CCCCC-CCCCC-CCCCC-CCCCC-CCCC1|chk-Borderlands3|steam'));
  assert.ok(!mock.redeemed.has('CCCCC-CCCCC-CCCCC-CCCCC-CCCC1|chk-Borderlands3|epic'));
  const db = store.db;
  assert.equal(db.codes['AAAAA-AAAAA-AAAAA-AAAAA-AAAA1'].check.status, 'expired');
  assert.equal(db.codes['BBBBB-BBBBB-BBBBB-BBBBB-BBBB1'].check.status, 'invalid');
  assert.equal(engine.statusOf(db.codes['DDDDD-DDDDD-DDDDD-DDDDD-DDDD1']), 'redeemed');
  assert.equal(engine.statusOf(db.codes['EEEEE-EEEEE-EEEEE-EEEEE-EEEE1']), 'filtered');
  assert.ok(db.discoveredTitles['raw:somefuturegame']);
  assert.ok(db.seenServices.includes('psn'));

  // Second run: nothing left in the queue for these targets, no SHiFT checks wasted.
  const before = mock.stats.checks;
  const s2 = await engine.run();
  assert.equal(s2.checked, 0);
  assert.equal(mock.stats.checks, before);

  // Widen to all titles + all platforms → picks up the rest.
  store.updateSettings({ titles: { mode: 'all' }, platforms: { mode: 'all' } });
  const s3 = await engine.run();
  // C: BL3/epic, BL2/steam, BL2/epic; D: BL4/psn; E: TTW/steam; F: future/steam
  assert.equal(s3.redeemed, 6, JSON.stringify(s3));
  assert.equal(engine.stats().queue, 0);
});

test('"launch a game" blocks the platform and stops the run', async () => {
  fs.rmSync(path.join(dir, 'db.json'), { force: true });
  mock.redeemed.clear();
  mock.launchGame();
  mock.setLaunchAfter(1);
  const { engine, store } = makeEngine();
  engine.sleep = async () => {};
  engine.addManual('DDDDD-DDDDD-DDDDD-DDDDD-DDDD1 EEEEE-EEEEE-EEEEE-EEEEE-EEEE1 CCCCC-CCCCC-CCCCC-CCCCC-CCCC1');
  store.updateSettings({ titles: { mode: 'all' }, platforms: { mode: 'select', selected: ['steam'] } });
  const s = await engine.run();
  assert.equal(s.redeemed, 1);
  assert.equal(s.stopped, 'Launch a game');
  assert.deepEqual(engine.state.blocked, ['steam']); // kept so the UI can tell you which platform
  // After launching a game, a new run continues where it left off.
  mock.launchGame();
  mock.setLaunchAfter(Infinity);
  const s2 = await engine.run();
  assert.equal(s2.redeemed, 3, JSON.stringify(s2)); // E/steam, C BL3/steam, C BL2/steam (D/steam done already)
});

test('remember me: secure store, plain-text only with consent, migration, auto sign-in', async () => {
  const sessionFile = path.join(dir, 'session.json');
  const read = () => JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const { loadSecret } = await import('../lib/secrets.js');

  // 1. Secure store available → password goes to the vault, never to disk.
  process.env.SHIFT_SECRETS = 'memory';
  let { engine, store } = makeEngine();
  await engine.login('vault@hunter.test', 'hunter2', { remember: true });
  assert.deepEqual(read().credentials, { email: 'vault@hunter.test', store: 'memory' });
  assert.ok(!fs.readFileSync(sessionFile, 'utf8').includes('hunter2'), 'password leaked to disk');
  assert.equal(await loadSecret('vault@hunter.test'), 'hunter2');
  assert.equal((await engine.credentialsInfo()).saved.secure, true);

  // 2. Session expires → auto sign-in uses the vault.
  store.saveSession({ cookies: {} });
  ({ engine } = makeEngine());
  assert.equal(await engine.ensureLogin(), true);

  // 3. Sign-out removes the vault entry too.
  await engine.logout();
  assert.equal(await loadSecret('vault@hunter.test'), null);
  assert.equal(read().credentials, undefined);

  // 4. No secure store → refuse to write plain text unless the user agrees.
  process.env.SHIFT_SECRETS = 'unavailable';
  ({ engine } = makeEngine());
  await assert.rejects(engine.login('vault@hunter.test', 'hunter2', { remember: true }), (e) => e.status === 409 && e.code === 'SECURE_STORE_UNAVAILABLE');
  assert.equal(read().credentials, undefined);
  assert.equal(engine.account.loggedIn, true, 'should still be signed in for this session');
  await engine.login('vault@hunter.test', 'hunter2', { remember: true, allowPlaintext: true });
  assert.deepEqual(read().credentials, { email: 'vault@hunter.test', store: 'plaintext', password: 'hunter2' });
  assert.equal((await engine.credentialsInfo()).saved.secure, false);

  // 5. Unticking "remember" forgets it.
  await engine.login('vault@hunter.test', 'hunter2');
  assert.equal(read().credentials, undefined);

  // 6. A plain-text password from an older version moves into the vault once one is available.
  ({ engine, store } = makeEngine());
  store.saveSession({ credentials: { email: 'vault@hunter.test', password: 'hunter2' } });
  process.env.SHIFT_SECRETS = 'memory';
  await engine.migrateCredentials();
  assert.deepEqual(read().credentials, { email: 'vault@hunter.test', store: 'memory' });
  assert.equal(await loadSecret('vault@hunter.test'), 'hunter2');
  delete process.env.SHIFT_SECRETS;
});
