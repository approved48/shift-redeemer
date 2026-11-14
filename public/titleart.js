// Banner art for each game's card on the Rewards page. Everything here is original artwork made
// for SHiFT Redeemer: each game's colours, a wordmark set in a typeface with the right feel, and a
// motif inspired by the mood of its cover. No official logos, cover art or Gearbox assets are used.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Small seeded scatter so star fields and splatters look hand-placed but never change.
function scatter(n, seed, box) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => ({ x: box.x + r() * box.w, y: box.y + r() * box.h, k: r() }));
}

const ART = {
  // Borderlands 4: Kairos. Cold industrial sci-fi, amber warning light, the Timekeeper's clockwork.
  bl4: {
    mark: ['Borderlands', '4'],
    accent: '#ffa01c',
    art: () => {
      const ticks = Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const r1 = i % 6 === 0 ? 34 : 38;
        return `<line x1="${262 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${262 + Math.cos(a) * 44}" y2="${50 + Math.sin(a) * 44}"/>`;
      }).join('');
      return `<defs>
          <linearGradient id="bl4-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14323b"/><stop offset="1" stop-color="#060f13"/></linearGradient>
          <pattern id="bl4-st" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="10" fill="#ffa01c"/></pattern>
          <radialGradient id="bl4-gl" cx=".82" cy=".52" r=".45"><stop offset="0" stop-color="#ffa01c" stop-opacity=".35"/><stop offset="1" stop-color="#ffa01c" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="320" height="96" fill="url(#bl4-bg)"/>
        <rect width="320" height="96" fill="url(#bl4-gl)"/>
        <g fill="none" stroke="#5fd4d6" stroke-opacity=".18">${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 8 + 4}" x2="320" y2="${i * 8 + 4}"/>`).join('')}</g>
        <g class="spin" style="transform-origin:262px 50px" fill="none" stroke="#ffa01c" stroke-width="2">
          <circle cx="262" cy="50" r="44" stroke-opacity=".55"/><circle cx="262" cy="50" r="28" stroke-dasharray="6 5"/>${ticks}
        </g>
        <circle cx="262" cy="50" r="12" fill="#ffa01c" fill-opacity=".9"/><circle cx="262" cy="50" r="5" fill="#060f13"/>
        <path d="M262 50 L262 14" stroke="#fff3d6" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M0 80 L70 80 L58 96 L0 96Z" fill="url(#bl4-st)" opacity=".85"/>`;
    },
  },
  // Tiny Tina's Wonderlands: a tabletop fantasy, royal purple, gold leaf and a big d20.
  ttw: {
    mark: ['Tiny Tina’s', 'Wonderlands'],
    accent: '#f3c94f',
    art: () => {
      const sparks = scatter(9, 7, { x: 150, y: 6, w: 165, h: 84 })
        .map((p) => {
          const s = 2 + p.k * 4;
          return `<path d="M${p.x} ${p.y - s}L${p.x + s * 0.3} ${p.y - s * 0.3}L${p.x + s} ${p.y}L${p.x + s * 0.3} ${p.y + s * 0.3}L${p.x} ${p.y + s}L${p.x - s * 0.3} ${p.y + s * 0.3}L${p.x - s} ${p.y}L${p.x - s * 0.3} ${p.y - s * 0.3}Z"/>`;
        })
        .join('');
      return `<defs>
          <linearGradient id="ttw-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b1f78"/><stop offset=".6" stop-color="#2a0f47"/><stop offset="1" stop-color="#16082a"/></linearGradient>
          <radialGradient id="ttw-gl" cx=".8" cy=".5" r=".5"><stop offset="0" stop-color="#ff6fd8" stop-opacity=".35"/><stop offset="1" stop-color="#ff6fd8" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="320" height="96" fill="url(#ttw-bg)"/>
        <rect width="320" height="96" fill="url(#ttw-gl)"/>
        <g fill="#f3c94f" opacity=".75" class="twinkle">${sparks}</g>
        <g class="bob" style="transform-origin:262px 50px">
          <g transform="rotate(-12 262 50)" fill="none" stroke="#f3c94f" stroke-width="2" stroke-linejoin="round">
            <path d="M262 6 L300 28 L300 72 L262 94 L224 72 L224 28Z" fill="#2a0f47" fill-opacity=".7"/>
            <path d="M262 26 L284 66 L240 66Z" fill="#f3c94f" fill-opacity=".14"/>
            <path d="M262 26 L262 6 M262 26 L224 28 M262 26 L300 28 M284 66 L300 28 M284 66 L300 72 M284 66 L262 94 M240 66 L224 28 M240 66 L224 72 M240 66 L262 94" stroke-opacity=".7"/>
            <text x="262" y="57" text-anchor="middle" fill="#f3c94f" stroke="none" font-family="'Cinzel Decorative', Georgia, serif" font-weight="700" font-size="15">20</text>
          </g>
        </g>`;
    },
  },
  // Borderlands 3: spray-paint chaos. Hot magenta, acid yellow and cyan splatter on black.
  bl3: {
    mark: ['Borderlands', '3'],
    accent: '#ff2e88',
    art: () => {
      const cols = ['#ff2e88', '#ffd400', '#22d3ee'];
      const blobs = scatter(26, 3, { x: 150, y: 0, w: 170, h: 90 })
        .map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${1.5 + p.k * (i % 5 === 0 ? 16 : 5)}" fill="${cols[i % 3]}" opacity="${0.55 + p.k * 0.4}"/>`)
        .join('');
      const drips = scatter(7, 11, { x: 170, y: 20, w: 140, h: 30 })
        .map((p, i) => `<rect x="${p.x}" y="${p.y}" width="${3 + p.k * 3}" height="${20 + p.k * 40}" rx="3" fill="${cols[i % 3]}" opacity=".7"/>`)
        .join('');
      return `<defs>
          <radialGradient id="bl3-gl" cx=".75" cy=".45" r=".55"><stop offset="0" stop-color="#ff2e88" stop-opacity=".28"/><stop offset="1" stop-color="#ff2e88" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="320" height="96" fill="#140a10"/>
        <rect width="320" height="96" fill="url(#bl3-gl)"/>
        <g class="splat">${drips}${blobs}</g>
        <path d="M200 70 C230 40, 260 90, 300 30" fill="none" stroke="#ffd400" stroke-width="6" stroke-linecap="round" opacity=".8"/>`;
    },
  },
  // The Pre-Sequel: low gravity on the moon. Deep space blue, a huge cratered moon, oxygen-cyan.
  tps: {
    mark: ['Borderlands', 'The Pre-Sequel'],
    accent: '#5ee1ff',
    art: () => {
      const stars = scatter(30, 5, { x: 0, y: 0, w: 320, h: 96 })
        .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${0.4 + p.k * 1.1}" opacity="${0.3 + p.k * 0.7}"/>`)
        .join('');
      return `<defs>
          <linearGradient id="tps-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2550"/><stop offset="1" stop-color="#040a1a"/></linearGradient>
          <radialGradient id="tps-moon" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6f1ff"/><stop offset=".55" stop-color="#9fb4d1"/><stop offset="1" stop-color="#4b5d7e"/></radialGradient>
        </defs>
        <rect width="320" height="96" fill="url(#tps-bg)"/>
        <g fill="#cfe8ff" class="twinkle">${stars}</g>
        <g class="bob" style="transform-origin:292px 22px">
          <circle cx="292" cy="22" r="50" fill="url(#tps-moon)"/>
          <g fill="#56688a" opacity=".55"><circle cx="276" cy="8" r="8"/><circle cx="306" cy="30" r="6"/><circle cx="284" cy="44" r="9"/><circle cx="262" cy="26" r="4"/></g>
        </g>
        <ellipse cx="292" cy="22" rx="74" ry="14" fill="none" stroke="#5ee1ff" stroke-opacity=".35" stroke-width="1.5" transform="rotate(-18 292 22)"/>`;
    },
  },
  // Borderlands 2: loud yellow, black comic ink, hatching and splatter.
  bl2: {
    mark: ['Borderlands', '2'],
    accent: '#ffd400',
    dark: true,
    art: () => {
      const ink = scatter(14, 9, { x: 190, y: 4, w: 125, h: 86 })
        .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${1 + p.k * 7}"/>`)
        .join('');
      return `<defs>
          <pattern id="bl2-h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="1.6" height="6" fill="#111"/></pattern>
          <linearGradient id="bl2-f" x1="0" y1="0" x2="1" y2="0"><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
          <mask id="bl2-m"><rect width="320" height="96" fill="url(#bl2-f)"/></mask>
        </defs>
        <rect width="320" height="96" fill="#ffd400"/>
        <rect width="320" height="96" fill="url(#bl2-h)" mask="url(#bl2-m)" opacity=".55"/>
        <g fill="#111" class="splat">${ink}</g>
        <g stroke="#111" stroke-width="3" stroke-linecap="round" opacity=".85">${[0, 1, 2, 3, 4].map((i) => `<line x1="${200 + i * 22}" y1="${92 - i * 3}" x2="${236 + i * 22}" y2="${30 - i * 5}"/>`).join('')}</g>
        <path d="M0 0 H320 V96 H0Z" fill="none" stroke="#111" stroke-width="6"/>`;
    },
  },
  // Borderlands (GOTY Enhanced): sun-bleached Pandoran desert, rust and dust.
  bl1: {
    mark: ['Borderlands', 'GOTY Enhanced'],
    accent: '#ffcf7a',
    art: () => `<defs>
          <linearGradient id="bl1-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0893a"/><stop offset=".7" stop-color="#9a4a1c"/><stop offset="1" stop-color="#4a210c"/></linearGradient>
        </defs>
        <rect width="320" height="96" fill="url(#bl1-bg)"/>
        <circle cx="258" cy="40" r="26" fill="#ffe2a3" opacity=".9" class="bob" style="transform-origin:258px 40px"/>
        <g fill="none" stroke="#ffe2a3" stroke-opacity=".45" stroke-width="1.5" stroke-linecap="round"><path d="M150 22h40M170 30h52M300 18h18M120 40h26"/></g>
        <path d="M0 74 C60 58, 110 80, 170 66 S270 50, 320 64 V96 H0Z" fill="#7a3614"/>
        <path d="M0 86 C70 74, 140 94, 210 80 S290 74, 320 82 V96 H0Z" fill="#3e1a08"/>
        <path d="M282 70 V48 h6 v-8 h14 v10 h6 V70Z" fill="#5a260d"/>`,
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
export const isLightArt = (id) => !!ART[id]?.dark;

/** The banner for one game's card: original art + wordmark. Unknown games get a plain banner. */
export function coverHTML(t) {
  const a = ART[t.id];
  if (!a) {
    return `<header class="rp-cover plain"><div class="rp-mark"><span class="rp-mark-lg">${esc(t.short)}</span><span class="rp-mark-sm">${esc(t.name)}</span></div></header>`;
  }
  return `<header class="rp-cover cv-${t.id} ${a.dark ? 'on-light' : ''}" style="--accent:${a.accent}" aria-label="${esc(t.name)}">
    ${artSVG(t.id, 'rp')}
    <div class="rp-mark" aria-hidden="true"><span class="rp-mark-sm">${esc(a.mark[0])}</span><span class="rp-mark-lg">${esc(a.mark[1])}</span></div>
  </header>`;
}

/** Accent colour for a game's card (used for the edge glow and the History button). */
export const accentOf = (id, fallback) => ART[id]?.accent || fallback;
