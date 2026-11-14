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
  // A list of codes, one per line: no code should borrow its neighbour as a "reward".
  const list = codesFromText('AAAAA-11111-AAAAA-11111-AAAAA\nBBBBB-22222-BBBBB-22222-BBBBB');
  assert.deepEqual(list.map((c) => c.reward), ['', '']);
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

test('game launch assist: launches, waits, closes, resumes — or pauses with a clear reason', async () => {
  const games = await import('../lib/games.js');
  assert.deepEqual(games.parseLibraryFolders('"libraryfolders"{ "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" } "1" { "path" "D:\\\\SteamLibrary" } }'), [
    'C:\\Program Files (x86)\\Steam',
    'D:\\SteamLibrary',
  ]);

  const launched = [];
  const closed = [];
  let running = [];
  const fakeGames = {
    ...games,
    detectSteam: async () => ({ found: true, root: 'C:/Steam', installed: ['bl3', 'bl2'] }),
    listProcesses: async () => running.map((p) => ({ pid: p.pid, name: p.name })),
    runningGames: async () => {
      if (running.length) mock.launchGame(); // like real SHiFT: a running game counts, whoever started it
      return running;
    },
    launch: async (target) => {
      launched.push(target);
      running = [{ pid: 999, name: 'Borderlands2.exe', titleId: 'bl2' }];
      mock.launchGame(); // SHiFT lifts its block once a game has run
    },
    closeProcess: async (pid) => {
      closed.push(pid);
      running = running.filter((p) => p.pid !== pid);
    },
  };
  const fresh = () => {
    fs.rmSync(path.join(dir, 'db.json'), { force: true });
    mock.redeemed.clear();
    mock.launchGame();
    const { store, shift } = makeEngine();
    const engine = new Engine({ store, shift, games: fakeGames });
    made.push({ store, engine });
    engine.sleep = async () => {};
    engine.addManual('DDDDD-DDDDD-DDDDD-DDDDD-DDDD1 EEEEE-EEEEE-EEEEE-EEEEE-EEEE1 CCCCC-CCCCC-CCCCC-CCCCC-CCCC1');
    store.updateSettings({ titles: { mode: 'all' }, platforms: { mode: 'select', selected: ['steam'] }, gameAssist: { mode: 'auto', game: 'auto', warmupSeconds: 0, closeAfter: true } });
    return { engine, store };
  };

  // 1. Automatic: SHiFT blocks after 2 redemptions → BL2 (fastest installed) is launched, closed, run resumes.
  mock.setLaunchAfter(2);
  let { engine, store } = fresh();
  let s = await engine.run();
  assert.equal(s.redeemed, 4, JSON.stringify(s));
  assert.equal(s.assists, 1);
  assert.equal(s.pause, null);
  assert.deepEqual(launched, ['steam://rungameid/49520']);
  assert.deepEqual(closed, [999], 'should close the game it started');

  // 2. A game the user already had open is never closed.
  launched.length = 0;
  closed.length = 0;
  ({ engine } = fresh());
  running = [{ pid: 555, name: 'Borderlands3.exe', titleId: 'bl3' }];
  s = await engine.run();
  assert.equal(s.redeemed, 4, JSON.stringify(s));
  assert.deepEqual(launched, [], 'should not launch when a game is already running');
  assert.deepEqual(closed, []);
  running = [];

  // 3. "Ask me": pauses with a ready-to-launch reason; "Launch game & resume" then finishes.
  ({ engine, store } = fresh());
  store.updateSettings({ gameAssist: { mode: 'ask' } });
  s = await engine.run();
  assert.equal(s.redeemed, 2);
  assert.equal(s.pause.why, 'ask');
  assert.equal(s.pause.canLaunch, true);
  assert.equal(s.pause.game, 'Borderlands 2');
  assert.deepEqual(s.pause.services, ['steam']);
  assert.ok(s.pause.waiting >= 1);
  s = await engine.run({ assistNow: true });
  assert.equal(s.redeemed, 2, JSON.stringify(s));
  assert.equal(s.pause, null);

  // 3b. "Ask me" while the user is already playing: nothing is started or closed, SHiFT sees the
  // open game and the run simply carries on.
  launched.length = 0;
  closed.length = 0;
  mock.setLaunchAfter(2);
  ({ engine, store } = fresh());
  store.updateSettings({ gameAssist: { mode: 'ask', playing: true } });
  running = [{ pid: 777, name: 'Borderlands4.exe', titleId: 'bl4' }];
  s = await engine.run();
  assert.equal(s.redeemed, 4, JSON.stringify(s));
  assert.equal(s.pause, null);
  assert.deepEqual(launched, []);
  assert.deepEqual(closed, []);
  running = [];

  // 3c. Seamless: the game is closed as soon as SHiFT accepts codes again, not after the full wait.
  launched.length = 0;
  closed.length = 0;
  mock.setLaunchAfter(2);
  ({ engine, store } = fresh());
  store.updateSettings({ gameAssist: { mode: 'auto', warmupSeconds: 120 } });
  let naps = 0;
  engine.sleep = async () => void naps++;
  s = await engine.run();
  assert.equal(s.redeemed, 4, JSON.stringify(s));
  assert.equal(s.assists, 1);
  assert.deepEqual(closed, [999]);
  assert.ok(naps < 60, `waited too long before closing (${naps} naps)`);

  // 3d. "Close game & resume" skips the rest of the wait.
  closed.length = 0;
  ({ engine, store } = fresh());
  store.updateSettings({ gameAssist: { mode: 'auto', warmupSeconds: 120 } });
  naps = 0;
  engine.probeUnblocked = async () => false; // SHiFT hasn't noticed yet…
  engine.sleep = async () => {
    if (engine.state.assist?.step === 'warmup' && ++naps === 3) engine.skipAssist(); // …but the user presses the button
  };
  s = await engine.run();
  assert.deepEqual(closed, [999]);
  assert.ok(naps < 10, `skip didn't cut the wait short (${naps} naps)`);

  // 3e. Stop while the game is open closes the game it started.
  closed.length = 0;
  ({ engine, store } = fresh());
  store.updateSettings({ gameAssist: { mode: 'auto', warmupSeconds: 120 } });
  naps = 0;
  engine.probeUnblocked = async () => false;
  engine.sleep = async () => {
    if (engine.state.assist?.step === 'warmup' && ++naps === 3) engine.stop();
  };
  s = await engine.run();
  assert.equal(s.stopped, 'Stopped by you');
  assert.deepEqual(closed, [999], 'Stop should close the game the app started');
  running = [];

  // 4. Consoles can't be launched remotely → paused with that explanation.
  mock.setLaunchAfter(0);
  ({ engine, store } = fresh());
  store.updateSettings({ platforms: { mode: 'select', selected: ['psn'] } });
  s = await engine.run();
  assert.equal(s.pause.why, 'cannot-launch');
  assert.match(s.pause.message, /console/i);

  mock.setLaunchAfter(Infinity);
});

test('code lists: import every format, export without account data', async () => {
  const { parseCodeList, exportCodeList, LIST_FORMAT } = await import('../lib/codelists.js');
  const A = 'AAAAA-11111-AAAAA-11111-AAAAA';
  const B = 'BBBBB-22222-BBBBB-22222-BBBBB';
  // plain text, with noise and duplicates
  let r = parseCodeList(`from my mate:\n${A.toLowerCase()} 5 Golden Keys\n${B}\n${A}`);
  assert.equal(r.kind, 'text');
  assert.deepEqual(r.records.map((x) => x.code), [A, B]);
  // CSV (semicolon, quoted, extra columns)
  r = parseCodeList(`Code;Reward;Game;Expires\n${A};"3 Golden Keys; BL2";Borderlands 2;Dec 1, 2026\n${B};;Borderlands 4;`);
  assert.equal(r.kind, 'csv');
  assert.equal(r.records[0].reward, '3 Golden Keys; BL2');
  assert.deepEqual(r.records[0].games, ['bl2']);
  assert.equal(r.records[0].expires, 'Dec 1, 2026');
  // community feed JSON
  r = parseCodeList(JSON.stringify([{ meta: {}, codes: [{ code: A, game: 'Borderlands 4', platform: 'universal', reward: '5 Golden Keys', expired: true }] }]));
  assert.equal(r.records[0].expired, true);
  assert.deepEqual(r.records[0].games, ['bl4']);
  // our own list round-trips, and exports carry no account data
  const codes = [
    { code: A, reward: '5 Golden Keys', games: ['bl4'], platforms: [], expires: '', check: { status: 'ok' } },
    { code: B, reward: '', games: [], platforms: [], expires: '', check: { status: 'expired' } },
  ];
  const json = exportCodeList(codes, 'json', '1.2.0');
  const doc = JSON.parse(json.content);
  assert.equal(doc.format, LIST_FORMAT);
  assert.deepEqual(doc.codes.map((c) => c.state), ['valid', 'expired']);
  assert.ok(!/redeemed|email|password|steam/i.test(json.content.replace(/"platforms"/g, '')), 'export leaked account data');
  r = parseCodeList(json.content);
  assert.equal(r.kind, 'list');
  assert.equal(r.records[1].expired, true);
  assert.equal(exportCodeList(codes, 'txt').content, `${A}\n${B}\n`);
  assert.match(exportCodeList(codes, 'csv').content, /^code,reward,games,platforms,expires,state\r\n/);

  // engine: dry run reports, real import adds with a source label
  const { engine, store } = makeEngine();
  const dry = engine.importList(`${A}\n${B}`, 'friends.txt', { dryRun: true });
  assert.equal(dry.found, 2);
  assert.ok(!store.db.codes[B] || dry.fresh < 2);
  engine.importList(`${A}\n${B}\nCCCCC-33333-CCCCC-33333-CCCCC`, 'friends.txt');
  assert.equal(store.db.codes['CCCCC-33333-CCCCC-33333-CCCCC'].sources[0].name, 'Imported list (friends.txt)');
});

test('rewards report: parses keys per title and aggregates', async () => {
  const { parseReward, buildReport } = await import('../lib/rewards.js');
  const k = (t, id) => parseReward(t, id).keys;
  assert.deepEqual(k('5 Golden Keys', 'bl4'), { golden: 5, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('1 Golden Key', 'bl3'), { golden: 1, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('10 Skeleton Keys', 'ttw'), { golden: 0, diamond: 0, skeleton: 10 });
  // shared code: Diamond Keys only for the game named after them
  const pax = 'This SHiFT Code unlocks 50 Golden Keys in multiple Gearbox games plus 20 Diamond Keys in Borderlands 3!';
  assert.deepEqual(k(pax, 'bl3'), { golden: 50, diamond: 20, skeleton: 0 });
  assert.deepEqual(k(pax, 'bl2'), { golden: 50, diamond: 0, skeleton: 0 });
  // "each for <list of games>"
  const movie = 'unlocks one Golden Key each for Borderlands: Game of the Year Edition, Borderlands 2, Borderlands: The Pre-Sequel, and Borderlands 3!';
  assert.deepEqual(k(movie, 'bl2'), { golden: 1, diamond: 0, skeleton: 0 });
  assert.deepEqual(k(movie, 'bl4'), { golden: 0, diamond: 0, skeleton: 0 });
  // cosmetic items and unknowns
  assert.equal(parseReward('Cosmic Hunter Skin', 'bl3').item, 'Cosmic Hunter Skin');
  assert.equal(parseReward('3 Golden Keys and a Weapon Skin', 'bl3').item, '3 Golden Keys and a Weapon Skin');
  assert.equal(parseReward('', 'bl3').unknown, true);
  // real-world feed quirks
  assert.deepEqual(k('50 Golden PAX West Keys', 'bl1'), { golden: 50, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('1 Golden Key2K Japan', 'bl4'), { golden: 1, diamond: 0, skeleton: 0 });
  assert.equal(parseReward('1 Golden Key2K Japan', 'bl4').item, null);
  assert.deepEqual(k('SDCC 2024 Skeleton Keys', 'ttw'), { golden: 0, diamond: 0, skeleton: 1 });
  assert.equal(parseReward('Vault Hunter SkinHype Squad', 'bl4').item, 'Vault Hunter Skin: Hype Squad');
  assert.equal(parseReward('Vault Hunter skinLuck of the Kairish', 'bl4').item, 'Vault Hunter skin: Luck of the Kairish');

  const now = Date.now();
  const db = {
    codes: { 'AAAAA-1': { reward: '5 Golden Keys' }, 'BBBBB-2': { reward: pax }, 'CCCCC-3': { reward: 'Neon Skin' } },
    redemptions: {
      'AAAAA-1|bl4|steam': { status: 'success', at: now, title: 'Borderlands 4', service: 'steam' },
      'BBBBB-2|bl3|steam': { status: 'success', at: now, title: 'Borderlands 3', service: 'steam' },
      'BBBBB-2|bl2|epic': { status: 'success', at: now, title: 'Borderlands 2', service: 'epic' },
      'CCCCC-3|bl3|steam': { status: 'redeemed', at: now, title: 'Borderlands 3', service: 'steam' },
      'CCCCC-3|bl2|steam': { status: 'trylater', at: now, title: 'Borderlands 2', service: 'steam' },
    },
  };
  const r = buildReport(db);
  assert.deepEqual(r.totals.keys, { golden: 105, diamond: 20, skeleton: 0 });
  assert.equal(r.totals.rewards, 3);
  assert.equal(r.totals.already, 1);
  assert.equal(r.titles.find((t) => t.id === 'bl3').keys.diamond, 20);
  assert.equal(r.months.length, 12);
  assert.equal(r.months.at(-1).golden, 105);
  assert.equal(buildReport(db, { platform: 'epic' }).totals.keys.golden, 50);
  assert.equal(buildReport(db, { since: now + 1000 }).totals.rewards, 0);
});

test('rewards v1.3: count styles, keys per game, cosmetics by type', async () => {
  const { parseReward, classifyItem, buildReport } = await import('../lib/rewards.js');
  const k = (t, id) => parseReward(t, id).keys;
  assert.deepEqual(k('x3 Golden Keys (NEW)', 'bl4'), { golden: 3, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('Golden Key x5', 'bl4'), { golden: 5, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('3x Golden Keys', 'bl2'), { golden: 3, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('x50 Golden Keys and x20 Diamond Keys', 'bl3'), { golden: 50, diamond: 20, skeleton: 0 });
  // one shared code, the right kind of key in each game
  assert.deepEqual(k('3 Skeleton Keys', 'bl3'), { golden: 3, diamond: 0, skeleton: 0 });
  assert.deepEqual(k('5 Golden Keys', 'ttw'), { golden: 0, diamond: 0, skeleton: 5 });
  assert.deepEqual(k('5 Diamond Keys', 'bl4'), { golden: 0, diamond: 0, skeleton: 0 });
  assert.equal(parseReward('x1 "You\'re So Vein" Vault Hunter skin (NEW)', 'bl4').item, '"You\'re So Vein" Vault Hunter skin');
  assert.equal(parseReward('Break FreeCosmetic Pack', 'bl4').item, 'Break Free Cosmetic Pack');

  const kinds = (s) => classifyItem(s).map((x) => `${x.kind}:${x.name}`);
  assert.deepEqual(kinds('Antihero Head + Saurian Skull Trinket'), ['head:Antihero Head', 'trinket:Saurian Skull Trinket']);
  assert.deepEqual(kinds('ECHO-4 Drone Skin: A Winter Borderland'), ['drone:ECHO-4 Drone Skin: A Winter Borderland']);
  assert.deepEqual(kinds('Halloween Cosmetics'), ['pack:Halloween Cosmetics']);
  assert.deepEqual(kinds('Vault Hunter Skin: Hype Squad'), ['skin:Vault Hunter Skin: Hype Squad']);
  assert.deepEqual(kinds('Dragon Lord ECHO Theme'), ['echo:Dragon Lord ECHO Theme']);
  assert.deepEqual(kinds('Gold Rush Weapon Skin'), ['weapon:Gold Rush Weapon Skin']);
  assert.deepEqual(kinds('3 Golden Keys and a Skin'), ['skin:Skin']);

  const now = Date.now();
  const db = {
    codes: { 'AAAAA-1': { reward: 'Antihero Head + Saurian Skull Trinket' }, 'BBBBB-2': { reward: 'Vault Hunter SkinHype Squad' } },
    redemptions: {
      'AAAAA-1|bl3|steam': { status: 'success', at: now, title: 'Borderlands 3', service: 'steam' },
      'AAAAA-1|bl3|epic': { status: 'success', at: now, title: 'Borderlands 3', service: 'epic' },
      'BBBBB-2|bl4|steam': { status: 'success', at: now - 1000, title: 'Borderlands 4', service: 'steam' },
    },
  };
  const r = buildReport(db);
  assert.deepEqual(r.totals.kinds, { head: 2, trinket: 2, skin: 1 });
  assert.equal(r.cosmetics.length, 3, 'same cosmetic on two platforms is listed once');
  assert.deepEqual(r.cosmetics.find((c) => c.kind === 'head').services.sort(), ['epic', 'steam']);
  assert.ok(r.itemKinds.some((x) => x.id === 'drone'));
});

test('AI instructions: personalised, and the AI reply imports cleanly', async () => {
  const { buildLlmInstructions } = await import('../lib/llm.js');
  const { parseCodeList } = await import('../lib/codelists.js');
  const doc = buildLlmInstructions({ titles: ['bl3', 'ttw'], platforms: ['steam'], known: ['KNOWN-11111-22222-33333-44444'], version: '9.9.9', today: new Date('2026-11-14T10:00:00Z') });
  assert.match(doc.filename, /^shift-code-search-instructions-2026-11-14\.md$/);
  assert.match(doc.content, /\*\*Games:\*\* Tiny Tina's Wonderlands, Borderlands 3\./);
  assert.match(doc.content, /\*\*Platforms I play on:\*\* Steam\./);
  assert.match(doc.content, /KNOWN-11111-22222-33333-44444/);
  assert.match(doc.content, /shift-redeemer-code-list/);
  assert.doesNotMatch(buildLlmInstructions({}).content, /Codes I already have/);

  // A typical assistant reply: prose, a fenced JSON block (with our placeholder echoed back), more prose.
  const reply = `Here are the codes I found:\n\n\`\`\`json\n${JSON.stringify({
    format: 'shift-redeemer-code-list',
    version: 1,
    app: 'AI code search',
    codes: [
      { code: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX', reward: '5 Golden Keys', games: ['Borderlands 4'], platforms: [], expires: 'YYYY-MM-DD', source: 'https://example.com' },
      { code: 'T3BJ3-ABCDE-FGHJK-LMNPQ-RSTVW', reward: '3 Golden Keys', games: ['Borderlands 3', "Tiny Tina's Wonderlands"], platforms: ['Epic Games'], expires: '2026-12-01', source: 'https://news.example/codes' },
      { code: 'w9w33-59ftx-5ztx5-9ttbb-3b5jf', reward: 'Skin', games: ['Borderlands 4'], source: 'javascript:alert(1)' },
    ],
  }, null, 2)}\n\`\`\`\n\nI found 2 codes on 2 websites. Save the code block as shift-codes.json.`;
  const p = parseCodeList(reply);
  assert.equal(p.kind, 'list');
  assert.equal(p.app, 'AI code search');
  assert.deepEqual(p.records.map((r) => r.code), ['T3BJ3-ABCDE-FGHJK-LMNPQ-RSTVW', 'W9W33-59FTX-5ZTX5-9TTBB-3B5JF']);
  assert.deepEqual(p.records[0].games, ['bl3', 'ttw']);
  assert.deepEqual(p.records[0].platforms, ['epic']);
  assert.equal(p.records[0].url, 'https://news.example/codes');
  assert.equal(p.records[1].url, undefined, 'non-http links are dropped');
  // Raw JSON with no fence but some chatter in front also works.
  const raw = `Sure! {"format":"shift-redeemer-code-list","codes":[{"code":"T3BJ3-ABCDE-FGHJK-LMNPQ-RSTVW"}]}`;
  assert.deepEqual(parseCodeList(raw).records.map((r) => r.code), ['T3BJ3-ABCDE-FGHJK-LMNPQ-RSTVW']);

  // End to end through the engine: the import is labelled after the AI and keeps each source link.
  const { store, engine } = makeEngine();
  const res = engine.importList(reply);
  assert.equal(res.fresh, 2);
  const c = store.db.codes['T3BJ3-ABCDE-FGHJK-LMNPQ-RSTVW'];
  assert.equal(c.sources[0].name, 'Imported list (AI code search)');
  assert.equal(c.sources[0].url, 'https://news.example/codes');
  assert.match(engine.llmInstructions({ skipKnown: true }).content, /T3BJ3-ABCDE-FGHJK-LMNPQ-RSTVW/);
  // A feed that puts the code in the expiry field doesn't show it as a date.
  engine.ingest([{ code: 'ZFR3J-WZHBJ-BJBBB-3JBBB-F9R3W', reward: '3 Golden Keys', expires: 'ZFR3J-WZHBJ-BJBBB-3JBBB-F9R3W' }], { id: 'feed', name: 'Feed' });
  assert.equal(store.db.codes['ZFR3J-WZHBJ-BJBBB-3JBBB-F9R3W'].expires, '');
});

test('updater: picks the right download, verifies it, and writes a safe helper', async () => {
  const http = await import('node:http');
  const crypto = await import('node:crypto');
  const u = await import('../lib/updater.js');
  assert.ok(u.newer('1.3.1', '1.3.0') && u.newer('2.0.0', '1.9.9') && !u.newer('1.3.0', '1.3.0') && !u.newer('1.2.9', '1.3.0'));

  const env = { LOCALAPPDATA: 'C:\\Users\\vh\\AppData\\Local' };
  assert.equal(u.installKind({ platform: 'win32', execPath: 'C:\\Users\\vh\\AppData\\Local\\Programs\\SHiFT Redeemer\\SHiFT Redeemer.exe', packaged: true, env }).kind, 'windows-installer');
  assert.equal(u.installKind({ platform: 'win32', execPath: 'D:\\Games\\SHiFT-Redeemer-1.3.0-Windows-Portable.exe', packaged: true, env }).kind, 'windows-portable');
  assert.deepEqual(u.installKind({ platform: 'darwin', execPath: '/Applications/SHiFT Redeemer.app/Contents/MacOS/shift-redeemer', packaged: true }), { kind: 'macos', target: '/Applications/SHiFT Redeemer.app' });
  assert.deepEqual(u.installKind({ platform: 'linux', execPath: '/home/vh/SHiFT-Redeemer/shift-redeemer', packaged: true }), { kind: 'linux', target: '/home/vh/SHiFT-Redeemer' });
  assert.equal(u.installKind({ packaged: false }).kind, 'source');

  const assets = ['SHiFT-Redeemer-Setup-1.4.0-Windows.exe', 'SHiFT-Redeemer-1.4.0-Windows-Portable.exe', 'SHiFT-Redeemer-1.4.0-macOS.dmg', 'SHiFT-Redeemer-1.4.0-Linux-x64.tar.gz'].map((name) => ({ name }));
  assert.equal(u.pickAsset(assets, 'windows-installer').name, 'SHiFT-Redeemer-Setup-1.4.0-Windows.exe');
  assert.equal(u.pickAsset(assets, 'windows-portable').name, 'SHiFT-Redeemer-1.4.0-Windows-Portable.exe');
  assert.equal(u.pickAsset(assets, 'macos').name, 'SHiFT-Redeemer-1.4.0-macOS.dmg');
  assert.equal(u.pickAsset(assets, 'linux').name, 'SHiFT-Redeemer-1.4.0-Linux-x64.tar.gz');
  assert.equal(u.pickAsset(assets, 'source'), null);
  assert.equal(u.whatsNew("## What's new\n- **Faster** launches\n\n## Download\n| x |"), '- **Faster** launches');

  // A local "GitHub" serving a release and its file.
  const body = Buffer.from('pretend installer bytes '.repeat(500));
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const srv = http.createServer((req, res) => {
    if (req.url === '/release') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ tag_name: 'v9.9.9', html_url: 'https://x/rel', body: "## What's new\n- Thing", assets: [{ name: 'SHiFT-Redeemer-9.9.9-Linux-x64.tar.gz', size: body.length, digest: `sha256:${sha}`, browser_download_url: `http://127.0.0.1:${srv.address().port}/file` }] }));
    }
    res.writeHead(200, { 'content-length': body.length });
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  process.env.SHIFT_UPDATE_API = `http://127.0.0.1:${srv.address().port}/release`;
  try {
    const rel = await u.checkLatest({ current: '1.0.0' });
    assert.equal(rel.version, '9.9.9');
    assert.equal(rel.notes, '- Thing');
    assert.equal(await u.checkLatest({ current: '9.9.9' }), null, 'same version is not an update');
    const asset = { name: 'SHiFT-Redeemer-9.9.9-Linux-x64.tar.gz', url: `http://127.0.0.1:${srv.address().port}/file`, size: body.length, digest: `sha256:${sha}` };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
    const seen = [];
    const ok = await u.download(asset, { dir: tmp, onProgress: (p) => seen.push(p) });
    assert.equal(ok.sha256, sha);
    assert.deepEqual(fs.readFileSync(ok.file), body);
    assert.equal(seen.at(-1), 1);
    await assert.rejects(u.download({ ...asset, name: 'bad.tar.gz', digest: `sha256:${'0'.repeat(64)}` }, { dir: tmp }), /checksum/);
    assert.ok(!fs.existsSync(path.join(tmp, 'bad.tar.gz')) && !fs.existsSync(path.join(tmp, 'bad.tar.gz.part')), 'a bad download is deleted');
    await assert.rejects(u.download({ ...asset, name: 'short.tar.gz', size: body.length + 1, digest: null }, { dir: tmp }), /incomplete/);
    fs.rmSync(tmp, { recursive: true, force: true });
  } finally {
    delete process.env.SHIFT_UPDATE_API;
    srv.close();
  }

  // Paths with quotes and spaces can't break out of the helper scripts.
  const win = u.helperScript({ kind: 'windows-installer', file: "C:\\Temp\\it's\\Setup.exe", target: 'C:\\Users\\O\'Neil\\SHiFT Redeemer.exe', pid: 42, relaunchArgs: ['--after-update=window'] });
  assert.match(win, /Start-Process -FilePath 'C:\\Temp\\it''s\\Setup.exe' -ArgumentList '\/VERYSILENT'/);
  assert.match(win, /Start-Process -FilePath 'C:\\Users\\O''Neil\\SHiFT Redeemer.exe' -ArgumentList '--after-update=window'/);
  assert.match(win, /Wait-Process -Id 42/);
  const mac = u.helperScript({ kind: 'macos', file: "/tmp/a'b.dmg", target: '/Applications/SHiFT Redeemer.app', pid: 7 });
  assert.match(mac, /'\/tmp\/a'\\''b\.dmg'/);
  assert.match(mac, /APP='\/Applications\/SHiFT Redeemer.app'/);
  const lin = u.helperScript({ kind: 'linux', file: '/tmp/x.tar.gz', target: '/opt/SHiFT-Redeemer', pid: 7, relaunchArgs: ['--after-update=background'] });
  assert.match(lin, /nohup "\$DIR\/shift-redeemer" '--after-update=background'/);
});
