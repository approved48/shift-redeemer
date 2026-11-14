// SHiFT Redeemer front-end (no build step, no framework).

import { initHelp } from './help.js';
import { initReport } from './report.js';
import { initLists } from './lists.js';
import { initTips } from './glossary.js';

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
  games: { steam: { found: false, installed: [] } },
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

/** One callout shape for every status message, note and banner. */
function callout(tone, icon, title, body, actions = '') {
  return `<div class="callout is-${tone}"><span class="co-ic" aria-hidden="true">${icon}</span><div class="co-body">${title ? `<b class="co-title">${title}</b>` : ''}${body}</div>${actions ? `<div class="co-actions">${actions}</div>` : ''}</div>`;
}

// ------------------------------------------------------------------ motion

const MOTION_KEY = 'sr.reduceMotion';
try {
  if (localStorage.getItem(MOTION_KEY) === '1') document.documentElement.classList.add('reduce-motion');
} catch {
  /* storage unavailable */
}
const reducedMotion = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Quick staggered entrance for the visible blocks of a page, like a game menu panel sliding in. */
function cascade(root) {
  if (reducedMotion() || !root) return;
  const els = [...root.querySelectorAll('.hero, .panel, .statbar, .callout, .stat-tile, .rp-title, .code, .source')].filter((el) => el.offsetParent !== null).slice(0, 18);
  els.forEach((el, i) => {
    el.classList.remove('in');
    el.style.setProperty('--i', i);
    void el.offsetWidth;
    el.classList.add('in');
    el.addEventListener('animationend', () => el.classList.remove('in'), { once: true });
  });
}

/** Slide the active-tab highlight to the current tab. */
function moveInk() {
  const ink = $('#tabInk');
  const a = $('#tabs a.active');
  if (!ink || !a) return;
  ink.style.width = `${a.offsetWidth - 8}px`;
  ink.style.transform = `translateX(${a.offsetLeft + 4}px) skewX(-14deg)`;
  ink.classList.add('on');
}
addEventListener('resize', moveInk);

const prevNums = new Map();
/** Count a number up (or down) to its new value. */
function countTo(el, key, to) {
  const from = prevNums.get(key);
  prevNums.set(key, to);
  if (from === undefined || from === to || reducedMotion()) {
    el.textContent = Number(to || 0).toLocaleString();
    return;
  }
  const t0 = performance.now();
  const d = 420;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / d);
    el.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3)).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
let lastPick = null;
let lastPhase = null;

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
    loadState().catch(() => {});
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
  if (st.games) S.games = st.games;
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
    report.refresh(S.catalog.platforms);
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
  $$('#tabs a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === valid);
    if (a.dataset.tab === valid) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const cur = $(`#tabs a[data-tab="${valid}"]`);
  $('#navCurrent').textContent = cur ? cur.firstChild.textContent.trim() : 'Menu';
  setNavOpen(false);
  if (valid === 'rewards' && typeof report !== 'undefined') report.refresh(S.catalog.platforms);
  window.scrollTo({ top: 0 });
  moveInk();
  cascade($(`#tab-${valid}`));
}
window.addEventListener('hashchange', showTab);

// When the window is too narrow for every tab, fold them into a ☰ menu instead of hiding some.
const topbar = $('.topbar');
function setNavOpen(on) {
  const open = on && topbar.classList.contains('compact');
  topbar.classList.toggle('nav-open', open);
  $('#navToggle').setAttribute('aria-expanded', String(open));
}
function fitNav() {
  const tabs = $('#tabs');
  const was = topbar.classList.contains('compact');
  topbar.classList.remove('compact');
  // Measure the full row: compact only if the tabs don't fit in the space they'd get.
  const need = $$('a', tabs).reduce((w, a) => w + a.offsetWidth + 2, 0);
  const compact = need > tabs.clientWidth + 1;
  topbar.classList.toggle('compact', compact);
  if (!compact) setNavOpen(false);
  if (was !== compact) moveInk();
}
$('#navToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !topbar.classList.contains('nav-open');
  setNavOpen(open);
  if (open) ($('#tabs a.active') || $('#tabs a'))?.focus({ preventScroll: true });
});
document.addEventListener('click', (e) => {
  if (topbar.classList.contains('nav-open') && !e.target.closest('#tabs')) setNavOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && topbar.classList.contains('nav-open')) {
    setNavOpen(false);
    $('#navToggle').focus();
  }
});
$('#tabs').addEventListener('keydown', (e) => {
  if (!topbar.classList.contains('nav-open') || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const links = $$('#tabs a');
  const i = links.indexOf(document.activeElement);
  links[(i + (e.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length].focus();
});
new ResizeObserver(() => fitNav()).observe($('.topbar-inner'));
document.fonts?.ready.then(fitNav);

// ------------------------------------------------------------------ shared components

function connectHTML() {
  return `<div class="connect">
    <div class="seg" role="tablist">
      <button type="button" class="on" data-ctab="login">Email &amp; password</button>
      <button type="button" data-ctab="cookie">Browser session</button>
    </div>
    <div data-cpane="login">
      <form class="stack-form" data-form="login">
        <label class="field"><span class="label">Email</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span class="label">Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <label class="check"><input type="checkbox" name="remember" checked> <span>Keep me signed in for auto-pilot <small class="remember-hint"></small></span></label>
        <button class="btn btn-eridian" type="submit">Sign in</button>
      </form>
      <p class="hint alt">No SHiFT account? <a href="https://shift.gearboxsoftware.com/home" target="_blank" rel="noopener">Create one free</a>. If SHiFT asks for extra verification, use <button type="button" class="link-btn" data-ctab="cookie">Browser session</button> instead.</p>
    </div>
    <div data-cpane="cookie" hidden>
      <p class="hint" style="margin:0 0 var(--s3)">Already signed in to SHiFT in Chrome or Edge? Borrow that session instead. No password needed.</p>
      <ol class="steps">
        <li><span>Open <a href="https://shift.gearboxsoftware.com/rewards" target="_blank" rel="noopener">shift.gearboxsoftware.com/rewards</a> in Chrome or Edge while signed in.</span></li>
        <li><span>Press <kbd>F12</kbd>, then go to <b>Application</b> → <b>Cookies</b> → <code>https://shift.gearboxsoftware.com</code>.</span></li>
        <li><span>Click the cookie named <code>si</code> and copy its <b>Value</b>, then paste it below.</span></li>
      </ol>
      <form class="stack-form" data-form="cookie">
        <label class="field"><span class="label">Value of the <code>si</code> cookie</span><input name="cookie" autocomplete="off" spellcheck="false" placeholder="e.g. 2fa8c1…"></label>
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
    <div class="row gap"><a class="btn btn-sm" href="${SHIFT_ACCOUNT_URL}" target="_blank" rel="noopener">${ICON.ext} Open SHiFT Gaming Platforms</a></div>
    <div class="links-detected">
      <h3 class="eyebrow">Detected on your account</h3>
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
      return `<label class="pick ${on ? 'on' : ''} ${all ? 'locked' : ''} ${lastPick === t.id ? 'just' : ''}" style="--c:${t.color}">
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
      return `<label class="pick ${on ? 'on' : ''} ${all ? 'locked' : ''} ${all && known && !p.linked ? 'dim' : ''} ${lastPick === p.id ? 'just' : ''}" style="--c:${C.eridian}">
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

const mmss = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
let assistTick;

function assistLine(a) {
  if (a.step === 'launching') return `Starting ${esc(a.title)} via ${esc(a.via)}…`;
  if (a.step === 'starting') return `Waiting for ${esc(a.title)} to start · ${mmss(Date.now() - (a.since || Date.now()))}`;
  if (a.step === 'warmup') return `${esc(a.title)} is running so SHiFT can register it · resuming in ${mmss((a.endsAt || 0) - Date.now())}`;
  if (a.step === 'closing') return `Closing ${esc(a.title)}…`;
  return '';
}

function renderRun() {
  const e = S.engine;
  const live = e.running;
  const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
  $('#btnStop').hidden = !live;
  ['#btnGo', '#btnCollect', '#btnRedeem', '#btnCollectAll'].forEach((s) => ($(s).disabled = live));
  const lr = e.lastRun;
  const paused = !live && lr?.pause;
  const dot = live ? 'live' : paused ? 'warn' : S.account.loggedIn ? 'on' : 'off';
  const phase = live ? esc(e.phase) : paused ? 'Paused' : S.account.loggedIn ? 'Standing by' : 'Not connected';
  let current;
  if (live && e.assist) current = assistLine(e.assist);
  else if (live) current = `${esc(e.current || '…')}${e.total ? ` · ${e.done}/${e.total} · ${pct}%` : ''}`;
  else if (paused) current = `SHiFT needs a game launched · ${lr.pause.waiting} code${lr.pause.waiting === 1 ? '' : 's'} waiting`;
  else current = `${S.stats.queue ?? 0} code${S.stats.queue === 1 ? '' : 's'} in the queue`;
  const phaseChanged = phase;
  const warmPct = e.assist?.step === 'warmup' && e.assist.endsAt ? 100 - Math.round(((e.assist.endsAt - Date.now()) / (Number(S.settings?.gameAssist?.warmupSeconds || 75) * 1000)) * 100) : null;
  $('#runCard').innerHTML = `
    <div class="cmd-line"><span class="cmd-dot ${dot}"></span><span class="cmd-phase ${live ? 'live' : ''} ${paused ? 'warn' : ''} ${phase !== lastPhase && lastPhase !== null ? 'flick' : ''}">${phase}</span><span class="cmd-current">${current}</span></div>
    <div class="bar ${live ? 'live' : ''} ${e.assist ? 'assist' : ''}"><i style="width:${live ? Math.max(warmPct ?? pct, 2) : 0}%"></i></div>
    <div class="cmd-meta">
      <span>Last search <b>${e.lastCollect ? `${ago(e.lastCollect.at)} · ${e.lastCollect.added} new` : 'never'}</b></span>
      <span>Last run <b>${lr ? `${ago(lr.finishedAt || lr.at)} · ${lr.redeemed} redeemed` : 'never'}</b></span>
      <span>Auto-pilot <b>${S.settings?.autoRun.enabled ? (e.nextRun ? `next ${ago(e.nextRun)}` : 'on') : 'off'}</b></span>
      <span>Game assist <b>${{ auto: 'automatic', ask: 'asks first', off: 'off' }[S.settings?.gameAssist?.mode] || 'off'}</b></span>
      ${e.message && !e.assist ? `<span class="cmd-msg">${esc(e.message)}</span>` : ''}
    </div>`;
  lastPhase = phaseChanged;
  clearInterval(assistTick);
  if (live && e.assist && ['starting', 'warmup'].includes(e.assist.step)) assistTick = setInterval(renderRun, 1000);
  renderBanners();
}

function renderBanners() {
  const out = [];
  if (!S.account.loggedIn)
    out.push(callout('eridian', '🔑', 'Connect your SHiFT account to start redeeming', 'Codes can be found without an account, but redeeming them needs you signed in.', '<button class="btn btn-sm btn-eridian" data-act="setup">Run setup</button><a class="btn btn-sm" href="#account">Account</a>'));
  if (S.account.saved && !S.account.saved.secure)
    out.push(callout('danger', '⚠', 'Your SHiFT password is saved without encryption', "It's stored as readable text on this computer because secure storage wasn't available.", '<button class="btn btn-sm" data-act="acct-forget">Forget password</button>'));
  if (S.app?.update)
    out.push(callout('eridian', '⬆', `Update available: version ${esc(S.app.update.version)}`, `You have ${esc(S.app.version)}. Install the new version over this one; your codes and settings are kept.`, `<a class="btn btn-sm btn-eridian" href="${esc(S.app.update.url)}" target="_blank" rel="noopener">Download</a>`));
  const lr = S.engine.lastRun;
  if (!S.engine.running && lr?.pause) out.push(pauseBanner(lr.pause));
  const nudge = assistNudge();
  if (nudge) out.push(nudge);
  $('#dashBanners').innerHTML = out.join('');
}

const platNames = (svcs) => svcs.map((x) => platformById(x)?.name || x).join(' & ');
const NUDGE_EVERY = 7 * 86400000;

// Game launch assist is set to Ask me / Off (usually because the user plays while the app runs).
// Now and then, offer to switch back to automatic launching for the times they're away.
function assistNudge() {
  const ga = S.settings?.gameAssist;
  if (!ga || ga.mode === 'auto' || ga.dontAsk || S.engine.running) return '';
  const steam = S.games.steam || {};
  const canLaunch = steam.installed?.length || ga.epicLink;
  if (!canLaunch) return '';
  const paused = !!S.engine.lastRun?.pause;
  const since = Date.now() - (ga.askedAt || 0);
  if (!(ga.askedAt ? since > NUDGE_EVERY || (paused && since > 86400000) : paused)) return '';
  const best = steam.installed?.length ? titleById(['bl2', 'tps', 'bl1', 'bl3', 'ttw', 'bl4'].find((id) => steam.installed.includes(id)))?.name : null;
  const why = ga.playing ? ' because you said you play while SHiFT Redeemer runs' : '';
  return callout(
    'eridian',
    '🕹',
    'Launch games automatically when you’re not playing?',
    `Game launch assist is set to <b>${ga.mode === 'ask' ? 'Ask me' : 'Off'}</b>${why}. When you’re away, SHiFT Redeemer can start ${best ? esc(best) : 'a game'} for about a minute whenever SHiFT asks, then close it and carry on. It never closes a game you opened yourself.`,
    '<button class="btn btn-sm btn-eridian" data-act="nudge-on">Turn on</button><button class="btn btn-sm" data-act="nudge-later">Not now</button><button class="btn btn-sm btn-ghost" data-act="nudge-never">Don’t ask again</button>',
  );
}

function pauseBanner(p) {
  const where = platNames(p.services || []);
  const waiting = `${p.waiting} code${p.waiting === 1 ? '' : 's'} still waiting`;
  const auto = S.settings?.autoRun.enabled ? ' Auto-pilot will try again on its next run.' : '';
  let body;
  let buttons = '';
  if (p.why === 'ask' || (p.why === 'off' && p.canLaunch)) {
    body = `SHiFT stopped accepting codes on ${esc(where)} until a SHiFT-enabled game is launched (${waiting}). SHiFT Redeemer can start <b>${esc(p.game)}</b> via ${esc(p.via)}, wait about a minute, close it and carry on.`;
    buttons = `<button class="btn btn-sm btn-eridian" data-act="assist-resume">Launch ${esc(p.game)} &amp; resume</button><button class="btn btn-sm" data-act="redeem">I launched a game, resume</button>`;
  } else if (p.why === 'still-blocked') {
    body = `${esc(p.message)} (${waiting}).`;
    buttons = `<button class="btn btn-sm btn-eridian" data-act="assist-resume">Launch again &amp; resume</button><button class="btn btn-sm" data-act="redeem">Resume</button>`;
  } else {
    body = `SHiFT stopped accepting codes on ${esc(where)} until a SHiFT-enabled game is launched (${waiting}). ${esc(/[.!?]$/.test(p.message) ? p.message : `${p.message}.`)} Start any Borderlands game, wait at its main menu for a minute, then press Resume.`;
    buttons = `<button class="btn btn-sm btn-eridian" data-act="redeem">Resume</button><button class="btn btn-sm btn-ghost" data-help="paused game">Why?</button>`;
  }
  return callout('warn', '⏸', 'Redeeming paused: SHiFT needs a game launched', `${body}${auto}`, buttons);
}

function runResult(lr) {
  if (lr.pause) return `<span style="color:var(--amber)">Paused: waiting for a game launch (${esc(platNames(lr.pause.services || []))})</span>`;
  const map = { 'Stopped by you': 'Stopped by you', 'Not signed in': 'Not signed in to SHiFT', 'Signed out': 'Signed out of SHiFT, so sign in again', 'Launch a game': 'Paused: waiting for a game launch' };
  if (lr.stopped) return `<span style="color:var(--amber)">${esc(map[lr.stopped] || lr.stopped)}</span>`;
  return '<span style="color:var(--green)">Finished</span>';
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
  if (!$('#stats').children.length) $('#stats').innerHTML = cells.map(([l, n, c, tip]) => `<div class="sb-cell" style="--c:${c}" title="${esc(tip)}"><b data-k="${l}"></b><span>${l}</span></div>`).join('');
  cells.forEach(([l, n]) => countTo($(`#stats b[data-k="${l}"]`), `stat:${l}`, n ?? 0));
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
        <dt>Result</dt><dd>${runResult(lr)}</dd>
        <dt>When</dt><dd>${ago(lr.finishedAt || lr.at)}</dd>
        <dt>Codes checked</dt><dd>${lr.checked}</dd>
        <dt>Redeemed</dt><dd style="color:var(--green)">${lr.redeemed}</dd>
        <dt>Already had</dt><dd>${lr.already}</dd>
        <dt>Expired / invalid</dt><dd>${lr.dead}</dd>
        <dt>Errors</dt><dd>${lr.errors}</dd>
        ${lr.assists ? `<dt>Game launches</dt><dd>${lr.assists}</dd>` : ''}
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
  el.lastElementChild?.classList.add('new');
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
  const warn = [!tAll && !st.titles.selected.length ? 'No titles selected, so nothing will be redeemed.' : '', !pAll && !st.platforms.selected.length ? 'No platforms selected, so nothing will be redeemed.' : '']
    .filter(Boolean)
    .map((w) => `<br><span style="color:var(--red)">${w}</span>`)
    .join('');
  const m = $('#matrix');
  m.className = `callout ${warn ? 'is-danger' : 'is-eridian'}`;
  m.innerHTML = `<span class="eq">${nT === 'every' ? 'ALL' : nT} × ${pAll ? (linked ? linked : 'ALL') : nP}</span><div class="co-body"><b class="co-title">What will be redeemed</b>Each valid code is redeemed for <b>${tAll ? 'every title it unlocks' : `${nT} selected title${nT === 1 ? '' : 's'}`}</b> on <b>${pAll ? 'every platform linked to your SHiFT account' : `${nP} selected platform${nP === 1 ? '' : 's'}`}</b>.${warn}</div>`;
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

function renderAssist() {
  if (!S.settings) return;
  const ga = S.settings.gameAssist || {};
  const steam = S.games.steam || {};
  $$('[data-setting="gameAssist.mode"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === ga.mode));
  $('#assistModeHint').textContent = {
    auto: 'When SHiFT asks, a game is launched, left at the main menu, closed, and redeeming carries on by itself.',
    ask: 'When SHiFT asks, redeeming pauses and the dashboard offers a one-click “Launch & resume”.',
    off: 'Redeeming pauses when SHiFT asks; start a game yourself, then press Resume.',
  }[ga.mode] || '';
  const sel = $('#assistGame');
  const opts = `<option value="auto">Fastest installed game (automatic)</option>${S.catalog.titles
    .filter((t) => !t.discovered)
    .map((t) => `<option value="${esc(t.id)}" ${steam.installed?.includes(t.id) ? '' : 'disabled'}>${esc(t.name)}${steam.installed?.includes(t.id) ? '' : ' (not installed on Steam)'}</option>`)
    .join('')}`;
  if (sel.dataset.sig !== opts) {
    sel.innerHTML = opts;
    sel.dataset.sig = opts;
  }
  sel.value = ga.game || 'auto';
  $('#assistDetect').innerHTML = steam.found
    ? steam.installed?.length
      ? `<span class="chip ok"><i style="--c:${C.green}"></i>Steam</span> Installed: ${steam.installed.map((id) => esc(titleById(id)?.name || id)).join(', ')}`
      : '<span class="chip"><i></i>Steam</span> Found, but no Borderlands games are installed through it.'
    : "<span class=\"chip\"><i style=\"--c:#6f665c\"></i>Steam</span> Not found on this computer. Epic users can add a launch link above.";
  $('#assistRemindRow').hidden = ga.mode === 'auto';
  const best = steam.installed?.length ? titleById(['bl2', 'tps', 'bl1', 'bl3', 'ttw', 'bl4'].find((id) => steam.installed.includes(id)))?.name : null;
  $('#wzAssistText').textContent = best
    ? `Found ${best} on Steam: that's the game it would start. You can change this any time in Settings → Game launch assist.`
    : 'No Borderlands game was found on Steam here, so when SHiFT asks, the app pauses and tells you what to do. Epic players can add a launch link in Settings → Game launch assist.';
}

function renderSettingsBound() {
  if (!S.settings) return;
  renderAssist();
  $$('[data-setting]').forEach((el) => {
    if (el.classList.contains('seg')) return;
    if (document.activeElement === el && el.type !== 'checkbox') return;
    const v = getPath(S.settings, el.dataset.setting);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  $('#delayOut').textContent = `${S.settings.delaySeconds} sec`;
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

// Key names in reward text get a hover explanation (Help → Rewards guide has the full version).
const KEY_WORD = /\b(golden|diamond|skeleton)(\s+keys?)\b/i;
function rewardHTML(reward, game) {
  if (!reward) return 'Unknown reward';
  return esc(reward).replace(new RegExp(KEY_WORD.source, 'gi'), (m, k) => `<span class="kw kw-${k.toLowerCase()}" data-tip-key="${k.toLowerCase()}" ${game ? `data-tip-game="${esc(game)}"` : ''} tabindex="0">${m}</span>`);
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
      <div class="reward" ${KEY_WORD.test(c.reward || '') ? '' : `title="${esc(c.reward)}"`}>${rewardHTML(c.reward, games.length === 1 ? games[0] : '')}</div>
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
    : `<div class="empty">${S.codes.length ? 'No codes match these filters.' : 'No codes yet. Press <b>Find codes</b> on the dashboard, paste some with <b>+ Paste codes</b>, or import a list.'}</div>`;
  $('#btnMore').hidden = list.length <= S.shown;
  $('#btnMore').textContent = `Show more (${list.length - S.shown} left)`;
}

// ------------------------------------------------------------------ first-time setup

const WZ = { open: false, step: 0, last: 6 };

function openWizard(step = 0) {
  WZ.open = true;
  WZ.played = undefined;
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
  $('#wzKicker').textContent = `Setup · step ${WZ.step + 1} of ${WZ.last + 1}`;
  $('#wzSkip').textContent = WZ.step === WZ.last ? 'Close without running' : 'Skip setup';

  // Account step: show the connected state instead of the forms once signed in.
  const page1 = $('.wz-page[data-step="1"]');
  const showForms = !loggedIn || page1.dataset.change === '1';
  $('#wzConnected').hidden = !loggedIn;
  $('#wzConnected').innerHTML = loggedIn
    ? `<span class="co-ic" aria-hidden="true">✓</span><div class="co-body"><b class="co-title">Connected</b>Signed in as <b>${esc(S.account.email || 'your SHiFT account')}</b>${S.account.saved?.secure ? ', password saved securely' : ''}.</div>${showForms ? '' : '<div class="co-actions"><button type="button" class="btn btn-sm btn-ghost" data-act="wz-change">Use a different account</button></div>'}`
    : '';
  $('.js-connect', page1).hidden = !showForms;

  const hint = $('#wzAutoHint');
  const needsSave = S.settings.autoRun.enabled && loggedIn && !S.account.saved;
  hint.hidden = !needsSave;
  hint.innerHTML = needsSave ? '<span class="co-ic" aria-hidden="true">!</span><div class="co-body"><b class="co-title">Tip</b>Auto-pilot works best with “Keep me signed in”. Without it, auto-pilot pauses when SHiFT’s session expires until you sign in again.</div>' : '';

  if (WZ.step === WZ.last) {
    const st = S.settings;
    const row = (k, v, cls = '') => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`;
    $('#wzSummary').innerHTML =
      row('SHiFT account', loggedIn ? esc(S.account.email || 'Connected') : 'Not connected yet. Do this on the Account tab.', loggedIn ? 'ok' : 'bad') +
      row('Titles', st.titles.mode === 'all' ? 'All titles' : st.titles.selected.map(titleLabel).join(', ') || 'None', st.titles.mode === 'select' && !st.titles.selected.length ? 'bad' : '') +
      row('Platforms', st.platforms.mode === 'all' ? 'All linked platforms' : st.platforms.selected.map((p) => platformById(p)?.name || p).join(', ') || 'None', st.platforms.mode === 'select' && !st.platforms.selected.length ? 'bad' : '') +
      row('Auto-pilot', st.autoRun.enabled ? `On, every ${st.autoRun.intervalMinutes >= 60 ? `${st.autoRun.intervalMinutes / 60} h` : `${st.autoRun.intervalMinutes} min`}` : 'Off') +
      row('Game launches', { auto: 'Automatic: starts a game for a minute when SHiFT asks', ask: 'Asks first, so it never interrupts your game', off: 'Off' }[st.gameAssist.mode] || 'Off');
  }
  // "How you play" step: reflect the current choice.
  const playing = WZ.played ?? (S.settings.gameAssist.mode === 'auto' ? 'no' : S.settings.gameAssist.playing ? 'yes' : null);
  $$('[data-act="wz-play"]').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === playing);
    b.setAttribute('aria-checked', String(b.dataset.v === playing));
  });

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
  if (e.key === 'Escape' && WZ.open && $('#plainModal').hidden && !help.isOpen()) closeWizard({ toast: true });
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
  } else if (a === 'assist-resume') {
    await act(() => api('POST', '/api/games/resume'), 'Launching the game, then resuming…').catch(() => {});
  } else if (a === 'setup') {
    openWizard(S.account.loggedIn ? 2 : 1);
  } else if (a === 'wz-play') {
    const yes = t.dataset.v === 'yes';
    WZ.played = t.dataset.v;
    setSetting('gameAssist.playing', yes);
    setSetting('gameAssist.askedAt', Date.now());
    setSetting('gameAssist.mode', yes ? 'ask' : 'auto', { now: true });
    renderWizard();
  } else if (a === 'nudge-on') {
    setSetting('gameAssist.askedAt', Date.now());
    setSetting('gameAssist.mode', 'auto', { now: true });
    toast('Games will be launched automatically when SHiFT asks', 'ok');
  } else if (a === 'nudge-later') {
    setSetting('gameAssist.askedAt', Date.now(), { now: true });
    toast('OK, we’ll ask again in a week');
  } else if (a === 'nudge-never') {
    setSetting('gameAssist.dontAsk', true);
    setSetting('gameAssist.askedAt', Date.now(), { now: true });
    toast('We won’t ask again. You can change this in Settings → Game launch assist.');
  } else if (a === 'import') {
    ev.preventDefault();
    goTo('codes');
    runAction('import');
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
$('#btnTestLaunch').addEventListener('click', () => act(() => api('POST', '/api/games/test')).then((r) => toast(`Launching ${r.plan.title} via ${r.plan.via}…`, 'ok')).catch(() => {}));
$('#btnRescan').addEventListener('click', async () => {
  const r = await act(() => api('POST', '/api/games/refresh')).catch(() => null);
  if (r) {
    S.games = r.games;
    renderAssist();
    toast('Installed games re-scanned', 'ok');
  }
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
  lists.openPaste();
  setTimeout(() => $('#pasteText').focus(), 60);
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
    lastPick = el.value;
    setSetting(`${kind}.selected`, [...sel]);
    lastPick = null;
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
    if (el.type === 'range' || el.type === 'number' || 'num' in el.dataset) v = Number(v);
    setSetting(el.dataset.setting, v);
  }
});
$('#delayRange').addEventListener('input', (e) => ($('#delayOut').textContent = `${e.target.value} sec`));

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

// ------------------------------------------------------------------ help

function goTo(tab, elId) {
  if (location.hash !== `#${tab}`) location.hash = `#${tab}`;
  else showTab();
  if (!elId) return;
  setTimeout(() => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('flash-target');
    void el.offsetWidth;
    el.classList.add('flash-target');
  }, 80);
}

function runAction(a, arg) {
  if (a === 'setup') openWizard(0);
  else if (a === 'paste') {
    lists.openPaste();
    setTimeout(() => $('#pasteText').focus(), 120);
  } else if (a === 'import') lists.openImport();
  else if (a === 'export') lists.openExport(); else if (a === 'data') api('POST', '/api/app/open-data').catch((e) => toast(e.message, 'err'));
  else if (a === 'toast') toast(arg, 'ok');
}

function getDiagnostics() {
  const st = S.settings || {};
  const lr = S.engine.lastRun;
  const redact = (t) => String(t).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>');
  const lines = [
    `SHiFT Redeemer ${S.app?.version || '?'} · ${S.app?.platform || navigator.platform} · ${S.app?.packaged ? 'installed app' : 'from source'}`,
    `Signed in: ${S.account.loggedIn ? 'yes' : 'no'} · password saved: ${S.account.saved ? (S.account.saved.secure ? `securely (${S.account.saved.storeName})` : 'plain text') : 'no'} · secure storage: ${S.account.secureStore?.available ? 'available' : `unavailable (${S.account.secureStore?.reason || '?'})`}`,
    `Titles: ${st.titles?.mode === 'all' ? 'all' : (st.titles?.selected || []).join(', ')} · Platforms: ${st.platforms?.mode === 'all' ? 'all linked' : (st.platforms?.selected || []).join(', ')} · Linked: ${S.catalog.platforms.filter((p) => p.linked).map((p) => p.id).join(', ') || 'none seen'}`,
    `Auto-pilot: ${st.autoRun?.enabled ? `on, every ${st.autoRun.intervalMinutes} min` : 'off'} · Game assist: ${st.gameAssist?.mode} (Steam ${S.games.steam?.found ? `found, installed: ${(S.games.steam.installed || []).join(', ') || 'none'}` : 'not found'}) · Delay: ${st.delaySeconds}s`,
    `Codes: ${S.stats.total || 0} known, ${S.stats.queue || 0} queued, ${S.stats.successes || 0} redeemed`,
    lr ? `Last run: ${new Date(lr.finishedAt || lr.at).toISOString()} · checked ${lr.checked}, redeemed ${lr.redeemed}, already ${lr.already}, dead ${lr.dead}, errors ${lr.errors}, launches ${lr.assists || 0}${lr.stopped ? `, stopped: ${lr.stopped}` : ''}${lr.pause ? `, paused (${lr.pause.why}): ${lr.pause.message}` : ''}` : 'Last run: never',
    'Sources: ' + S.sources.map((x) => `${x.id}=${x.enabled ? (x.status ? (x.status.ok ? `ok(${x.status.found})` : 'error') : 'unused') : 'off'}`).join(' '),
    '',
    'Recent activity:',
    ...S.logs.slice(-40).map((e) => `${new Date(e.t).toISOString().slice(11, 19)} ${e.level.padEnd(5)} ${e.msg}`),
  ];
  return redact(lines.join('\n'));
}

const lists = initLists({
  api,
  toast,
  isLoggedIn: () => !!S.account.loggedIn,
  onImported: () => {
    S.filter.status = 'all';
    loadCodes();
  },
});
$('#reduceMotion').checked = document.documentElement.classList.contains('reduce-motion');
$('#reduceMotion').addEventListener('change', (e) => {
  document.documentElement.classList.toggle('reduce-motion', e.target.checked);
  try {
    localStorage.setItem(MOTION_KEY, e.target.checked ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  toast(e.target.checked ? 'Animations reduced' : 'Animations on', 'ok');
});
const report = initReport({ api, toast, isVisible: () => location.hash === '#rewards' });
const help = initHelp({ goTo, runAction, getDiagnostics, repoUrl: 'https://github.com/approved48/shift-redeemer', getRewardCounts: () => report.counts() });
initTips();

// Sources → Ask an AI to find codes
async function aiInstructions() {
  return api('GET', `/api/llm-instructions?skipKnown=${$('#aiSkipKnown').checked ? 1 : 0}`);
}
$('#btnAiDownload').addEventListener('click', async () => {
  try {
    const r = await aiInstructions();
    const url = URL.createObjectURL(new Blob([r.content], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Instructions downloaded. Give the file to your AI assistant.', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
});
$('#btnAiCopy').addEventListener('click', async () => {
  try {
    const r = await aiInstructions();
    await navigator.clipboard.writeText(r.content);
    toast('Instructions copied. Paste them into your AI assistant.', 'ok');
  } catch (e) {
    toast(`Couldn't copy: ${e.message}`, 'err');
  }
});
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (!g) return;
  e.preventDefault();
  goTo(g.getAttribute('href').slice(1), g.dataset.goto);
});

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
