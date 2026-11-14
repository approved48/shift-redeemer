// Banner art for each game's card on the Rewards page and the dashboard tiles. Everything here is
// original artwork made for SHiFT Redeemer: each game's cover colours, a comic-style wordmark, and a
// motif inspired by the mood of its cover, with a little gentle movement. No official logos, cover
// art or Gearbox assets are used.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Small seeded scatter so star fields and splatters look hand-placed but never change.
function scatter(n, seed, box) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => ({ x: box.x + r() * box.w, y: box.y + r() * box.h, k: r() }));
}

// Comic-book helpers shared by the banners: halftone dots and rough ink brush strokes.
const halftone = (id, color, size = 6, r = 1.4) =>
  `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}"/></pattern>`;
// A tapered brush stroke from (x1,y1) to (x2,y2), w wide in the middle.
function brush(x1, y1, x2, y2, w, fill, extra = '') {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w;
  const ny = (dx / len) * w;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `<path d="M${x1} ${y1} Q${mx + nx} ${my + ny} ${x2} ${y2} Q${mx - nx * 0.6} ${my - ny * 0.6} ${x1} ${y1}Z" fill="${fill}" ${extra}/>`;
}
const INK = '#120a06';

const ART = {
  // Borderlands 4: hot cover red, yellow and black comic ink, the Timekeeper's clockwork and a
  // streak of visor-blue energy.
  bl4: {
    mark: ['Borderlands', '4'],
    accent: '#ff4136',
    comic: true,
    art: () => {
      const ticks = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return `<path d="M${268 + Math.cos(a) * 40} ${48 + Math.sin(a) * 40} L${268 + Math.cos(a) * 50} ${48 + Math.sin(a) * 50}"/>`;
      }).join('');
      return `<defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2a3a"/><stop offset=".55" stop-color="#e3132b"/><stop offset="1" stop-color="#9e0818"/></linearGradient>
          ${halftone('dots', '#8a0614', 6, 1.6)}
          <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
          <mask id="m"><rect width="320" height="96" fill="url(#fade)"/></mask>
          <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2ad0ff" stop-opacity="0"/><stop offset=".6" stop-color="#7fe6ff"/><stop offset="1" stop-color="#fff"/></linearGradient>
        </defs>
        <rect width="320" height="96" fill="url(#bg)"/>
        <rect width="320" height="96" fill="url(#dots)" mask="url(#m)"/>
        <g class="slide">${brush(150, 104, 250, -8, 7, INK, 'opacity=".55"')}${brush(186, 104, 286, -8, 4, INK, 'opacity=".4"')}</g>
        <g class="spin" style="transform-origin:268px 48px" fill="none" stroke="${INK}" stroke-linecap="round">
          <circle cx="268" cy="48" r="45" stroke-width="7"/><circle cx="268" cy="48" r="45" stroke="#ffd21f" stroke-width="2.5" stroke-dasharray="10 8"/>
          <g stroke-width="4">${ticks}</g>
        </g>
        <path d="M268 48 L290 26" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
        <path d="M268 48 L248 58" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <path d="M268 48 L290 26" stroke="#ffd21f" stroke-width="2" stroke-linecap="round"/>
        <circle cx="268" cy="48" r="8" fill="#ffd21f" stroke="${INK}" stroke-width="3.5"/>
        <path class="zap" d="M196 64 L246 52 L238 60 L300 44" fill="none" stroke="url(#beam)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
  },
  // Tiny Tina's Wonderlands: tabletop fantasy. Royal purple and magenta, gold leaf, teal magic and a
  // big d20 that rolls gently.
  ttw: {
    mark: ['Tiny Tina’s', 'Wonderlands'],
    accent: '#f3c94f',
    art: () => {
      const star = (p, s) => `<path d="M${p.x} ${p.y - s}L${p.x + s * 0.3} ${p.y - s * 0.3}L${p.x + s} ${p.y}L${p.x + s * 0.3} ${p.y + s * 0.3}L${p.x} ${p.y + s}L${p.x - s * 0.3} ${p.y + s * 0.3}L${p.x - s} ${p.y}L${p.x - s * 0.3} ${p.y - s * 0.3}Z"/>`;
      const gold = scatter(7, 7, { x: 150, y: 6, w: 165, h: 84 }).map((p) => star(p, 2 + p.k * 4)).join('');
      const teal = scatter(6, 19, { x: 140, y: 4, w: 175, h: 88 }).map((p) => star(p, 1.5 + p.k * 3)).join('');
      return `<defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a1fa0"/><stop offset=".55" stop-color="#3b0f66"/><stop offset="1" stop-color="#1c0733"/></linearGradient>
          <radialGradient id="gl" cx=".82" cy=".5" r=".5"><stop offset="0" stop-color="#ff5ccf" stop-opacity=".5"/><stop offset="1" stop-color="#ff5ccf" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="320" height="96" fill="url(#bg)"/>
        <rect width="320" height="96" fill="url(#gl)" class="breathe"/>
        <g fill="#f3c94f" class="twinkle">${gold}</g>
        <g fill="#3fe6cf" class="twinkle late">${teal}</g>
        <g class="sway" style="transform-origin:262px 50px">
          <g transform="rotate(-12 262 50)" stroke-linejoin="round">
            <path d="M262 6 L300 28 L300 72 L262 94 L224 72 L224 28Z" fill="#2a0b4a" fill-opacity=".85" stroke="${INK}" stroke-width="5"/>
            <g fill="none" stroke="#f3c94f" stroke-width="2">
              <path d="M262 6 L300 28 L300 72 L262 94 L224 72 L224 28Z"/>
              <path d="M262 26 L284 66 L240 66Z" fill="#f3c94f" fill-opacity=".16"/>
              <path d="M262 26 L262 6 M262 26 L224 28 M262 26 L300 28 M284 66 L300 28 M284 66 L300 72 M284 66 L262 94 M240 66 L224 28 M240 66 L224 72 M240 66 L262 94" stroke-opacity=".7"/>
            </g>
            <text x="262" y="57" text-anchor="middle" fill="#ffe08a" font-family="'Cinzel Decorative', Georgia, serif" font-weight="700" font-size="15">20</text>
          </g>
        </g>`;
    },
  },
  // Borderlands 3: a hot-pink graffiti wall. Magenta, purple swirls, yellow and cyan drips.
  bl3: {
    mark: ['Borderlands', '3'],
    accent: '#ff4fb0',
    comic: true,
    art: () => {
      const spray = scatter(40, 3, { x: 130, y: 0, w: 190, h: 96 })
        .map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${0.8 + p.k * (i % 7 === 0 ? 5 : 1.8)}" fill="${['#ffd21f', '#25d7f0', '#fff', '#ff7ac8'][i % 4]}" opacity="${0.45 + p.k * 0.5}"/>`)
        .join('');
      const drips = scatter(6, 11, { x: 176, y: 30, w: 134, h: 20 })
        .map((p, i) => `<rect class="drip" style="transform-origin:${p.x}px ${p.y}px;animation-delay:${(i * 0.7).toFixed(1)}s" x="${p.x}" y="${p.y}" width="${3 + p.k * 3}" height="${18 + p.k * 34}" rx="3" fill="${['#ffd21f', '#25d7f0', '#7a1fa0'][i % 3]}"/>`)
        .join('');
      return `<defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0379c"/><stop offset=".6" stop-color="#c41f86"/><stop offset="1" stop-color="#7d1468"/></linearGradient>
          ${halftone('dots', '#ff8fd0', 7, 1.2)}
        </defs>
        <rect width="320" height="96" fill="url(#bg)"/>
        <rect width="320" height="96" fill="url(#dots)" opacity=".35"/>
        <g fill="none" stroke-linecap="round">
          <path class="flow" d="M150 80 C175 20, 215 100, 245 40 S300 -10, 330 50" stroke="#7a1fa0" stroke-width="16" opacity=".85"/>
          <path class="flow" d="M160 96 C195 50, 235 110, 270 60 S315 30, 330 70" stroke="#ff8fd0" stroke-width="7" opacity=".9"/>
          <path d="M150 80 C175 20, 215 100, 245 40 S300 -10, 330 50" stroke="${INK}" stroke-width="2" opacity=".6"/>
        </g>
        ${drips}
        <g>${spray}</g>`;
    },
  },
  // The Pre-Sequel: low gravity on the moon. Deep space blue, a big cratered moon that turns slowly.
  tps: {
    mark: ['Borderlands', 'The Pre-Sequel'],
    accent: '#5ee1ff',
    art: () => {
      const stars = scatter(30, 5, { x: 0, y: 0, w: 320, h: 96 })
        .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${0.4 + p.k * 1.1}" opacity="${0.3 + p.k * 0.7}"/>`)
        .join('');
      // Craters drawn twice side by side and slid across the disc, so the moon appears to turn.
      const craters = (ox) => `<g transform="translate(${ox} 0)"><circle cx="262" cy="8" r="8"/><circle cx="296" cy="30" r="6"/><circle cx="276" cy="46" r="9"/><circle cx="248" cy="28" r="4"/><circle cx="310" cy="6" r="5"/><circle cx="236" cy="50" r="6"/></g>`;
      return `<defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2550"/><stop offset="1" stop-color="#040a1a"/></linearGradient>
          <radialGradient id="moon" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6f1ff"/><stop offset=".55" stop-color="#9fb4d1"/><stop offset="1" stop-color="#4b5d7e"/></radialGradient>
          <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#9fe8ff" stop-opacity=".35"/><stop offset="1" stop-color="#9fe8ff" stop-opacity="0"/></radialGradient>
          <clipPath id="disc"><circle cx="292" cy="22" r="50"/></clipPath>
        </defs>
        <rect width="320" height="96" fill="url(#bg)"/>
        <g fill="#cfe8ff" class="twinkle">${stars}</g>
        <circle cx="292" cy="22" r="64" fill="url(#halo)" class="breathe"/>
        <circle cx="292" cy="22" r="50" fill="url(#moon)"/>
        <g clip-path="url(#disc)"><g fill="#56688a" opacity=".55" class="turn">${craters(0)}${craters(100)}</g></g>
        <circle cx="292" cy="22" r="50" fill="none" stroke="#0a1730" stroke-opacity=".5" stroke-width="10" transform="translate(-6 6)" clip-path="url(#disc)"/>
        <g class="orbit" style="transform-origin:292px 22px"><ellipse cx="292" cy="22" rx="74" ry="14" fill="none" stroke="#5ee1ff" stroke-opacity=".4" stroke-width="1.5" stroke-dasharray="40 10 4 10" transform="rotate(-18 292 22)"/></g>`;
    },
  },
  // Borderlands 2: an off-white page hit by a big orange and yellow paint burst, inked in black.
  bl2: {
    mark: ['Borderlands', '2'],
    accent: '#ff9a1a',
    comic: true,
    light: true,
    art: () => {
      const blob = (cx, cy, r, n, seed, fill, stroke) => {
        const pts = scatter(n, seed, { x: 0, y: 0, w: 1, h: 1 });
        const d = pts
          .map((p, i) => {
            const a = (i / n) * Math.PI * 2;
            const rr = r * (i % 2 ? 0.55 + p.k * 0.25 : 0.9 + p.k * 0.5);
            return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
          })
          .join(' ');
        return `<path d="${d}Z" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="3" stroke-linejoin="round"` : ''}/>`;
      };
      const flecks = scatter(16, 9, { x: 170, y: 2, w: 150, h: 92 })
        .map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${1 + p.k * 4}" fill="${i % 3 ? '#ff8a00' : INK}"/>`)
        .join('');
      return `<defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f1e4"/><stop offset="1" stop-color="#d9d2c2"/></linearGradient>
          ${halftone('dots', '#b8ae9a', 6, 1.1)}
        </defs>
        <rect width="320" height="96" fill="url(#bg)"/>
        <rect width="320" height="96" fill="url(#dots)" opacity=".6"/>
        <g class="wobble" style="transform-origin:262px 48px">
          ${blob(262, 48, 58, 22, 4, '#ff8a00', INK)}
          ${blob(262, 48, 40, 18, 8, '#ffcf1f')}
        </g>
        <g>${flecks}</g>
        ${brush(0, 92, 150, 84, 3, INK, 'opacity=".25"')}`;
    },
  },
  // Borderlands (GOTY Enhanced): deep crimson with dark brush strokes over a dusty desert.
  bl1: {
    mark: ['Borderlands', 'GOTY Enhanced'],
    accent: '#d8333a',
    comic: true,
    art: () => {
      const dust = scatter(18, 13, { x: 0, y: 30, w: 320, h: 60 })
        .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${0.6 + p.k * 1.4}" fill="#ffb0a0" opacity="${0.25 + p.k * 0.4}"/>`)
        .join('');
      return `<defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d1222a"/><stop offset=".6" stop-color="#a3121a"/><stop offset="1" stop-color="#5e070c"/></linearGradient>
          ${halftone('dots', '#6e060c', 6, 1.5)}
        </defs>
        <rect width="320" height="96" fill="url(#bg)"/>
        <rect width="320" height="96" fill="url(#dots)" opacity=".45"/>
        <circle cx="262" cy="40" r="26" fill="#ff9a6a" opacity=".55" class="breathe"/>
        ${brush(140, 70, 320, 20, 10, '#4a0507', 'opacity=".85"')}
        ${brush(170, 96, 330, 40, 7, '#4a0507', 'opacity=".7"')}
        ${brush(210, 10, 320, -4, 5, '#4a0507', 'opacity=".6"')}
        <path d="M0 80 C60 66, 110 86, 170 74 S270 62, 320 72 V96 H0Z" fill="#5e070c"/>
        <path d="M0 90 C70 80, 140 98, 210 86 S290 82, 320 88 V96 H0Z" fill="#3a0306"/>
        <g class="drift">${dust}</g>`;
    },
  },
};

// The same art can appear twice in the page (dashboard strip and Rewards cards, one of them in a
// hidden tab), so gradient and pattern ids get a per-use prefix.
function uniq(svg, pfx) {
  return svg.replace(/id="([^"]+)"/g, `id="${pfx}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pfx}-$1)`);
}

/** Just the banner artwork for a game (no wordmark), or '' for games without art. */
export function artSVG(id, pfx = 'a', cls = 'rp-art') {
  const a = ART[id];
  return a ? `<svg class="${cls}" viewBox="0 0 320 96" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">${uniq(a.art(), `${pfx}-${id}`)}</svg>` : '';
}

/** Whether a game's art is light (dark text reads better on it). */
export const isLightArt = (id) => !!ART[id]?.light;

/** The banner for one game's card: original art + wordmark. Unknown games get a plain banner. */
export function coverHTML(t) {
  const a = ART[t.id];
  if (!a) {
    return `<header class="rp-cover plain"><div class="rp-mark"><span class="rp-mark-lg">${esc(t.short)}</span><span class="rp-mark-sm">${esc(t.name)}</span></div></header>`;
  }
  return `<header class="rp-cover cv-${t.id} ${a.light ? 'on-light' : ''} ${a.comic ? 'comic' : ''}" style="--accent:${a.accent}" aria-label="${esc(t.name)}">
    ${artSVG(t.id, 'rp')}
    <div class="rp-mark" aria-hidden="true"><span class="rp-mark-sm">${esc(a.mark[0])}</span><span class="rp-mark-lg">${esc(a.mark[1])}</span></div>
  </header>`;
}

/** Accent colour for a game's card (used for the edge glow and the History button). */
export const accentOf = (id, fallback) => ART[id]?.accent || fallback;
