// Rewards report: totals, keys by month (stacked columns), per-title cards, cosmetics and history.

import { KINDS } from './glossary.js';
import { coverHTML, accentOf } from './titleart.js';
import { uiZoom } from './zoom.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const monthLabel = (mk, long = false) => {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], long ? { month: 'long', year: 'numeric' } : { month: 'short' });
};

// Validated categorical order for the dark surface (gold sits between the two cool hues so the
// pair that merges under deuteranopia is never adjacent). Stack order = legend order = this order.
const SERIES = [
  { id: 'diamond', name: 'Diamond Keys', color: '#1592b8' },
  { id: 'golden', name: 'Golden Keys', color: '#b8861f' },
  { id: 'skeleton', name: 'Skeleton Keys', color: '#9b6be0' },
];
const PLATFORM_NAMES = { steam: 'Steam', epic: 'Epic Games', psn: 'PlayStation', xboxlive: 'Xbox', nintendo: 'Nintendo Switch' };

export function initReport({ api, toast, isVisible }) {
  const R = { data: null, days: 0, platform: '', title: null, shown: 40, kind: '', cosShown: 24 };
  let loading = false;

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const q = new URLSearchParams();
      if (R.days) q.set('days', R.days);
      if (R.platform) q.set('platform', R.platform);
      R.data = await api('GET', `/api/report?${q}`);
      render();
    } catch (e) {
      toast(`Couldn't load the report: ${e.message}`, 'err');
    } finally {
      loading = false;
    }
  }

  // ---------------------------------------------------------------- render

  function render() {
    const d = R.data;
    if (!d) return;
    $('#rpUpdated').textContent = `Updated ${new Date(d.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const hasAny = d.totals.rewards + d.totals.already > 0;
    $('#rpEmpty').innerHTML = hasAny
      ? ''
      : `<div class="callout is-eridian"><span class="co-ic" aria-hidden="true">🗝</span><div class="co-body"><b class="co-title">No rewards ${R.days || R.platform ? 'for this filter' : 'yet'}</b>${R.days || R.platform ? 'Try a longer period or all platforms.' : 'Press <b>Find &amp; redeem</b> on the dashboard. Everything the app unlocks shows up here.'}</div>${R.days || R.platform ? '' : '<div class="co-actions"><a class="btn btn-sm btn-eridian" href="#dashboard">Go to dashboard</a></div>'}</div>`;
    ['#rpTotals', '#rpChartCard', '#rpTitles', '#rpHistoryCard', '#rpCosmeticsCard'].forEach((s) => ($(s).hidden = !hasAny));
    if (!hasAny) return;
    renderTotals(d);
    renderChart(d);
    renderTitles(d);
    renderCosmetics(d);
    renderHistory(d);
  }

  function renderTotals(d) {
    const k = d.totals.keys;
    const tile = (label, value, sub, swatch, tipAttr = '') =>
      `<div class="stat-tile" ${tipAttr} ${tipAttr ? 'tabindex="0"' : ''}>${swatch ? `<i class="sw" style="--c:${swatch}"></i>` : ''}<span class="st-label">${label}</span><b class="st-value">${fmt(value)}</b><span class="st-sub">${sub}</span></div>`;
    const topKinds = Object.entries(d.totals.kinds || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${fmt(n)} ${(KINDS[k] || KINDS.other).name.toLowerCase()}`)
      .join(' · ');
    const plats = Object.entries(d.totals.platforms)
      .map(([p, n]) => `${PLATFORM_NAMES[p] || p} ${fmt(n)}`)
      .join(' · ');
    $('#rpTotals').innerHTML =
      tile('Rewards unlocked', d.totals.rewards, plats || 'across all platforms') +
      SERIES.map((s) => {
        const from = d.titles.filter((t) => t.keys[s.id] > 0).map((t) => t.short);
        return tile(s.name, k[s.id], from.length ? `from ${from.join(', ')}` : 'none yet', s.color, `data-tip-key="${s.id}"`);
      }).join('') +
      tile('Cosmetics & items', d.totals.items, topKinds || (d.totals.unknown ? `${fmt(d.totals.unknown)} reward${d.totals.unknown === 1 ? '' : 's'} not described` : 'skins, heads and more'), null, 'data-tip="Skins, heads, weapon skins, trinkets and other non-key rewards. See them all under Cosmetics collected below."') +
      tile('Already redeemed', d.totals.already, 'were on your account already', null, 'data-tip="Codes SHiFT said you had already redeemed, on the website, in a game or on another device. They count per game and platform."');
  }

  // Stacked columns, one per month. Thin bars, 2px surface gap between segments,
  // 4px rounded data-end, square at the baseline; hairline grid; hover tooltip per segment.
  function renderChart(d) {
    const box = $('#rpChart');
    const months = d.months;
    const W = Math.max(320, box.clientWidth || 800);
    const H = 220;
    const m = { t: 12, r: 8, b: 26, l: 40 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const totals = months.map((mo) => SERIES.reduce((a, s) => a + mo[s.id], 0));
    const max = Math.max(1, ...totals);
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const y = (v) => m.t + ih - (v / top) * ih;
    const band = iw / months.length;
    const bw = Math.min(24, band * 0.6);
    const GAP = 2;

    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Keys redeemed per month, last 12 months">`;
    for (const t of ticks) {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
      svg += `<text x="${m.l - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${t >= 10000 ? `${Math.round(t / 1000)}K` : fmt(t)}</text>`;
    }
    months.forEach((mo, i) => {
      const cx = m.l + band * i + band / 2;
      const x = cx - bw / 2;
      svg += `<text x="${cx}" y="${H - 8}" class="tick" text-anchor="middle">${monthLabel(mo.month)}</text>`;
      const segs = SERIES.filter((s) => mo[s.id] > 0);
      let base = y(0);
      segs.forEach((s, j) => {
        const yTop = base - (mo[s.id] / top) * ih;
        const bottom = j > 0 ? base - GAP : base; // 2px surface gap between stacked segments
        const hh = Math.max(1, bottom - yTop);
        const isTop = j === segs.length - 1;
        const path = isTop ? roundedTop(x, yTop, bw, hh, Math.min(4, hh / 2, bw / 2)) : `M${x},${yTop}h${bw}v${hh}h${-bw}Z`;
        svg += `<path d="${path}" fill="${s.color}" class="seg" tabindex="0" data-m="${i}" data-s="${s.id}"><title>${monthLabel(mo.month, true)}: ${fmt(mo[s.id])} ${s.name}</title></path>`;
        base = yTop;
      });
      // value at the cap of the tallest columns only (selective labels)
      if (totals[i] && totals[i] === max) svg += `<text x="${cx}" y="${y(totals[i]) - 6}" class="cap" text-anchor="middle">${fmt(totals[i])}</text>`;
      // invisible hit target for the whole column
      svg += `<rect x="${cx - band / 2}" y="${m.t}" width="${band}" height="${ih}" class="hit" data-m="${i}"/>`;
    });
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" class="axis"/></svg><div class="chart-tip" id="rpTip" hidden></div>`;
    box.innerHTML = svg;

    $('#rpLegend').innerHTML = SERIES.map((s) => `<span class="lg" data-tip-key="${s.id}" tabindex="0"><i style="--c:${s.color}"></i>${s.name}</span>`).join('');
    $('#rpChartTable').innerHTML = `<table class="data-table"><thead><tr><th>Month</th>${SERIES.map((s) => `<th class="num">${s.name}</th>`).join('')}<th class="num">Items</th><th class="num">Rewards</th></tr></thead><tbody>${months
      .map((mo) => `<tr><td>${monthLabel(mo.month, true)}</td>${SERIES.map((s) => `<td class="num">${fmt(mo[s.id])}</td>`).join('')}<td class="num">${fmt(mo.items)}</td><td class="num">${fmt(mo.rewards)}</td></tr>`)
      .join('')}</tbody></table>`;

    const tip = $('#rpTip');
    const show = (i, evX) => {
      const mo = months[i];
      const total = totals[i];
      tip.innerHTML = `<b>${monthLabel(mo.month, true)}</b>${SERIES.map((s) => `<span class="tr"><i style="--c:${s.color}"></i>${s.name}<em>${fmt(mo[s.id])}</em></span>`).join('')}<span class="tr total">Total keys<em>${fmt(total)}</em></span>${mo.items ? `<span class="tr">Items<em>${fmt(mo.items)}</em></span>` : ''}`;
      tip.hidden = false;
      const z = uiZoom();
      const bx = box.getBoundingClientRect();
      const left = Math.min(bx.width / z - tip.offsetWidth - 4, Math.max(4, (evX - bx.left) / z + 12));
      tip.style.left = `${left}px`;
      tip.style.top = '8px';
      $$('.seg', box).forEach((p) => p.classList.toggle('dim', Number(p.dataset.m) !== i));
    };
    const hide = () => {
      tip.hidden = true;
      $$('.seg', box).forEach((p) => p.classList.remove('dim'));
    };
    $$('.hit, .seg', box).forEach((el) => {
      el.addEventListener('mousemove', (e) => show(Number(el.dataset.m), e.clientX));
      el.addEventListener('focus', () => show(Number(el.dataset.m), el.getBoundingClientRect().right));
      el.addEventListener('blur', hide);
    });
    box.addEventListener('mouseleave', hide);
  }

  function roundedTop(x, y, w, h, r) {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function niceTicks(max) {
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || 10 * mag;
    const out = [];
    for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
    if (out[out.length - 1] < max) out.push(Math.round(out[out.length - 1] + step));
    return out;
  }

  function renderTitles(d) {
    $('#rpTitles').classList.toggle('has-active', d.titles.some((t) => t.id === R.title));
    $('#rpTitles').innerHTML = d.titles
      .map((t) => {
        const keys = SERIES.filter((s) => t.keys[s.id] > 0);
        const plats = Object.entries(t.platforms).map(([p, n]) => `<span class="chip">${esc(PLATFORM_NAMES[p] || p)} ${fmt(n)}</span>`).join('');
        const items = t.items.slice(-3).reverse();
        const on = R.title === t.id;
        return `<section class="rp-title t-${esc(t.id)} ${on ? 'on' : ''}" style="--c:${accentOf(t.id, t.color)}" ${on ? 'aria-current="true"' : ''}>
          ${coverHTML(t)}
          ${on ? '<span class="rp-viewing" aria-hidden="true">◉ Viewing</span>' : ''}
          <div class="rp-body">
          ${accountBar(t)}
          <div class="rp-keys">${
            keys.length
              ? keys.map((s) => `<div class="rp-key" data-tip-key="${s.id}" data-tip-game="${esc(t.id)}" tabindex="0"><i class="sw" style="--c:${s.color}"></i><b>${fmt(t.keys[s.id])}</b><span>${s.name}</span></div>`).join('')
              : '<div class="rp-key none"><span>No keys counted</span></div>'
          }</div>
          <dl class="kv rp-kv">
            <dt>Rewards unlocked</dt><dd>${fmt(t.rewards)}</dd>
            <dt>Items &amp; cosmetics</dt><dd>${fmt(t.items.length)}</dd>
            <dt>Last reward</dt><dd>${fmtDate(t.last)}</dd>
          </dl>
          ${items.length ? `<ul class="rp-items">${items.map((i) => `<li title="${esc(i.name)}"><span class="kic" data-tip-kind="${esc(i.kinds?.[0] || 'other')}">${(KINDS[i.kinds?.[0]] || KINDS.other).ic}</span>${esc(i.name)}</li>`).join('')}${t.items.length > 3 ? `<li class="more"><button class="link-btn" data-rp-cos="${esc(t.id)}">+${t.items.length - 3} more</button></li>` : ''}</ul>` : ''}
          <div class="rp-foot"><div class="chips">${plats}</div>${on ? `<button class="btn btn-sm btn-eridian" data-rp-title="${esc(t.id)}" aria-pressed="true" title="Showing this game's cosmetics and history. Select to show every game.">✓ Viewing</button>` : `<button class="btn btn-sm btn-ghost" data-rp-title="${esc(t.id)}" aria-pressed="false" title="Show just this game's cosmetics and history">History</button>`}</div>
          </div>
        </section>`;
      })
      .join('');
  }

  // Which game the Cosmetics and History sections are showing, as a tag at the start of their titles.
  function scopeTag(d) {
    const t = d.titles.find((x) => x.id === R.title);
    if (!t) return '<span class="rp-scope all" title="Showing every game. Select a game card\'s History button to see just that game.">All games</span>';
    return `<span class="rp-scope" style="--c:${accentOf(t.id, t.color)}" title="Showing ${esc(t.name)} only"><b>${esc(t.short)}</b><button type="button" data-rp-title="" aria-label="Show all games" title="Show all games">✕</button></span>`;
  }

  // Where this game stands on your SHiFT account: redeemed here, already redeemed before, still to do.
  function accountBar(t) {
    const a = t.account;
    if (!a || !a.total) return '';
    const done = a.app + a.already;
    const pct = (n) => `${((n / a.total) * 100).toFixed(1)}%`;
    const tip = `${t.name}: ${fmt(done)} of ${fmt(a.total)} rewards from known working codes are on your account${R.platform ? ` (${PLATFORM_NAMES[R.platform] || R.platform})` : ''}. ${fmt(a.app)} redeemed by SHiFT Redeemer, ${fmt(a.already)} already redeemed before (website, in-game or another device)${a.todo ? `, ${fmt(a.todo)} still to redeem for your platforms` : ''}. Counted per code and platform.`;
    return `<div class="rp-acct" data-tip="${esc(tip)}" tabindex="0">
      <div class="rp-acct-head"><span>On your account</span><b>${fmt(done)}<small> / ${fmt(a.total)}</small></b></div>
      <div class="rp-acct-bar" role="img" aria-label="${esc(`${fmt(done)} of ${fmt(a.total)} on your account`)}">${a.app ? `<i class="app" style="width:${pct(a.app)}"></i>` : ''}${a.already ? `<i class="already" style="width:${pct(a.already)}"></i>` : ''}</div>
      <div class="rp-acct-legend"><span><i class="app"></i>${fmt(a.app)} redeemed here</span><span><i class="already"></i>${fmt(a.already)} already redeemed</span>${a.todo ? `<span><i class="todo"></i>${fmt(a.todo)} to go</span>` : '<span class="all">✓ all done</span>'}</div>
    </div>`;
  }

  function renderHistory(d) {
    const rows = d.recent.filter((r) => !R.title || r.titleId === R.title);
    const t = d.titles.find((x) => x.id === R.title);
    $('#rpHistScope').innerHTML = scopeTag(d);
    $('#rpHistory').innerHTML = rows.length
      ? `<table class="data-table history-table"><thead><tr><th>Date</th><th>Game</th><th>Platform</th><th>Reward</th><th class="num">Keys</th><th>Code</th></tr></thead><tbody>${rows
          .slice(0, R.shown)
          .map((r) => {
            const keys = SERIES.filter((s) => r.keys[s.id]).map((s) => `<span class="kk" data-tip-key="${s.id}" data-tip-game="${esc(r.titleId)}"><i class="sw" style="--c:${s.color}"></i>${fmt(r.keys[s.id])}</span>`).join('');
            const short = d.titles.find((x) => x.id === r.titleId)?.short || r.title;
            return `<tr class="${r.status === 'redeemed' ? 'already' : ''}"><td class="dt">${fmtDate(r.at)}</td><td><span class="full">${esc(r.title)}</span><span class="short">${esc(short)}</span></td><td>${esc(PLATFORM_NAMES[r.service] || r.service)}</td><td class="rw" title="${esc(r.reward)}">${esc(r.reward || 'Reward not described')}${r.status === 'redeemed' ? ' <span class="badge" style="--sc:#8f8474">already had</span>' : ''}</td><td class="num">${keys || '—'}</td><td><code>${esc(r.code)}</code></td></tr>`;
          })
          .join('')}</tbody></table>`
      : '<div class="empty">No rewards for this filter.</div>';
    $('#rpMore').hidden = rows.length <= R.shown;
    $('#rpMore').textContent = `Show more (${rows.length - R.shown} left)`;
  }

  // Every cosmetic unlocked, filterable by type (and by game via the title cards).
  function renderCosmetics(d) {
    const all = (d.cosmetics || []).filter((c) => !R.title || c.titleId === R.title);
    const counts = {};
    for (const c of all) counts[c.kind] = (counts[c.kind] || 0) + 1;
    if (R.kind && !counts[R.kind]) R.kind = '';
    const kinds = (d.itemKinds || []).filter((k) => counts[k.id]);
    $('#rpCosFilter').innerHTML = all.length
      ? `<button class="${R.kind ? '' : 'on'}" data-rp-kind="">All ${fmt(all.length)}</button>${kinds
          .map((k) => `<button class="${R.kind === k.id ? 'on' : ''}" data-rp-kind="${k.id}" data-tip-kind="${k.id}">${(KINDS[k.id] || KINDS.other).ic} ${esc(k.name)} ${fmt(counts[k.id])}</button>`)
          .join('')}`
      : '';
    $('#rpCosScope').innerHTML = scopeTag(d);
    const list = all.filter((c) => !R.kind || c.kind === R.kind);
    const t = d.titles.find((x) => x.id === R.title);
    $('#rpCosSub').textContent = all.length
      ? `${fmt(all.length)} cosmetic${all.length === 1 ? '' : 's'} and item${all.length === 1 ? '' : 's'}${t ? ` in ${t.name}` : ''}. Each is listed once, with every platform it went to.`
      : t
        ? `No cosmetics unlocked in ${t.name} yet. Codes that give cosmetics show up here once they’re redeemed.`
        : 'No cosmetics unlocked yet. Codes that give skins, heads and other cosmetics show up here once they’re redeemed.';
    $('#rpCosmetics').innerHTML = list
      .slice(0, R.cosShown)
      .map((c) => {
        const k = KINDS[c.kind] || KINDS.other;
        const short = d.titles.find((x) => x.id === c.titleId)?.short || c.title;
        const color = d.titles.find((x) => x.id === c.titleId)?.color || '#8f8474';
        return `<div class="cos" style="--c:${color}"><span class="cos-ic" data-tip-kind="${esc(c.kind)}" tabindex="0" aria-label="${esc(k.name)}">${k.ic}</span><div class="cos-body"><b title="${esc(c.name)}">${esc(c.name)}</b><span><span class="gtag" style="--c:${color}">${esc(short)}</span>${esc(k.name.replace(/s$/, ''))} · ${c.services.map((p) => esc(PLATFORM_NAMES[p] || p)).join(', ')} · ${fmtDate(c.at)}</span></div></div>`;
      })
      .join('');
    $('#rpCosMore').hidden = list.length <= R.cosShown;
    $('#rpCosMore').textContent = `Show more (${list.length - R.cosShown} left)`;
  }

  function exportCsv() {
    const d = R.data;
    if (!d) return;
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Game', 'Platform', 'Code', 'Reward', 'Golden Keys', 'Diamond Keys', 'Skeleton Keys', 'Item', 'Item type', 'Status'].map(q).join(',')];
    for (const r of d.recent) {
      lines.push([new Date(r.at).toISOString().slice(0, 10), r.title, PLATFORM_NAMES[r.service] || r.service, r.code, r.reward, r.keys.golden, r.keys.diamond, r.keys.skeleton, r.item || '', (r.kinds || []).map((k) => (KINDS[k] || KINDS.other).name).join('; '), r.status === 'success' ? 'Redeemed' : 'Already had'].map(q).join(','));
    }
    const url = URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift-rewards-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Rewards exported as CSV', 'ok');
  }

  // ---------------------------------------------------------------- events

  $('#rpRange').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    R.days = Number(b.dataset.days);
    $$('#rpRange button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  $('#rpPlatform').addEventListener('change', (e) => {
    R.platform = e.target.value;
    load();
  });
  $('#rpExport').addEventListener('click', exportCsv);
  $('#rpTableToggle').addEventListener('click', (e) => {
    const on = $('#rpChartTable').hidden;
    $('#rpChartTable').hidden = !on;
    $('#rpChart').hidden = on;
    e.currentTarget.textContent = on ? 'Show chart' : 'Show table';
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });
  $('#rpCosMore').addEventListener('click', () => {
    R.cosShown += 48;
    renderCosmetics(R.data);
  });
  $('#rpCosFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rp-kind]');
    if (!b) return;
    R.kind = b.dataset.rpKind;
    R.cosShown = 24;
    renderCosmetics(R.data);
  });
  $('#rpMore').addEventListener('click', () => {
    R.shown += 60;
    renderHistory(R.data);
  });
  document.addEventListener('click', (e) => {
    const cos = e.target.closest('[data-rp-cos]');
    const b = cos || e.target.closest('[data-rp-title]');
    if (!b) return;
    const id = cos ? cos.dataset.rpCos : b.dataset.rpTitle;
    R.title = cos ? id : id && R.title !== id ? id : null;
    R.shown = 40;
    R.cosShown = 24;
    renderTitles(R.data);
    renderCosmetics(R.data);
    renderHistory(R.data);
    if (R.title) $(cos ? '#rpCosmeticsCard' : '#rpHistoryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => isVisible() && R.data && renderChart(R.data), 150);
  });

  return {
    /** Latest report data (for Help → Rewards guide), loading it if needed. */
    async counts() {
      const d = R.data && !R.days && !R.platform ? R.data : await api('GET', '/api/report');
      const keys = {};
      for (const t of d.titles) keys[t.id] = t.keys;
      return { keys, kinds: d.totals.kinds || {} };
    },
    /** Refresh when the tab is opened or redemptions change. */
    refresh(platforms) {
      const sel = $('#rpPlatform');
      const opts = `<option value="">All platforms</option>${platforms.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}`;
      if (sel.dataset.sig !== opts) {
        sel.innerHTML = opts;
        sel.dataset.sig = opts;
        sel.value = R.platform;
      }
      if (isVisible()) load();
    },
  };
}
