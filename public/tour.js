// Walkthrough: a short guided tour of the interface for new users. It spotlights one part of the
// app at a time with a short explanation. "Skip" turns the walkthrough off for good; it only comes
// back if the user turns it on again in Settings → Data & display.

import { pageRect, viewW, viewH } from './zoom.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Each step: which page, which element (first one that's visible), and what to say.
export const STEPS = [
  { tab: 'dashboard', sel: ['#tabs', '#navToggle'], t: 'Your menu', d: 'Every part of the app is up here: the dashboard, your codes, rewards, the games and platforms you target, where codes come from, your account and settings.' },
  { tab: 'dashboard', sel: ['#btnGo'], t: 'Find & redeem', d: 'The main button. It searches every source for new codes, then redeems them for your games and platforms. Press it whenever you like.' },
  { tab: 'dashboard', sel: ['.mini-toggle'], t: 'Auto-launch games', d: 'Sometimes SHiFT wants a game started before it accepts more codes. On: the app starts one for a minute and closes it. Turn it off while you’re playing.', help: 'game launch assist' },
  { tab: 'dashboard', sel: ['#stats'], t: 'Your numbers', d: 'Codes waiting, rewards unlocked, codes that are done or dead, and everything known so far. All of them follow the games and platforms you picked.' },
  { tab: 'dashboard', sel: ['#gameStrip'], t: 'Your games', d: 'Keys and cosmetics for each game. During a run, a green +N shows what it just added. Select a game to see its full report.' },
  { tab: 'codes', sel: ['#codeList .code', '#codeList'], t: 'Codes', d: 'Every code the app knows, with its reward, expiry and where it came from. Paste codes, or import and export lists from the buttons at the top.' },
  { tab: 'rewards', sel: ['#rpTitles', '#rpTotals', '#rpEmpty'], t: 'Rewards', d: 'Everything unlocked for you, game by game, including what’s already on your SHiFT account and what’s still to go.' },
  { tab: 'sources', sel: ['#stepBuiltin'], t: 'Sources', d: 'Where codes come from. They’re all on by default, so you don’t need to change anything here.' },
  { tab: 'settings', sel: ['#setAutopilot'], t: 'Auto-pilot', d: 'Turn this on to find and redeem new codes every few hours without pressing anything. Add “Start with my computer” to make it fully hands-free.', help: 'auto-pilot' },
  { tab: 'dashboard', sel: ['#helpBtn'], t: 'Help is always here', d: 'Press this, or the ? key, for answers, best-practice tips and a guide to every reward. That’s the tour. Have fun, Vault Hunter!' },
];

export function initTour({ goTo, onSkip, onDone, openHelp }) {
  let i = 0;
  let open = false;
  let target = null;
  const spot = document.createElement('div');
  spot.className = 'tour-spot';
  spot.hidden = true;
  const card = document.createElement('div');
  card.className = 'tour-card panel';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'tourTitle');
  card.hidden = true;
  document.body.append(spot, card);

  const find = (sels) => {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null && el.offsetWidth) return el;
    }
    return null;
  };

  function place() {
    if (!open || !target) return;
    const r = pageRect(target);
    const pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const W = viewW();
    const H = viewH();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    // Below the target if it fits, else above, else beside it.
    let top = r.bottom + pad + 12;
    if (top + ch > H - 8) top = r.top - pad - 12 - ch;
    if (top < 8) top = Math.min(H - ch - 8, Math.max(8, r.top));
    const left = Math.min(W - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  }

  function draw() {
    const s = STEPS[i];
    card.innerHTML = `
      <div class="tour-head"><span class="kicker">Walkthrough · ${i + 1} of ${STEPS.length}</span><button type="button" class="link-btn" data-tour="skip">Skip walkthrough</button></div>
      <h3 class="tour-title" id="tourTitle">${esc(s.t)}</h3>
      <p>${esc(s.d)}</p>
      <div class="tour-dots" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</div>
      <div class="tour-foot">
        ${s.help ? `<button type="button" class="btn btn-xs btn-ghost" data-tour="help">? More about this</button>` : '<span></span>'}
        <span class="tour-nav">${i ? '<button type="button" class="btn btn-sm btn-ghost" data-tour="back">Back</button>' : ''}<button type="button" class="btn btn-sm btn-eridian" data-tour="next">${i === STEPS.length - 1 ? 'Finish' : 'Next'}</button></span>
      </div>`;
    card.classList.remove('in');
    void card.offsetWidth;
    card.classList.add('in');
    place();
    card.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  async function show(k, dir = 1) {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    if (location.hash !== `#${s.tab}`) {
      goTo(s.tab);
      await new Promise((r) => setTimeout(r, 380));
    }
    target = find(s.sel);
    if (!target) {
      // Nothing to point at on this step (e.g. hidden on a small screen): keep going the same way.
      const next = i + dir;
      if (next >= 0 && next < STEPS.length) return show(next, dir);
      close();
      return dir > 0 ? onDone?.() : undefined;
    }
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(r));
    spot.hidden = false;
    card.hidden = false;
    draw();
  }

  function close() {
    open = false;
    spot.hidden = true;
    card.hidden = true;
    target = null;
    document.body.classList.remove('touring');
  }

  card.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tour]')?.dataset.tour;
    if (a === 'next') {
      if (i === STEPS.length - 1) {
        close();
        onDone?.();
      } else show(i + 1);
    } else if (a === 'back') show(i - 1, -1);
    else if (a === 'skip') {
      close();
      onSkip?.();
    } else if (a === 'help') openHelp?.(STEPS[i].help);
  });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape' && !document.querySelector('#helpOverlay:not([hidden])')) {
      close();
      onSkip?.();
    } else if (e.key === 'ArrowRight') card.querySelector('[data-tour="next"]')?.click();
    else if (e.key === 'ArrowLeft') card.querySelector('[data-tour="back"]')?.click();
  });
  addEventListener('resize', place);
  addEventListener('uizoom', place);
  addEventListener('scroll', place, true);

  return {
    start() {
      open = true;
      document.body.classList.add('touring');
      show(0);
    },
    isOpen: () => open,
  };
}
