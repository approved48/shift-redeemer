// SHiFT Redeemer front-end (no build step, no framework).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const S = {
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

const STATUS = {
  new: { label: 'Unchecked', c: '#4fc3f7', group: 'queue' },
  pending: { label: 'Queued', c: '#ffd21f', group: 'queue' },
  partial: { label: 'Partly done', c: '#ff8a1f', group: 'queue' },
  retry: { label: 'Retry', c: '#ff8a1f', group: 'queue' },
  redeemed: { label: 'Redeemed', c: '#8fe36a', group: 'done' },
  expired: { label: 'Expired', c: '#77716a', group: 'dead' },
  invalid: { label: 'Invalid', c: '#ff5148', group: 'dead' },
  unavailable: { label: 'Unavailable', c: '#77716a', group: 'dead' },
  stale: { label: 'Likely expired', c: '#5d5953', group: 'dead' },
  filtered: { label: 'Not targeted', c: '#9c8cc4', group: 'other' },
  ignored: { label: 'Ignored', c: '#444', group: 'other' },
};
const RESULT_LABEL = { success: 'redeemed', redeemed: 'already had', trylater: 'launch game', expired: 'expired', error: 'error', none: '?', slowdown: 'rate-limited', auth: 'signed out' };

const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 6 10 6a9.6 9.6 0 0 0 4.4-1"/></svg>',
  show: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
};

// ------------------------------------------------------------------ api

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-shift-redeemer': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
const fmtDate = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

function setPath(obj, path, value) {
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
  const patch = setPath({}, path, value);
  deepAssign(S.settings, patch);
  deepAssign(pendingPatch, patch);
  renderSettingsBound();
  renderTargets();
  renderDashboard();
  renderCodes();
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
  });
  es.addEventListener('codes', (e) => {
    S.stats = JSON.parse(e.data).stats;
    renderStats();
    loadCodes();
  });
  es.addEventListener('hello', () => loadState().catch(() => {}));
  es.onerror = () => {
    $('#acctPill .txt').textContent = 'App offline';
    $('#acctPill').className = 'acct-pill off';
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
}

function renderAccount() {
  const a = S.account;
  const pill = $('#acctPill');
  pill.className = `acct-pill ${a.loggedIn ? 'on' : 'off'}`;
  $('.txt', pill).textContent = a.loggedIn ? a.email || 'SHiFT connected' : 'Not connected';
  $('#acctStatus').innerHTML = a.loggedIn
    ? `<span class="badge-big on">Connected</span>
       <div class="who"><b>${esc(a.email || 'SHiFT account')}</b><span class="muted">Session verified ${ago(a.checkedAt)}${a.hasSavedCredentials ? ' · credentials saved for auto sign-in' : ''}</span></div>
       <div class="row gap"><button class="btn" data-act="acct-check">Re-check</button><button class="btn btn-ghost" data-act="acct-logout">Disconnect</button></div>`
    : `<span class="badge-big">Not connected</span>
       <div class="who"><b>Connect your SHiFT account</b><span class="muted">${a.error ? esc(a.error) : 'Use option A or B below. Nothing is redeemed until you connect.'}</span></div>
       ${a.cookieNames?.length ? '<div class="row gap"><button class="btn" data-act="acct-check">Re-check</button></div>' : ''}`;
}

function renderRun() {
  const e = S.engine;
  const live = e.running;
  const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
  $('#btnStop').hidden = !live;
  ['#btnGo', '#btnCollect', '#btnRedeem', '#btnCollectAll'].forEach((s) => ($(s).disabled = live));
  const lr = e.lastRun;
  $('#runCard').innerHTML = `
    <div class="run-label">${live ? (e.kind === 'collect' ? 'Searching sources' : 'Redeeming') : 'Status'}</div>
    <div class="run-phase ${live ? 'live' : ''}">${live ? esc(e.phase) : S.account.loggedIn ? 'Standing by' : 'Not connected'}</div>
    <div class="run-current">${live && e.current ? esc(e.current) : live ? '…' : `${S.stats.queue ?? 0} code(s) waiting in the queue`}</div>
    <div class="bar ${live ? 'live' : ''}"><i style="width:${live ? Math.max(pct, 3) : 0}%"></i></div>
    <div class="run-nums"><span>${live ? `${e.done} / ${e.total}` : ''}</span><span>${live ? `${pct}%` : ''}</span></div>
    ${e.message ? `<div class="run-msg">${esc(e.message)}</div>` : ''}
    <div class="run-foot">
      <span>Last code search: <b>${e.lastCollect ? `${ago(e.lastCollect.at)} · ${e.lastCollect.added} new` : 'never'}</b></span>
      <span>Last redeem run: <b>${lr ? `${ago(lr.finishedAt || lr.at)} · ${lr.redeemed} redeemed` : 'never'}</b></span>
      <span>Auto-pilot: <b>${S.settings?.autoRun.enabled ? (e.nextRun ? `next run ${ago(e.nextRun)}` : 'on') : 'off'}</b></span>
    </div>`;
  renderBanners();
}

function renderBanners() {
  const out = [];
  if (!S.account.loggedIn)
    out.push(`<div class="banner danger"><div><b>Connect your SHiFT account</b><p>Codes can be found without an account, but redeeming needs you signed in.</p></div><a class="btn btn-primary" href="#account">Connect</a></div>`);
  const blocked = S.engine.blocked || [];
  const lr = S.engine.lastRun;
  if (blocked.length || lr?.stopped === 'Launch a game')
    out.push(`<div class="banner"><div><b>SHiFT wants you to launch a game</b><p>Gearbox pauses redemptions until you start any SHiFT-enabled Borderlands title${blocked.length ? ` on ${blocked.map((b) => platformById(b)?.name || b).join(', ')}` : ''}. Launch one, wait at the main menu for a minute, then redeem again.</p></div><button class="btn btn-primary" data-act="redeem">Redeem again</button></div>`);
  $('#dashBanners').innerHTML = out.join('');
}

function renderStats() {
  const s = S.stats;
  $('#tabCount').textContent = s.total ? s.total : '';
  const tiles = [
    ['In queue', s.queue, '#ffd21f', 'to check / redeem'],
    ['Redeemed', s.successes, '#8fe36a', 'rewards unlocked by this app'],
    ['Done', s.redeemed, '#4fc3f7', 'codes fully redeemed'],
    ['Dead', (s.expired || 0) + (s.invalid || 0) + (s.unavailable || 0) + (s.stale || 0), '#ff5148', 'expired or invalid'],
    ['Known codes', s.total, '#ff8a1f', `${s.filtered || 0} not for your targets`],
  ];
  $('#stats').innerHTML = tiles
    .map(([l, n, c, sub]) => `<div class="stat" style="--c:${c}"><div class="num">${n ?? 0}</div><div class="lbl">${l}</div><div class="sub">${esc(sub)}</div></div>`)
    .join('');
}

function renderDashboard() {
  if (!S.settings) return;
  renderStats();
  renderBanners();
  const st = S.settings;
  const titleChips =
    st.titles.mode === 'all'
      ? '<span class="chip all">All titles</span>'
      : st.titles.selected.length
        ? st.titles.selected.map((id) => `<span class="chip" style="--c:${titleColor(id)}"><i></i>${esc(titleLabel(id))}</span>`).join('')
        : '<span class="muted">None selected — nothing will be redeemed</span>';
  const platChips =
    st.platforms.mode === 'all'
      ? '<span class="chip all">All linked platforms</span>'
      : st.platforms.selected.length
        ? st.platforms.selected.map((id) => `<span class="chip"><i></i>${esc(platformById(id)?.name || id)}</span>`).join('')
        : '<span class="muted">None selected — nothing will be redeemed</span>';
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
        ${lr.stopped ? `<dt>Stopped</dt><dd style="color:var(--orange)">${esc(lr.stopped)}</dd>` : ''}
      </dl>`
    : '<p class="muted" style="margin:0">No runs yet. Hit <b>Find &amp; redeem</b> to start.</p>';
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
  $('#titleBulk').hidden = tAll;
  $('#titleGrid').innerHTML = S.catalog.titles
    .map((t) => {
      const on = tAll || st.titles.selected.includes(t.id);
      const n = codeCountFor(t.id);
      return `<label class="pick ${on ? 'on' : ''} ${tAll ? 'locked' : ''}" style="--c:${t.color}">
        <input type="checkbox" data-pick="titles" value="${esc(t.id)}" ${on ? 'checked' : ''} ${tAll ? 'disabled' : ''}>
        <span class="tick">${ICON.check}</span>
        <span class="big">${esc(t.short)}</span>
        <span class="nm">${esc(t.name)}</span>
        <span class="meta">${t.discovered ? 'Discovered via SHiFT · ' : ''}${n} code${n === 1 ? '' : 's'} known</span>
      </label>`;
    })
    .join('');
  const pAll = st.platforms.mode === 'all';
  $('#platGrid').innerHTML = S.catalog.platforms
    .map((p) => {
      const on = pAll ? p.linked : st.platforms.selected.includes(p.id);
      return `<label class="pick ${on ? 'on' : ''} ${pAll ? 'locked' : ''} ${pAll && !p.linked ? 'dim' : ''}" style="--c:#ffd21f">
        <input type="checkbox" data-pick="platforms" value="${esc(p.id)}" ${on ? 'checked' : ''} ${pAll ? 'disabled' : ''}>
        <span class="tick">${ICON.check}</span>
        <span class="big">${esc(p.glyph)}</span>
        <span class="nm">${esc(p.name)}${p.linked ? '<span class="tag-linked">Linked</span>' : ''}</span>
        <span class="meta">${p.linked ? 'SHiFT offers this platform on your account' : pAll ? 'Not seen on your account yet' : 'Will be used if linked'}</span>
      </label>`;
    })
    .join('');
  const nT = tAll ? 'every' : st.titles.selected.length;
  const linked = S.catalog.platforms.filter((p) => p.linked).length;
  const nP = pAll ? (linked || 'every linked') : st.platforms.selected.length;
  $('#matrix').innerHTML = `<div class="eq">${nT === 'every' ? 'ALL' : nT} × ${pAll ? (linked ? linked : 'ALL') : nP}</div>
    <p>Each valid code will be redeemed for <b>${tAll ? 'every title it unlocks' : `${nT} selected title${nT === 1 ? '' : 's'}`}</b> on <b>${pAll ? 'every platform linked to your SHiFT account' : `${nP} selected platform${nP === 1 ? '' : 's'}`}</b>.
    ${!tAll && !st.titles.selected.length ? '<br><span style="color:var(--red)">No titles selected — nothing will be redeemed.</span>' : ''}
    ${!pAll && !st.platforms.selected.length ? '<br><span style="color:var(--red)">No platforms selected — nothing will be redeemed.</span>' : ''}</p>`;
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
      <button class="btn btn-sm" data-collect="${esc(s.id)}" ${S.engine.running ? 'disabled' : ''}>${ICON.search} Search</button>
      ${s.custom ? `<button class="btn btn-sm btn-ghost" data-del-source="${esc(s.id.replace(/^custom:/, ''))}" title="Remove">${ICON.trash}</button>` : ''}
    </div>
  </div>`;
}
function renderSources() {
  $('#builtinSources').innerHTML = S.sources.filter((s) => !s.custom).map(sourceCard).join('');
  const custom = S.sources.filter((s) => s.custom);
  $('#customSources').innerHTML = custom.length ? custom.map(sourceCard).join('') : '<div class="empty">No custom sources yet. Paste a guide or deal URL above.</div>';
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
      ? `Next automatic run ${ago(nr)} (${new Date(nr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Keep this app running.`
      : 'Scheduled. Keep this app running.'
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
    <div class="key"><code>${esc(c.code)}</code><button class="btn btn-ghost btn-icon btn-sm" data-copy="${esc(c.code)}" title="Copy code">${ICON.copy}</button></div>
    <div class="what">
      <div class="reward" title="${esc(c.reward)}">${esc(c.reward || 'Unknown reward')}</div>
      <div class="games">${games.map((g) => `<span class="gtag" style="--c:${titleColor(g)}">${esc(titleLabel(g))}</span>`).join('')}${c.platforms.map((p) => `<span class="ptag">${esc(platformById(p)?.name || p)} only</span>`).join('')}
        <span class="srcs">via ${c.sources.map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name))).join(', ')}</span></div>
    </div>
    <div class="exp ${expCls}">${c.expires ? esc(c.expires) : '—'}<small>${exp ? (exp < Date.now() ? 'expiry date' : 'expires') : 'no expiry listed'}</small></div>
    <div class="st"><span class="badge" style="--sc:${st.c}">${st.label}</span>${offers ? `<div class="offers">${offers}</div>` : ''}</div>
    <div class="acts">
      <button class="btn btn-sm btn-primary btn-icon" data-redeem="${esc(c.code)}" title="Check &amp; redeem now" ${S.engine.running ? 'disabled' : ''}>${ICON.bolt}</button>
      <button class="btn btn-sm btn-ghost btn-icon" data-reset="${esc(c.code)}" title="Forget results so it gets re-checked">${ICON.redo}</button>
      <button class="btn btn-sm btn-ghost btn-icon" data-ignore="${esc(c.code)}" data-on="${c.ignored ? '0' : '1'}" title="${c.ignored ? 'Stop ignoring' : 'Ignore this code'}">${c.ignored ? ICON.show : ICON.eye}</button>
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
    : `<div class="empty">${S.codes.length ? 'No codes match these filters.' : 'No codes yet — run <b>Find codes</b> on the dashboard or paste some with <b>+ Add codes</b>.'}</div>`;
  $('#btnMore').hidden = list.length <= S.shown;
  $('#btnMore').textContent = `Show more (${list.length - S.shown} left)`;
}

// ------------------------------------------------------------------ events

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-act]');
  if (!t) return;

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
    await act(() => api('POST', '/api/codes/reset', { codes: [t.dataset.reset] }), 'Results cleared — it will be re-checked').catch(() => {});
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
  } else if (a === 'acct-logout') {
    await act(() => api('POST', '/api/account/logout'), 'Disconnected').catch(() => {});
    loadState();
  } else if (a === 'redeem') {
    await act(() => api('POST', '/api/run', {})).catch(() => {});
  }
});

$('#btnGo').addEventListener('click', () => {
  if (!S.account.loggedIn) {
    toast('Connect your SHiFT account first', 'err');
    location.hash = '#account';
    return;
  }
  act(() => api('POST', '/api/run', { collectFirst: true }));
});
$('#btnCollect').addEventListener('click', () => act(() => api('POST', '/api/collect', {})));
$('#btnCollectAll').addEventListener('click', () => act(() => api('POST', '/api/collect', {}), 'Searching sources…'));
$('#btnRedeem').addEventListener('click', () => {
  if (!S.account.loggedIn) {
    toast('Connect your SHiFT account first', 'err');
    location.hash = '#account';
    return;
  }
  act(() => api('POST', '/api/run', {}));
});
$('#btnStop').addEventListener('click', () => act(() => api('POST', '/api/stop')));
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
  toast(`${r.codes.length} code(s) added${redeem ? ' — redeeming now' : ''}`, 'ok');
  $('#pasteText').value = '';
  $('#pasteCount').textContent = '';
  S.filter.status = 'all';
  loadCodes();
}
$('#btnPasteAdd').addEventListener('click', () => addPasted(false).catch(() => {}));
$('#btnPasteRedeem').addEventListener('click', () => {
  if (!S.account.loggedIn) return toast('Connect your SHiFT account first', 'err');
  addPasted(true).catch(() => {});
});

// targets picks + settings inputs + source toggles
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.pick) {
    const kind = el.dataset.pick;
    const sel = new Set(S.settings[kind].selected);
    el.checked ? sel.add(el.value) : sel.delete(el.value);
    setSetting(`${kind}.selected`, [...sel]);
  } else if (el.dataset.source) {
    const id = el.dataset.source;
    if (id.startsWith('custom:')) {
      const list = S.settings.customSources.map((c) => (`custom:${c.id}` === id ? { ...c, enabled: el.checked } : c));
      S.settings.customSources = list;
      api('PUT', '/api/settings', { sources: { [id]: { enabled: el.checked } } }).then((st) => applyState(st));
    } else {
      api('PUT', '/api/settings', { sources: { [id]: { enabled: el.checked } } }).then((st) => applyState(st));
    }
  } else if (el.dataset.setting && !el.closest('.seg')) {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range' || el.type === 'number' || el.tagName === 'SELECT') v = Number(v);
    setSetting(el.dataset.setting, v);
  }
});
$('#delayRange').addEventListener('input', (e) => ($('#delayOut').textContent = `${e.target.value}s`));

// forms
$('#cookieForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', e.target);
  btn.disabled = true;
  try {
    await act(() => api('POST', '/api/account/cookie', { cookie: e.target.cookie.value }), 'Connected to SHiFT');
    e.target.reset();
    loadState();
  } catch {
    /* toasted */
  } finally {
    btn.disabled = false;
  }
});
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = $('button', f);
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    await act(() => api('POST', '/api/account/login', { email: f.email.value, password: f.password.value, remember: f.remember.checked }), 'Signed in to SHiFT');
    f.password.value = '';
    loadState();
  } catch {
    /* toasted */
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
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

showTab();
loadState().then(loadCodes).catch((e) => toast(`Could not reach the app: ${e.message}`, 'err'));
connect();
