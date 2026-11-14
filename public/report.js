// Rewards report: totals, keys by month (stacked columns), per-title cards and history.

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
  const R = { data: null, days: 0, platform: '', title: null, shown: 40 };
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
    ['#rpTotals', '#rpChartCard', '#rpTitles', '#rpHistoryCard'].forEach((s) => ($(s).hidden = !hasAny));
    if (!hasAny) return;
    renderTotals(d);
    renderChart(d);
    renderTitles(d);
    renderHistory(d);
  }

  function renderTotals(d) {
    const k = d.totals.keys;
    const tile = (label, value, sub, swatch) =>
      `<div class="stat-tile">${swatch ? `<i class="sw" style="--c:${swatch}"></i>` : ''}<span class="st-label">${label}</span><b class="st-value">${fmt(value)}</b><span class="st-sub">${sub}</span></div>`;
    const plats = Object.entries(d.totals.platforms)
      .map(([p, n]) => `${PLATFORM_NAMES[p] || p} ${fmt(n)}`)
      .join(' · ');
    $('#rpTotals').innerHTML =
      tile('Rewards unlocked', d.totals.rewards, plats || 'across all platforms') +
      SERIES.map((s) => {
        const from = d.titles.filter((t) => t.keys[s.id] > 0).map((t) => t.short);
        return tile(s.name, k[s.id], from.length ? `from ${from.join(', ')}` : 'none yet', s.color);
      }).join('') +
      tile('Items & cosmetics', d.totals.items, d.totals.unknown ? `${fmt(d.totals.unknown)} reward${d.totals.unknown === 1 ? '' : 's'} not described` : 'skins, heads and more') +
      tile('Already on account', d.totals.already, 'redeemed before');
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

    $('#rpLegend').innerHTML = SERIES.map((s) => `<span class="lg"><i style="--c:${s.color}"></i>${s.name}</span>`).join('');
    $('#rpChartTable').innerHTML = `<table class="data-table"><thead><tr><th>Month</th>${SERIES.map((s) => `<th class="num">${s.name}</th>`).join('')}<th class="num">Items</th><th class="num">Rewards</th></tr></thead><tbody>${months
      .map((mo) => `<tr><td>${monthLabel(mo.month, true)}</td>${SERIES.map((s) => `<td class="num">${fmt(mo[s.id])}</td>`).join('')}<td class="num">${fmt(mo.items)}</td><td class="num">${fmt(mo.rewards)}</td></tr>`)
      .join('')}</tbody></table>`;

    const tip = $('#rpTip');
    const show = (i, evX) => {
      const mo = months[i];
      const total = totals[i];
      tip.innerHTML = `<b>${monthLabel(mo.month, true)}</b>${SERIES.map((s) => `<span class="tr"><i style="--c:${s.color}"></i>${s.name}<em>${fmt(mo[s.id])}</em></span>`).join('')}<span class="tr total">Total keys<em>${fmt(total)}</em></span>${mo.items ? `<span class="tr">Items<em>${fmt(mo.items)}</em></span>` : ''}`;
      tip.hidden = false;
      const bx = box.getBoundingClientRect();
      const left = Math.min(bx.width - tip.offsetWidth - 4, Math.max(4, evX - bx.left + 12));
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
    $('#rpTitles').innerHTML = d.titles
      .map((t) => {
        const keys = SERIES.filter((s) => t.keys[s.id] > 0);
        const plats = Object.entries(t.platforms).map(([p, n]) => `<span class="chip">${esc(PLATFORM_NAMES[p] || p)} ${fmt(n)}</span>`).join('');
        const items = t.items.slice(-3).reverse();
        return `<section class="rp-title ${R.title === t.id ? 'on' : ''}" style="--c:${t.color}">
          <div class="rp-head"><span class="rp-short">${esc(t.short)}</span><span class="rp-name">${esc(t.name)}</span></div>
          <div class="rp-keys">${
            keys.length
              ? keys.map((s) => `<div class="rp-key"><i class="sw" style="--c:${s.color}"></i><b>${fmt(t.keys[s.id])}</b><span>${s.name}</span></div>`).join('')
              : '<div class="rp-key none"><span>No keys counted</span></div>'
          }</div>
          <dl class="kv rp-kv">
            <dt>Rewards unlocked</dt><dd>${fmt(t.rewards)}</dd>
            <dt>Items &amp; cosmetics</dt><dd>${fmt(t.items.length)}</dd>
            ${t.already ? `<dt>Already on account</dt><dd>${fmt(t.already)}</dd>` : ''}
            <dt>Last reward</dt><dd>${fmtDate(t.last)}</dd>
          </dl>
          ${items.length ? `<ul class="rp-items">${items.map((i) => `<li title="${esc(i.name)}">${esc(i.name)}</li>`).join('')}${t.items.length > 3 ? `<li class="more">+${t.items.length - 3} more</li>` : ''}</ul>` : ''}
          <div class="rp-foot"><div class="chips">${plats}</div><button class="btn btn-sm btn-ghost" data-rp-title="${esc(t.id)}">${R.title === t.id ? 'Show all' : 'History'}</button></div>
        </section>`;
      })
      .join('');
  }

  function renderHistory(d) {
    const rows = d.recent.filter((r) => !R.title || r.titleId === R.title);
    const t = d.titles.find((x) => x.id === R.title);
    $('#rpHistoryFilter').innerHTML = t ? `<span class="chip all"><i></i>${esc(t.name)}</span><button class="btn btn-sm btn-ghost" data-rp-title="">Clear</button>` : '';
    $('#rpHistory').innerHTML = rows.length
      ? `<table class="data-table history-table"><thead><tr><th>Date</th><th>Game</th><th>Platform</th><th>Reward</th><th class="num">Keys</th><th>Code</th></tr></thead><tbody>${rows
          .slice(0, R.shown)
          .map((r) => {
            const keys = SERIES.filter((s) => r.keys[s.id]).map((s) => `<span class="kk"><i class="sw" style="--c:${s.color}"></i>${fmt(r.keys[s.id])}</span>`).join('');
            const short = d.titles.find((x) => x.id === r.titleId)?.short || r.title;
            return `<tr class="${r.status === 'redeemed' ? 'already' : ''}"><td class="dt">${fmtDate(r.at)}</td><td><span class="full">${esc(r.title)}</span><span class="short">${esc(short)}</span></td><td>${esc(PLATFORM_NAMES[r.service] || r.service)}</td><td class="rw" title="${esc(r.reward)}">${esc(r.reward || 'Reward not described')}${r.status === 'redeemed' ? ' <span class="badge" style="--sc:#8f8474">already had</span>' : ''}</td><td class="num">${keys || '—'}</td><td><code>${esc(r.code)}</code></td></tr>`;
          })
          .join('')}</tbody></table>`
      : '<div class="empty">No rewards for this filter.</div>';
    $('#rpMore').hidden = rows.length <= R.shown;
    $('#rpMore').textContent = `Show more (${rows.length - R.shown} left)`;
  }

  function exportCsv() {
    const d = R.data;
    if (!d) return;
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Game', 'Platform', 'Code', 'Reward', 'Golden Keys', 'Diamond Keys', 'Skeleton Keys', 'Item', 'Status'].map(q).join(',')];
    for (const r of d.recent) {
      lines.push([new Date(r.at).toISOString().slice(0, 10), r.title, PLATFORM_NAMES[r.service] || r.service, r.code, r.reward, r.keys.golden, r.keys.diamond, r.keys.skeleton, r.item || '', r.status === 'success' ? 'Redeemed' : 'Already had'].map(q).join(','));
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
  $('#rpMore').addEventListener('click', () => {
    R.shown += 60;
    renderHistory(R.data);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rp-title]');
    if (!b) return;
    R.title = b.dataset.rpTitle && R.title !== b.dataset.rpTitle ? b.dataset.rpTitle : null;
    R.shown = 40;
    renderTitles(R.data);
    renderHistory(R.data);
    if (R.title) $('#rpHistoryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => isVisible() && R.data && renderChart(R.data), 150);
  });

  return {
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
