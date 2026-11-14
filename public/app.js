// SHiFT Redeemer front-end (no build step, no framework).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const S = {
  app: {},
  account: {},
  engine: {},
  settings: null,
  stats: {},
  catalog: { titles: [], platforms: [] },
  sources: [],
  logs: [],
  codes: [],
  filter: { q: '', status: 'queue', game: '' },
  shown: 60,
};

const C = { eridian: '#b57cff', green: '#93c95c', teal: '#62b5b0', amber: '#dba54a', red: '#d8553c', ink: '#e8dfd0', dead: '#6f665c' };
const STATUS = {
  new: { label: 'Unchecked', c: C.teal, group: 'queue' },
  pending: { label: 'Queued', c: C.eridian, group: 'queue' },
  partial: { label: 'Partly done', c: C.amber, group: 'queue' },
  retry: { label: 'Retry', c: C.amber, group: 'queue' },
  redeemed: { label: 'Redeemed', c: C.green, group: 'done' },
  expired: { label: 'Expired', c: C.dead, group: 'dead' },
  invalid: { label: 'Invalid', c: C.red, group: 'dead' },
  unavailable: { label: 'Unavailable', c: C.dead, group: 'dead' },
  stale: { label: 'Likely expired', c: '#5a534b', group: 'dead' },
  filtered: { label: 'Not targeted', c: '#8a809a', group: 'other' },
  ignored: { label: 'Ignored', c: '#4a443e', group: 'other' },
};
const RESULT_LABEL = { success: 'redeemed', redeemed: 'already had', trylater: 'launch game', expired: 'expired', error: 'error', none: '?', slowdown: 'rate-limited', auth: 'signed out' };
const SHIFT_ACCOUNT_URL = 'https://shift.gearboxsoftware.com/account';

const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 6 10 6a9.6 9.6 0 0 0 4.4-1"/></svg>',
  show: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// ------------------------------------------------------------------ api

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-shift-redeemer': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4000);
}

async function act(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg, 'ok');
    return r;
  } catch (e) {
    toast(e.message, 'err');
    throw e;
  }
}

// ------------------------------------------------------------------ helpers

const titleById = (id) => S.catalog.titles.find((t) => t.id === id);
const platformById = (id) => S.catalog.platforms.find((p) => p.id === id);
const titleLabel = (id) => titleById(id)?.short || String(id).replace(/^raw:/, '');
const titleColor = (id) => titleById(id)?.color || '#888';

function ago(t) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 0) return `in ${dur(-s)}`;
  if (s < 45) return 'just now';
  return `${dur(s)} ago`;
}
function dur(s) {
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 129600) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function setPath(path, value) {
  const keys = path.split('.');
  const out = {};
  let cur = out;
  keys.forEach((k, i) => {
    cur[k] = i === keys.length - 1 ? value : {};
    cur = cur[k];
  });
  return out;
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

let saveTimer;
let pendingPatch = {};
function deepAssign(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) a[k] = deepAssign(a[k] && typeof a[k] === 'object' ? a[k] : {}, v);
    else a[k] = v;
  }
  return a;
}
function setSetting(path, value, { now = false } = {}) {
  const patch = setPath(path, value);
  deepAssign(S.settings, patch);
  deepAssign(pendingPatch, patch);
  renderSettingsBound();
  renderTargets();
  renderDashboard();
  renderCodes();
  renderWizard();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, now ? 0 : 350);
}
async function flushSettings() {
  const patch = pendingPatch;
  pendingPatch = {};
  try {
    const st = await api('PUT', '/api/settings', patch);
    applyState(st, { keepSettings: Object.keys(pendingPatch).length > 0 });
    loadCodes();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ------------------------------------------------------------------ state

function applyState(st, { keepSettings = false } = {}) {
  S.app = st.app || {};
  S.account = st.account;
  S.engine = st.engine;
  if (!keepSettings) S.settings = st.settings;
  S.stats = st.stats;
  S.catalog = st.catalog;
  S.sources = st.sources;
  if (st.logs) S.logs = st.logs;
  renderAll();
}

async function loadState() {
  applyState(await api('GET', '/api/state'));
}

let codesTimer;
async function loadCodes() {
  clearTimeout(codesTimer);
  codesTimer = setTimeout(async () => {
    try {
      const r = await api('GET', '/api/codes');
      S.codes = r.codes;
      S.stats = r.stats;
      renderCodes();
      renderDashboard();
      renderTargets();
    } catch {
      /* server restarting */
    }
  }, 120);
}

let offlineTimer;
let quitting = false;
function showOverlay(title, text) {
  $('#overlayTitle').textContent = title;
  $('#overlayText').textContent = text;
  $('#overlay').hidden = false;
}

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('log', (e) => {
    const entry = JSON.parse(e.data);
    S.logs.push(entry);
    if (S.logs.length > 400) S.logs.shift();
    appendLog(entry);
  });
  es.addEventListener('state', (e) => {
    S.engine = JSON.parse(e.data);
    renderRun();
  });
  es.addEventListener('account', (e) => {
    S.account = { ...S.account, ...JSON.parse(e.data) };
    renderAccount();
    renderDashboard();
    renderWizard();
  });
  es.addEventListener('codes', (e) => {
    S.stats = JSON.parse(e.data).stats;
    renderStats();
    loadCodes();
  });
  es.addEventListener('app', (e) => {
    S.app = JSON.parse(e.data);
    renderBanners();
    renderAppInfo();
  });
  es.addEventListener('hello', () => {
    clearTimeout(offlineTimer);
    if (!quitting) $('#overlay').hidden = true;
    loadState().catch(() => {});
  });
  es.onerror = () => {
    $('#acctPill .txt').textContent = 'App offline';
    $('#acctPill').className = 'acct-pill off';
    if (quitting) return;
    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(
      () => showOverlay('SHiFT Redeemer isn’t running', 'Open SHiFT Redeemer again from your Start menu, desktop or Applications folder. This window reconnects automatically.'),
      4000,
    );
  };
}

// ------------------------------------------------------------------ tabs

function showTab() {
  const tab = (location.hash || '#dashboard').slice(1);
  const valid = $$('.tab').some((t) => t.id === `tab-${tab}`) ? tab : 'dashboard';
  $$('.tab').forEach((t) => (t.hidden = t.id !== `tab-${valid}`));
  $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === valid));
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', showTab);

// ------------------------------------------------------------------ shared components

function connectHTML() {
  return `<div class="connect">
    <div class="seg" role="tablist">
      <button type="button" class="on" data-ctab="login">Email &amp; password</button>
      <button type="button" data-ctab="cookie">Browser session</button>
    </div>
    <div data-cpane="login">
      <form class="stack-form" data-form="login">
        <label><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
        <label><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <label class="check"><input type="checkbox" name="remember" checked> <span>Keep me signed in for auto-pilot <small class="remember-hint"></small></span></label>
        <button class="btn btn-eridian" type="submit">Sign in</button>
      </form>
      <p class="hint alt">No SHiFT account? <a href="https://shift.gearboxsoftware.com/home" target="_blank" rel="noopener">Create one free</a>. If SHiFT asks for extra verification, use <button type="button" class="link-btn" data-ctab="cookie">Browser session</button> instead.</p>
    </div>
    <div data-cpane="cookie" hidden>
      <p class="hint" style="margin:0 0 10px">Already signed in to SHiFT in Chrome or Edge? Borrow that session instead. No password needed.</p>
      <ol class="steps">
        <li><span>Open <a href="https://shift.gearboxsoftware.com/rewards" target="_blank" rel="noopener">shift.gearboxsoftware.com/rewards</a> in Chrome or Edge while signed in.</span></li>
        <li><span>Press <kbd>F12</kbd>, then go to <b>Application</b> → <b>Cookies</b> → <code>https://shift.gearboxsoftware.com</code>.</span></li>
        <li><span>Click the cookie named <code>si</code> and copy its <b>Value</b>, then paste it below.</span></li>
      </ol>
      <form class="stack-form" data-form="cookie">
        <label><span>Value of the <code>si</code> cookie</span><input name="cookie" autocomplete="off" spellcheck="false" placeholder="e.g. 2fa8c1…"></label>
        <button class="btn btn-eridian" type="submit">Connect session</button>
      </form>
    </div>
  </div>`;
}

function linksHTML() {
  const linked = S.catalog.platforms.filter((p) => p.linked);
  return `<ol class="steps">
      <li><span>Open your <a href="${SHIFT_ACCOUNT_URL}" target="_blank" rel="noopener">SHiFT account page</a> and sign in.</span></li>
      <li><span>Click <b>Gaming Platforms</b> in the left-hand menu.</span></li>
      <li><span>Link every platform you play on: Steam, Epic Games, PlayStation, Xbox, Nintendo.</span></li>
    </ol>
    <div class="row gap" style="margin-top:10px"><a class="btn" href="${SHIFT_ACCOUNT_URL}" target="_blank" rel="noopener">${ICON.ext} Open SHiFT Gaming Platforms</a></div>
    <div class="links-detected">
      <h3>Detected on your account</h3>
      ${
        linked.length
          ? `<div class="chips">${linked.map((p) => `<span class="chip ok"><i style="--c:${C.green}"></i>${esc(p.name)}</span>`).join('')}</div>`
          : '<p class="hint" style="margin:0">None detected yet. SHiFT Redeemer learns which platforms are linked the first time it checks a code with SHiFT.</p>'
      }
    </div>`;
}

function titlePicksHTML() {
  const st = S.settings;
  const all = st.titles.mode === 'all';
  return S.catalog.titles
    .map((t) => {
      const on = all || st.titles.selected.includes(t.id);
      const n = codeCountFor(t.id);
      return `<label class="pick ${on ? 'on' : ''} ${all ? 'locked' : ''}" style="--c:${t.color}">
        <input type="checkbox" data-pick="titles" value="${esc(t.id)}" ${on ? 'checked' : ''} ${all ? 'disabled' : ''}>
        <span class="tick">${ICON.check}</span>
        <span class="big">${esc(t.short)}</span>
        <span class="nm">${esc(t.name)}</span>
        <span class="meta">${t.discovered ? 'Found via SHiFT · ' : ''}${n} code${n === 1 ? '' : 's'}</span>
      </label>`;
    })
    .join('');
}

function platPicksHTML() {
  const st = S.settings;
  const all = st.platforms.mode === 'all';
  // Until SHiFT has told us which platforms are linked, "all linked" means every one of them.
  const known = S.catalog.platforms.some((p) => p.linked);
  return S.catalog.platforms
    .map((p) => {
      const on = all ? !known || p.linked : st.platforms.selected.includes(p.id);
      return `<label class="pick ${on ? 'on' : ''} ${all ? 'locked' : ''} ${all && known && !p.linked ? 'dim' : ''}" style="--c:${C.eridian}">
        <input type="checkbox" data-pick="platforms" value="${esc(p.id)}" ${on ? 'checked' : ''} ${all ? 'disabled' : ''}>
        <span class="tick">${ICON.check}</span>
        <span class="big">${esc(p.glyph)}</span>
        <span class="nm">${esc(p.name)}${p.linked ? '<span class="tag-linked">Linked</span>' : ''}</span>
        <span class="meta">${p.linked ? 'On your account' : all && known ? 'Not linked' : 'Used if linked'}</span>
      </label>`;
    })
    .join('');
}

// ------------------------------------------------------------------ render

function renderAll() {
  if (!S.settings) return;
  renderAccount();
  renderRun();
  renderDashboard();
  renderTargets();
  renderSources();
  renderSettingsBound();
  renderCodes();
  renderLog();
  renderAppInfo();
  renderWizard();
}

function renderAppInfo() {
  const a = S.app || {};
  $$('.js-autostart-row').forEach((r) => (r.hidden = !a.autostartSupported));
  $$('.js-autostart').forEach((c) => (c.checked = !!a.autostart));
  $('#versionLine').textContent = `Version ${a.version || '?'}${a.update ? ` · update ${a.update.version} available` : ''}`;
  $('#dataDir').textContent = a.dataDir ? `Saved in: ${a.dataDir}` : '';
}

function savedLine(a) {
  if (!a.saved) return '<span class="saved-line">Password not saved: you\'ll sign in again when SHiFT\'s session expires.</span>';
  return a.saved.secure
    ? `<span class="saved-line ok">🔒 Password saved securely in ${esc(a.saved.storeName)} for auto-pilot</span>`
    : `<span class="saved-line bad">⚠ Password saved WITHOUT encryption on this computer</span>`;
}

function renderRememberHints() {
  const st = S.account.secureStore;
  if (!st) return;
  $$('.remember-hint').forEach((el) => {
    el.className = `remember-hint ${st.available ? '' : 'warn'}`;
    el.textContent = st.available ? `(saved securely in ${st.name})` : `(⚠ ${st.name} isn't available here, so you'll be asked before anything is saved)`;
  });
}

function renderAccount() {
  const a = S.account;
  const pill = $('#acctPill');
  pill.className = `acct-pill ${a.loggedIn ? 'on' : 'off'}`;
  $('.txt', pill).textContent = a.loggedIn ? a.email || 'SHiFT connected' : 'Not connected';
  renderRememberHints();
  $('#acctStatus').innerHTML = a.loggedIn
    ? `<span class="acct-badge on">Connected</span>
       <div class="who"><b>${esc(a.email || 'SHiFT account')}</b><span class="muted">Session verified ${ago(a.checkedAt)}</span>${savedLine(a)}</div>
       <div class="row gap"><button class="btn btn-xs" data-act="acct-check">Re-check</button>${a.saved ? '<button class="btn btn-ghost btn-xs" data-act="acct-forget">Forget saved password</button>' : ''}<button class="btn btn-ghost btn-xs" data-act="acct-logout">Sign out</button></div>`
    : `<span class="acct-badge">Not connected</span>
       <div class="who"><b>Connect your SHiFT account</b><span class="muted">${a.error ? esc(a.error) : 'Sign in below. Nothing is redeemed until you do.'}</span></div>
       ${a.cookieNames?.length ? '<div class="row gap"><button class="btn btn-xs" data-act="acct-check">Re-check</button></div>' : ''}`;
  $$('.js-links').forEach((el) => (el.innerHTML = linksHTML()));
}

function renderRun() {
  const e = S.engine;
  const live = e.running;
  const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
  $('#btnStop').hidden = !live;
  ['#btnGo', '#btnCollect', '#btnRedeem', '#btnCollectAll'].forEach((s) => ($(s).disabled = live));
  const lr = e.lastRun;
  const dot = live ? 'live' : S.account.loggedIn ? 'on' : 'off';
  const phase = live ? esc(e.phase) : S.account.loggedIn ? 'Standing by' : 'Not connected';
  const current = live ? esc(e.current || '…') : `${S.stats.queue ?? 0} code${S.stats.queue === 1 ? '' : 's'} in the queue`;
  $('#runCard').innerHTML = `
    <div class="cmd-line"><span class="cmd-dot ${dot}"></span><span class="cmd-phase ${live ? 'live' : ''}">${phase}</span><span class="cmd-current">${current}${live && e.total ? ` · ${e.done}/${e.total} · ${pct}%` : ''}</span></div>
    <div class="bar ${live ? 'live' : ''}"><i style="width:${live ? Math.max(pct, 2) : 0}%"></i></div>
    <div class="cmd-meta">
      <span>Last search <b>${e.lastCollect ? `${ago(e.lastCollect.at)} · ${e.lastCollect.added} new` : 'never'}</b></span>
      <span>Last run <b>${lr ? `${ago(lr.finishedAt || lr.at)} · ${lr.redeemed} redeemed` : 'never'}</b></span>
      <span>Auto-pilot <b>${S.settings?.autoRun.enabled ? (e.nextRun ? `next ${ago(e.nextRun)}` : 'on') : 'off'}</b></span>
      ${e.message ? `<span class="cmd-msg">${esc(e.message)}</span>` : ''}
    </div>`;
  renderBanners();
}

function renderBanners() {
  const out = [];
  if (!S.account.loggedIn)
    out.push(`<div class="banner eridian"><div><b>Connect your SHiFT account to start redeeming</b><p>Codes can be found without an account, but redeeming them needs you signed in.</p></div><div class="row gap"><button class="btn btn-eridian btn-xs" data-act="setup">Run setup</button><a class="btn btn-xs" href="#account">Account</a></div></div>`);
  if (S.account.saved && !S.account.saved.secure)
    out.push(`<div class="banner danger"><div><b>Your SHiFT password is saved without encryption</b><p>It's stored as readable text on this computer because secure storage wasn't available.</p></div><button class="btn btn-xs" data-act="acct-forget">Forget password</button></div>`);
  if (S.app?.update)
    out.push(`<div class="banner eridian"><div><b>Update available: version ${esc(S.app.update.version)}</b><p>You have ${esc(S.app.version)}. Install the new version over this one; your codes and settings are kept.</p></div><a class="btn btn-eridian btn-xs" href="${esc(S.app.update.url)}" target="_blank" rel="noopener">Download</a></div>`);
  const blocked = S.engine.blocked || [];
  const lr = S.engine.lastRun;
  if (blocked.length || lr?.stopped === 'Launch a game')
    out.push(`<div class="banner"><div><b>SHiFT wants you to launch a game</b><p>Gearbox pauses redemptions until you start any SHiFT-enabled Borderlands title${blocked.length ? ` on ${blocked.map((b) => platformById(b)?.name || b).join(', ')}` : ''}. Launch one, wait at the main menu for a minute, then redeem again.</p></div><button class="btn btn-eridian btn-xs" data-act="redeem">Redeem again</button></div>`);
  $('#dashBanners').innerHTML = out.join('');
}

function renderStats() {
  const s = S.stats;
  $('#tabCount').textContent = s.total ? s.total : '';
  const cells = [
    ['In queue', s.queue, C.eridian, 'Codes waiting to be checked or redeemed'],
    ['Redeemed', s.successes, C.green, 'Rewards unlocked by this app'],
    ['Done', s.redeemed, C.teal, 'Codes fully redeemed for your targets'],
    ['Dead', (s.expired || 0) + (s.invalid || 0) + (s.unavailable || 0) + (s.stale || 0), C.red, 'Expired or invalid codes'],
    ['Known', s.total, C.ink, `${s.filtered || 0} not for your games or platforms`],
  ];
  $('#stats').innerHTML = cells.map(([l, n, c, tip]) => `<div class="sb-cell" style="--c:${c}" title="${esc(tip)}"><b>${n ?? 0}</b><span>${l}</span></div>`).join('');
}

function renderDashboard() {
  if (!S.settings) return;
  renderStats();
  renderBanners();
  const st = S.settings;
  const titleChips =
    st.titles.mode === 'all'
      ? '<span class="chip all"><i></i>All titles</span>'
      : st.titles.selected.length
        ? st.titles.selected.map((id) => `<span class="chip" style="--c:${titleColor(id)}"><i></i>${esc(titleLabel(id))}</span>`).join('')
        : '<span class="hint" style="margin:0">None selected: nothing will be redeemed</span>';
  const platChips =
    st.platforms.mode === 'all'
      ? '<span class="chip all"><i></i>All linked platforms</span>'
      : st.platforms.selected.length
        ? st.platforms.selected.map((id) => `<span class="chip"><i></i>${esc(platformById(id)?.name || id)}</span>`).join('')
        : '<span class="hint" style="margin:0">None selected: nothing will be redeemed</span>';
  $('#targetSummary').innerHTML = `<div class="tsum"><div><h4>Titles</h4><div class="chips">${titleChips}</div></div><div><h4>Platforms</h4><div class="chips">${platChips}</div></div></div>`;
  const lr = S.engine.lastRun;
  $('#lastRun').innerHTML = lr
    ? `<dl class="kv">
        <dt>Finished</dt><dd>${ago(lr.finishedAt || lr.at)}</dd>
        <dt>Codes checked</dt><dd>${lr.checked}</dd>
        <dt>Redeemed</dt><dd style="color:var(--green)">${lr.redeemed}</dd>
        <dt>Already had</dt><dd>${lr.already}</dd>
        <dt>Expired / invalid</dt><dd>${lr.dead}</dd>
        <dt>Errors</dt><dd>${lr.errors}</dd>
        ${lr.stopped ? `<dt>Stopped</dt><dd style="color:var(--amber)">${esc(lr.stopped)}</dd>` : ''}
      </dl>`
    : '<p class="hint" style="margin:0">No runs yet. Press <b>Find &amp; redeem</b> to start.</p>';
}

function logLine(e) {
  const tag = { ok: '+', warn: '!', error: '×', step: '»', info: '·' }[e.level] || '·';
  return `<li class="${e.level}"><time>${fmtTime(e.t)}</time><span class="tg">${tag}</span><span class="msg">${esc(e.msg)}</span></li>`;
}
function renderLog() {
  const el = $('#log');
  el.innerHTML = S.logs.length ? S.logs.map(logLine).join('') : '<li class="log-empty">Activity will appear here.</li>';
  el.scrollTop = el.scrollHeight;
}
function appendLog(e) {
  const el = $('#log');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  $('.log-empty', el)?.remove();
  el.insertAdjacentHTML('beforeend', logLine(e));
  while (el.children.length > 400) el.firstElementChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}

// --- targets

function codeCountFor(titleId) {
  return S.codes.filter((c) => c.games.includes(titleId) || c.offers.some((o) => o.titleId === titleId || `raw:${o.title}` === titleId)).length;
}

function renderTargets() {
  if (!S.settings) return;
  const st = S.settings;
  $$('[data-setting="titles.mode"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.titles.mode));
  $$('[data-setting="platforms.mode"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.platforms.mode));
  const tAll = st.titles.mode === 'all';
  const pAll = st.platforms.mode === 'all';
  $$('.js-title-bulk').forEach((el) => (el.hidden = tAll));
  const tHtml = titlePicksHTML();
  const pHtml = platPicksHTML();
  $$('.js-title-grid').forEach((el) => (el.innerHTML = tHtml));
  $$('.js-plat-grid').forEach((el) => (el.innerHTML = pHtml));
  const nT = tAll ? 'every' : st.titles.selected.length;
  const linked = S.catalog.platforms.filter((p) => p.linked).length;
  const nP = pAll ? linked || 'every linked' : st.platforms.selected.length;
  $('#matrix').innerHTML = `<div class="eq">${nT === 'every' ? 'ALL' : nT} × ${pAll ? (linked ? linked : 'ALL') : nP}</div>
    <p>Each valid code is redeemed for <b>${tAll ? 'every title it unlocks' : `${nT} selected title${nT === 1 ? '' : 's'}`}</b> on <b>${pAll ? 'every platform linked to your SHiFT account' : `${nP} selected platform${nP === 1 ? '' : 's'}`}</b>.
    ${!tAll && !st.titles.selected.length ? '<br><span style="color:var(--red)">No titles selected: nothing will be redeemed.</span>' : ''}
    ${!pAll && !st.platforms.selected.length ? '<br><span style="color:var(--red)">No platforms selected: nothing will be redeemed.</span>' : ''}</p>`;
}

// --- sources

function sourceCard(s) {
  const st = s.status;
  const res = st
    ? st.ok
      ? `<div class="res">Last search ${ago(st.at)} · ${st.found} code(s) · ${st.added} new · ${(st.ms / 1000).toFixed(1)}s</div>`
      : `<div class="res bad">Last search ${ago(st.at)} failed: ${esc(st.error)}</div>`
    : '<div class="res">Not searched yet</div>';
  return `<div class="source ${s.enabled ? '' : 'off'}">
    <input type="checkbox" class="switch" data-source="${esc(s.id)}" ${s.enabled ? 'checked' : ''} aria-label="Enable ${esc(s.name)}">
    <div><h3>${esc(s.name)}<span class="site">${esc(s.site)}</span></h3><p>${esc(s.description)}</p>${res}</div>
    <div class="actions">
      <button class="btn btn-xs" data-collect="${esc(s.id)}" ${S.engine.running ? 'disabled' : ''}>${ICON.search} Search</button>
      ${s.custom ? `<button class="btn btn-xs btn-ghost" data-del-source="${esc(s.id.replace(/^custom:/, ''))}" title="Remove">${ICON.trash}</button>` : ''}
    </div>
  </div>`;
}
function renderSources() {
  $('#builtinSources').innerHTML = S.sources.filter((s) => !s.custom).map(sourceCard).join('');
  const custom = S.sources.filter((s) => s.custom);
  $('#customSources').innerHTML = custom.length ? custom.map(sourceCard).join('') : '<div class="empty">No custom sources yet. Add a guide or deal URL above.</div>';
}

// --- settings bound inputs

function renderSettingsBound() {
  if (!S.settings) return;
  $$('[data-setting]').forEach((el) => {
    if (el.classList.contains('seg')) return;
    if (document.activeElement === el && el.type !== 'checkbox') return;
    const v = getPath(S.settings, el.dataset.setting);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  $('#delayOut').textContent = `${S.settings.delaySeconds}s`;
  const nr = S.engine.nextRun;
  $('#nextRun').textContent = S.settings.autoRun.enabled
    ? nr
      ? `Next automatic run ${ago(nr)} (${new Date(nr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`
      : 'Scheduled.'
    : 'Auto-pilot is off.';
}

// --- codes

function filteredCodes() {
  const f = S.filter;
  const q = f.q.trim().toLowerCase();
  return S.codes
    .filter((c) => {
      const g = STATUS[c.status]?.group;
      if (f.status !== 'all' && g !== f.status) return false;
      if (f.game && !c.games.includes(f.game) && !c.offers.some((o) => o.titleId === f.game)) return false;
      if (q) {
        const hay = `${c.code} ${c.reward} ${c.games.map(titleLabel).join(' ')} ${c.offers.map((o) => o.title).join(' ')} ${c.sources.map((s) => s.name).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0));
}

function codeRow(c) {
  const st = STATUS[c.status] || { label: c.status, c: '#555' };
  const games = [...new Set([...c.games, ...c.offers.map((o) => o.titleId || `raw:${o.title}`)])];
  const exp = c.expiresAt;
  const expCls = exp ? (exp < Date.now() - 86400000 ? 'past' : exp - Date.now() < 3 * 86400000 ? 'soon' : '') : '';
  const offers = c.offers
    .map((o) => {
      const r = o.result;
      const cls = r ? r.status : '';
      return `<span class="offer ${cls} ${o.targeted ? '' : 'untargeted'}" title="${esc(o.title)} on ${esc(o.service)}${r ? ` — ${esc(r.message)}` : o.targeted ? ' — not redeemed yet' : ' — not in your targets'}">${esc(titleLabel(o.titleId || o.title))}·${esc(o.service)}${r ? ` ${RESULT_LABEL[r.status] || r.status}` : ''}</span>`;
    })
    .join('');
  const msg = c.check && c.check.status !== 'ok' ? `<div class="msg">SHiFT: ${esc(c.check.message)} · checked ${ago(c.check.at)}</div>` : '';
  return `<div class="code ${c.ignored ? 'ignored' : ''}" style="--sc:${st.c}" data-code="${esc(c.code)}">
    <div class="key"><code>${esc(c.code)}</code><button class="btn btn-ghost btn-icon btn-xs" data-copy="${esc(c.code)}" title="Copy code">${ICON.copy}</button></div>
    <div class="what">
      <div class="reward" title="${esc(c.reward)}">${esc(c.reward || 'Unknown reward')}</div>
      <div class="games">${games.map((g) => `<span class="gtag" style="--c:${titleColor(g)}">${esc(titleLabel(g))}</span>`).join('')}${c.platforms.map((p) => `<span class="ptag">${esc(platformById(p)?.name || p)} only</span>`).join('')}
        <span class="srcs">via ${c.sources.map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name))).join(', ')}</span></div>
    </div>
    <div class="exp ${expCls}">${c.expires ? esc(c.expires) : '—'}<small>${exp ? (exp < Date.now() ? 'expiry date' : 'expires') : 'no expiry listed'}</small></div>
    <div class="st"><span class="badge" style="--sc:${st.c}">${st.label}</span>${offers ? `<div class="offers">${offers}</div>` : ''}</div>
    <div class="acts">
      <button class="btn btn-xs btn-eridian btn-icon" data-redeem="${esc(c.code)}" title="Check &amp; redeem now" ${S.engine.running ? 'disabled' : ''}>${ICON.bolt}</button>
      <button class="btn btn-xs btn-ghost btn-icon" data-reset="${esc(c.code)}" title="Forget results so it gets re-checked">${ICON.redo}</button>
      <button class="btn btn-xs btn-ghost btn-icon" data-ignore="${esc(c.code)}" data-on="${c.ignored ? '0' : '1'}" title="${c.ignored ? 'Stop ignoring' : 'Ignore this code'}">${c.ignored ? ICON.show : ICON.eye}</button>
    </div>
    ${msg}
  </div>`;
}

function renderCodes() {
  if (!S.settings) return;
  $$('#statusFilter button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === S.filter.status);
    const n = b.dataset.v === 'all' ? S.codes.length : S.codes.filter((c) => STATUS[c.status]?.group === b.dataset.v).length;
    b.textContent = `${b.dataset.label || (b.dataset.label = b.textContent)} ${n}`;
  });
  const gf = $('#gameFilter');
  const opts = `<option value="">All games</option>${S.catalog.titles.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}`;
  if (gf.dataset.sig !== opts) {
    gf.innerHTML = opts;
    gf.dataset.sig = opts;
  }
  gf.value = S.filter.game;
  const list = filteredCodes();
  $('#codeList').innerHTML = list.length
    ? list.slice(0, S.shown).map(codeRow).join('')
    : `<div class="empty">${S.codes.length ? 'No codes match these filters.' : 'No codes yet. Press <b>Find codes</b> on the dashboard, or paste some with <b>+ Add codes</b>.'}</div>`;
  $('#btnMore').hidden = list.length <= S.shown;
  $('#btnMore').textContent = `Show more (${list.length - S.shown} left)`;
}

// ------------------------------------------------------------------ first-time setup

const WZ = { open: false, step: 0, last: 5 };

function openWizard(step = 0) {
  WZ.open = true;
  WZ.step = step;
  $('#wizard').hidden = false;
  renderWizard();
  setTimeout(() => $('#wzNext').focus(), 50);
}

function closeWizard({ toast: say = false } = {}) {
  WZ.open = false;
  $('#wizard').hidden = true;
  if (S.settings && !S.settings.setupComplete) setSetting('setupComplete', true, { now: true });
  if (say) toast('You can run setup again any time from Settings.');
}

function renderWizard() {
  if (!WZ.open || !S.settings) return;
  const loggedIn = !!S.account.loggedIn;
  $$('.wz-page').forEach((p) => (p.hidden = Number(p.dataset.step) !== WZ.step));
  $$('#wzSteps li').forEach((li, i) => {
    li.classList.toggle('current', i === WZ.step);
    li.classList.toggle('done', i < WZ.step);
  });
  $('#wzBack').hidden = WZ.step === 0;
  $('#wzSkip').textContent = WZ.step === WZ.last ? 'Close without running' : 'Skip setup';

  // Account step: show the connected state instead of the forms once signed in.
  const page1 = $('.wz-page[data-step="1"]');
  const showForms = !loggedIn || page1.dataset.change === '1';
  $('#wzConnected').hidden = !loggedIn;
  $('#wzConnected').innerHTML = loggedIn
    ? `✓ Connected as <b>${esc(S.account.email || 'your SHiFT account')}</b>${S.account.saved?.secure ? ' · password saved securely' : ''}${showForms ? '' : ' <button type="button" class="link-btn" data-act="wz-change">Use a different account</button>'}`
    : '';
  $('.js-connect', page1).hidden = !showForms;

  const hint = $('#wzAutoHint');
  const needsSave = S.settings.autoRun.enabled && loggedIn && !S.account.saved;
  hint.hidden = !needsSave;
  hint.textContent = needsSave ? 'Auto-pilot works best with “Keep me signed in”. Without it, auto-pilot pauses when SHiFT’s session expires until you sign in again.' : '';

  if (WZ.step === WZ.last) {
    const st = S.settings;
    const row = (k, v, cls = '') => `<div><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
    $('#wzSummary').innerHTML =
      row('SHiFT account', loggedIn ? esc(S.account.email || 'Connected') : 'Not connected yet. Do this on the Account tab.', loggedIn ? 'ok' : 'bad') +
      row('Titles', st.titles.mode === 'all' ? 'All titles' : st.titles.selected.map(titleLabel).join(', ') || 'None', st.titles.mode === 'select' && !st.titles.selected.length ? 'bad' : '') +
      row('Platforms', st.platforms.mode === 'all' ? 'All linked platforms' : st.platforms.selected.map((p) => platformById(p)?.name || p).join(', ') || 'None', st.platforms.mode === 'select' && !st.platforms.selected.length ? 'bad' : '') +
      row('Auto-pilot', st.autoRun.enabled ? `On, every ${st.autoRun.intervalMinutes >= 60 ? `${st.autoRun.intervalMinutes / 60} h` : `${st.autoRun.intervalMinutes} min`}` : 'Off');
  }

  const next = $('#wzNext');
  next.textContent =
    WZ.step === 0 ? 'Start setup' : WZ.step === 1 && !loggedIn ? 'Skip for now' : WZ.step === WZ.last ? (loggedIn ? 'Find & redeem now' : 'Finish') : 'Next';
  next.className = `btn ${WZ.step === 1 && !loggedIn ? '' : 'btn-eridian'}`;
}

$('#wzNext').addEventListener('click', () => {
  if (WZ.step < WZ.last) {
    WZ.step++;
    renderWizard();
    return;
  }
  const go = !!S.account.loggedIn;
  closeWizard();
  location.hash = go ? '#dashboard' : '#account';
  if (go) act(() => api('POST', '/api/run', { collectFirst: true }), 'Finding and redeeming codes…').catch(() => {});
});
$('#wzBack').addEventListener('click', () => {
  WZ.step = Math.max(0, WZ.step - 1);
  renderWizard();
});
$('#wzSkip').addEventListener('click', () => closeWizard({ toast: WZ.step !== WZ.last }));
$('#wzClose').addEventListener('click', () => closeWizard({ toast: true }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && WZ.open && $('#plainModal').hidden) closeWizard({ toast: true });
});
$('#btnSetupAgain').addEventListener('click', () => openWizard(0));

// ------------------------------------------------------------------ events

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-act]');
  if (!t) return;

  if (t.dataset.ctab) {
    const box = t.closest('.connect');
    $$('[data-ctab]', box).forEach((b) => b.closest('.seg') && b.classList.toggle('on', b.dataset.ctab === t.dataset.ctab));
    $$('[data-cpane]', box).forEach((p) => (p.hidden = p.dataset.cpane !== t.dataset.ctab));
    return;
  }
  if (t.closest('.seg[data-setting]')) {
    setSetting(t.closest('.seg').dataset.setting, t.dataset.v, { now: true });
    return;
  }
  if (t.closest('#statusFilter')) {
    S.filter.status = t.dataset.v;
    S.shown = 60;
    renderCodes();
    return;
  }
  if (t.dataset.bulk) {
    const [kind, what] = t.dataset.bulk.split(':');
    const all = kind === 'titles' ? S.catalog.titles.map((x) => x.id) : S.catalog.platforms.map((x) => x.id);
    setSetting(`${kind}.selected`, what === 'all' ? all : [], { now: true });
    return;
  }
  if (t.dataset.copy) {
    navigator.clipboard?.writeText(t.dataset.copy).then(() => toast(`Copied ${t.dataset.copy}`));
    return;
  }
  if (t.dataset.redeem) {
    await act(() => api('POST', '/api/run', { codes: [t.dataset.redeem] }), `Redeeming ${t.dataset.redeem}…`).catch(() => {});
    return;
  }
  if (t.dataset.reset) {
    await act(() => api('POST', '/api/codes/reset', { codes: [t.dataset.reset] }), 'Results cleared; it will be re-checked').catch(() => {});
    loadCodes();
    return;
  }
  if (t.dataset.ignore) {
    await act(() => api('POST', '/api/codes/ignore', { codes: [t.dataset.ignore], ignored: t.dataset.on === '1' })).catch(() => {});
    loadCodes();
    return;
  }
  if (t.dataset.collect) {
    await act(() => api('POST', '/api/collect', { only: [t.dataset.collect] })).catch(() => {});
    return;
  }
  if (t.dataset.delSource) {
    applyState(await act(() => api('DELETE', `/api/sources/custom?id=${encodeURIComponent(t.dataset.delSource)}`), 'Source removed'));
    return;
  }

  const a = t.dataset.act;
  if (a === 'acct-check') {
    await act(() => api('POST', '/api/account/check')).catch(() => {});
    loadState();
  } else if (a === 'acct-forget') {
    await act(() => api('POST', '/api/account/forget'), 'Saved password removed').catch(() => {});
    loadState();
  } else if (a === 'acct-logout') {
    await act(() => api('POST', '/api/account/logout'), 'Signed out').catch(() => {});
    loadState();
  } else if (a === 'redeem') {
    await act(() => api('POST', '/api/run', {})).catch(() => {});
  } else if (a === 'setup') {
    openWizard(S.account.loggedIn ? 2 : 1);
  } else if (a === 'wz-change') {
    $('.wz-page[data-step="1"]').dataset.change = '1';
    renderWizard();
  }
});

function needLogin() {
  if (S.account.loggedIn) return false;
  toast('Connect your SHiFT account first', 'err');
  openWizard(1);
  return true;
}

$('#btnGo').addEventListener('click', () => !needLogin() && act(() => api('POST', '/api/run', { collectFirst: true })));
$('#btnCollect').addEventListener('click', () => act(() => api('POST', '/api/collect', {})));
$('#btnCollectAll').addEventListener('click', () => act(() => api('POST', '/api/collect', {}), 'Searching sources…'));
$('#btnRedeem').addEventListener('click', () => !needLogin() && act(() => api('POST', '/api/run', {})));
$('#btnStop').addEventListener('click', () => act(() => api('POST', '/api/stop')));
$('#btnQuit').addEventListener('click', async () => {
  const msg = S.settings?.autoRun.enabled
    ? 'Quit SHiFT Redeemer? Auto-pilot will stop until you open it again.'
    : S.engine.running
      ? 'Quit SHiFT Redeemer? The current run will stop.'
      : 'Quit SHiFT Redeemer?';
  if (!confirm(msg)) return;
  quitting = true;
  try {
    await api('POST', '/api/app/quit');
  } catch {
    /* already gone */
  }
  showOverlay('SHiFT Redeemer has stopped', 'You can close this window. Open SHiFT Redeemer again from your Start menu, desktop or Applications folder.');
  setTimeout(() => window.close(), 600);
});
$('#btnOpenData').addEventListener('click', () => api('POST', '/api/app/open-data').catch((e) => toast(e.message, 'err')));
$('#btnClearLog').addEventListener('click', () => {
  S.logs = [];
  renderLog();
});

// codes toolbar
$('#codeSearch').addEventListener('input', (e) => {
  S.filter.q = e.target.value;
  S.shown = 60;
  renderCodes();
});
$('#gameFilter').addEventListener('change', (e) => {
  S.filter.game = e.target.value;
  renderCodes();
});
$('#btnMore').addEventListener('click', () => {
  S.shown += 100;
  renderCodes();
});
$('#btnAddCodes').addEventListener('click', () => {
  $('#pastePanel').hidden = false;
  $('#pasteText').focus();
});
$('#btnPasteClose').addEventListener('click', () => ($('#pastePanel').hidden = true));
$('#pasteText').addEventListener('input', (e) => {
  const n = new Set((e.target.value.match(/\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/gi) || []).map((x) => x.toUpperCase())).size;
  $('#pasteCount').textContent = n ? `${n} code${n === 1 ? '' : 's'} detected` : '';
});
async function addPasted(redeem) {
  const text = $('#pasteText').value;
  const r = await act(() => api('POST', '/api/codes/add', { text, redeem }));
  toast(`${r.codes.length} code(s) added${redeem ? '; redeeming now' : ''}`, 'ok');
  $('#pasteText').value = '';
  $('#pasteCount').textContent = '';
  S.filter.status = 'all';
  loadCodes();
}
$('#btnPasteAdd').addEventListener('click', () => addPasted(false).catch(() => {}));
$('#btnPasteRedeem').addEventListener('click', () => !needLogin() && addPasted(true).catch(() => {}));

// picks, settings inputs, source toggles, autostart
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.pick) {
    const kind = el.dataset.pick;
    const sel = new Set(S.settings[kind].selected);
    el.checked ? sel.add(el.value) : sel.delete(el.value);
    setSetting(`${kind}.selected`, [...sel]);
  } else if (el.dataset.source) {
    api('PUT', '/api/settings', { sources: { [el.dataset.source]: { enabled: el.checked } } }).then((st) => applyState(st));
  } else if (el.classList.contains('js-autostart')) {
    try {
      const r = await api('PUT', '/api/app/autostart', { enabled: el.checked });
      S.app = r.app;
      toast(r.app.autostart ? 'SHiFT Redeemer will start with your computer' : 'Removed from startup', 'ok');
    } catch (err) {
      el.checked = !el.checked;
      toast(err.message, 'err');
    }
    renderAppInfo();
  } else if (el.dataset.setting && !el.closest('.seg')) {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range' || el.type === 'number' || el.tagName === 'SELECT') v = Number(v);
    setSetting(el.dataset.setting, v);
  }
});
$('#delayRange').addEventListener('input', (e) => ($('#delayOut').textContent = `${e.target.value}s`));

// sign-in forms (used on the Account tab and in setup)
function askPlaintextConsent(err) {
  const d = err.data || {};
  const store = d.storeName || 'secure password storage';
  $('#pmReason').textContent = `${store[0].toUpperCase()}${store.slice(1)} couldn't be used on this computer${d.reason ? ` (${d.reason})` : ''}.`;
  $('#pmPath').textContent = S.app?.dataDir ? `${S.app.dataDir}${S.app.platform === 'win32' ? '\\' : '/'}session.json` : "session.json in the app's data folder";
  $('#plainModal').hidden = false;
  $('#pmNo').focus();
  return new Promise((resolve) => {
    const done = (v) => {
      $('#plainModal').hidden = true;
      $('#pmYes').onclick = $('#pmNo').onclick = null;
      resolve(v);
    };
    $('#pmYes').onclick = () => done(true);
    $('#pmNo').onclick = () => done(false);
  });
}

async function afterConnect() {
  await loadState();
  const page1 = $('.wz-page[data-step="1"]');
  delete page1.dataset.change;
  if (WZ.open && WZ.step === 1 && S.account.loggedIn) {
    WZ.step = 2;
    renderWizard();
  }
}

async function submitLogin(f) {
  const btn = $('button[type=submit]', f);
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  const body = { email: f.email.value, password: f.password.value, remember: f.remember.checked };
  try {
    try {
      await api('POST', '/api/account/login', body);
      toast('Signed in to SHiFT', 'ok');
    } catch (err) {
      if (err.data?.code !== 'SECURE_STORE_UNAVAILABLE') throw err;
      if (await askPlaintextConsent(err)) {
        await api('POST', '/api/account/login', { ...body, allowPlaintext: true });
        toast('Signed in; password saved without encryption', 'err');
      } else {
        f.remember.checked = false;
        toast('Signed in. Your password was not saved.', 'ok');
      }
    }
    f.password.value = '';
    await afterConnect();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function submitCookie(f) {
  const btn = $('button[type=submit]', f);
  btn.disabled = true;
  try {
    await act(() => api('POST', '/api/account/cookie', { cookie: f.cookie.value }), 'Connected to SHiFT');
    f.reset();
    await afterConnect();
  } catch {
    /* toasted */
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset.form === 'login') {
    e.preventDefault();
    submitLogin(f);
  } else if (f.dataset.form === 'cookie') {
    e.preventDefault();
    submitCookie(f);
  }
});

$('#customForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    applyState(await act(() => api('POST', '/api/sources/custom', { name: f.name.value, url: f.url.value, follow: f.follow.value }), 'Source added'));
    f.reset();
  } catch {
    /* toasted */
  }
});

// refresh relative times
setInterval(() => {
  if (!S.settings) return;
  renderRun();
  renderSettingsBound();
}, 30_000);

// ------------------------------------------------------------------ start

$$('.js-connect').forEach((el) => (el.innerHTML = connectHTML()));
showTab();
loadState()
  .then(() => {
    loadCodes();
    if (!S.settings.setupComplete) {
      // People who were already up and running before setup existed don't need it.
      if (S.account.loggedIn && S.engine.lastRun) setSetting('setupComplete', true, { now: true });
      else openWizard(0);
    }
  })
  .catch((e) => toast(`Could not reach the app: ${e.message}`, 'err'));
connect();
