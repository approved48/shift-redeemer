// Rewards guide: what each kind of key and cosmetic is, per game. Written for SHiFT Redeemer in our
// own words, checked against the Borderlands Wiki (borderlands.fandom.com, CC BY-SA), which each
// entry links to for the full details. Also provides the hover tooltips used across the app.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WIKI = 'https://borderlands.fandom.com/wiki/';

export const GAMES = [
  { id: 'bl4', short: 'BL4', name: 'Borderlands 4' },
  { id: 'ttw', short: 'TTW', name: "Tiny Tina's Wonderlands" },
  { id: 'bl3', short: 'BL3', name: 'Borderlands 3' },
  { id: 'tps', short: 'TPS', name: 'Borderlands: The Pre-Sequel' },
  { id: 'bl2', short: 'BL2', name: 'Borderlands 2' },
  { id: 'bl1', short: 'BL1', name: 'Borderlands GOTY Enhanced' },
];

// Same colours as the rewards report.
export const KEYS = {
  golden: {
    id: 'golden',
    name: 'Golden Key',
    plural: 'Golden Keys',
    color: '#b8861f',
    short: 'Opens a Golden Chest once for a round of high-rarity loot, scaled to your level.',
    about:
      'Each Golden Key opens a Golden Chest once. The chest fills with better-than-usual loot, scaled to the level of the character who opens it. Keys are used up when you open the chest and can’t be traded.',
    wiki: `${WIKI}Golden_Key`,
    games: {
      bl4: { where: 'Golden Chests in The Launchpad, Carcadia, Belton’s Bore and The Lockaway.', note: 'Keys stay on the platform you redeemed them for, even if you move your save to another platform.' },
      bl3: { where: 'The Golden Chest aboard Sanctuary III.', note: 'Can roll legendary gear.' },
      tps: { where: 'The Golden Chest in Concordia.', note: 'Gives purple-rarity and E-tech (magenta) gear.' },
      bl2: { where: 'The Golden Chest in Sanctuary.', note: 'Purple-rarity guns, shields, grenade and class mods, E-tech and relics. Never legendary or pearlescent. Keys are shared by every character on your profile.' },
      bl1: { where: 'Golden Chests in Fyrestone and New Haven, added in the Enhanced edition.', note: 'Can roll legendary gear.' },
    },
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond Key',
    plural: 'Diamond Keys',
    color: '#1592b8',
    short: 'Borderlands 3 only. Unlocks the Diamond Armory on Sanctuary III, a vault of top-tier gear.',
    about:
      'A Borderlands 3 key that unlocks the Diamond Armory aboard Sanctuary III: a locked room stocked with high-end gear, including variants you can’t get anywhere else. Each key opens the armory once. Codes that give Diamond Keys usually give Golden Keys too.',
    wiki: `${WIKI}Sanctuary_III`,
    games: {
      bl3: { where: 'The Diamond Armory aboard Sanctuary III.', note: 'Gear inside is scaled to your level. Other games don’t use Diamond Keys.' },
    },
  },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton Key',
    plural: 'Skeleton Keys',
    color: '#9b6be0',
    short: "Tiny Tina's Wonderlands' Golden Key. Opens the loot chest in Brighthoof once.",
    about:
      "Tiny Tina's Wonderlands calls its Golden Key a Skeleton Key. Each one opens the special chest in Brighthoof once for a round of high-rarity loot scaled to your level.",
    wiki: `${WIKI}Golden_Chest`,
    games: {
      ttw: { where: 'The chest in Brighthoof, the Wonderlands hub city.', note: 'Only Wonderlands uses Skeleton Keys.' },
    },
  },
};
const KEY_ORDER = ['golden', 'diamond', 'skeleton'];

// Cosmetic and item types (ids match ITEM_KINDS in lib/rewards.js).
export const KINDS = {
  skin: { name: 'Character skins', ic: '🧥', about: 'Change your Vault Hunter’s colours and outfit pattern. Pick them at a Quick Change station or in the customisation menu. Purely cosmetic.', games: 'Every game with SHiFT', wiki: `${WIKI}Quick_Change` },
  head: { name: 'Heads', ic: '🎭', about: 'Swap your character’s head and face for a new look. Purely cosmetic.', games: 'Every game with SHiFT', wiki: `${WIKI}Quick_Change` },
  weapon: { name: 'Weapon skins', ic: '🔫', about: 'Paint jobs for your guns. Apply them to any weapon from the inventory; they don’t change stats.', games: 'Borderlands 3 and Borderlands 4', wiki: `${WIKI}Weapon_Skins` },
  trinket: { name: 'Weapon trinkets', ic: '🧿', about: 'Small charms that hang off the side of a gun. Cosmetic only.', games: 'Borderlands 3', wiki: `${WIKI}Trinket` },
  echo: { name: 'ECHO themes', ic: '📟', about: 'Change the look of your ECHO device, the in-game menu and map screen.', games: 'Borderlands 3', wiki: `${WIKI}ECHO_Device` },
  drone: { name: 'ECHO-4 drone cosmetics', ic: '🛸', about: 'Skins and attachments for ECHO-4, the robot drone that follows you around.', games: 'Borderlands 4', wiki: `${WIKI}Borderlands_4` },
  emote: { name: 'Emotes', ic: '👋', about: 'Gestures and animations your character can do on command.', games: 'Borderlands 3 and later', wiki: `${WIKI}Quick_Change` },
  decor: { name: 'Room decorations', ic: '🖼', about: 'Items to hang in your own quarters aboard Sanctuary III.', games: 'Borderlands 3', wiki: `${WIKI}Room_Decorations` },
  vehicle: { name: 'Vehicle skins', ic: '🚙', about: 'New paint for your vehicles. Cosmetic only.', games: 'Games with vehicles', wiki: `${WIKI}Vehicle` },
  pack: { name: 'Cosmetic packs', ic: '🎁', about: 'Several cosmetics in one code, often for an event like Halloween or an anniversary. Check your in-game customisation menus for each piece.', games: 'Any', wiki: `${WIKI}SHiFT` },
  gear: { name: 'Weapons & gear', ic: '⚔️', about: 'An actual usable item, such as a gun or shield, delivered to your in-game mail.', games: 'Any', wiki: `${WIKI}SHiFT` },
  boost: { name: 'Boosts', ic: '⚡', about: 'A temporary bonus, for example to experience or loot.', games: 'Any', wiki: `${WIKI}SHiFT` },
  other: { name: 'Other rewards', ic: '✦', about: 'A reward whose description didn’t say what type it is. Check your in-game mail and customisation menus.', games: 'Any', wiki: `${WIKI}SHiFT` },
};
const KIND_ORDER = ['skin', 'head', 'weapon', 'trinket', 'echo', 'drone', 'emote', 'decor', 'vehicle', 'pack', 'gear', 'boost', 'other'];

export const keyTypesFor = (gameId) => KEY_ORDER.filter((k) => !gameId || KEYS[k].games[gameId]);

/** Short plain-text tooltip for a key type, optionally specific to one game. */
export function keyTip(keyId, gameId) {
  const k = KEYS[keyId];
  if (!k) return '';
  const g = gameId && k.games[gameId];
  return g ? `${k.name}: ${g.where} ${g.note}` : `${k.name}: ${k.short}`;
}

export function kindTip(kindId) {
  const k = KINDS[kindId] || KINDS.other;
  return `${k.name}: ${k.about}`;
}

// ------------------------------------------------------------------ tooltips

/**
 * Hover and keyboard-focus tooltips for any element with data-tip="text" (plain text), or
 * data-tip-key="golden" (+ optional data-tip-game="bl3") / data-tip-kind="head" for glossary tips.
 */
export function initTips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'srTip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let target = null;
  let timer;

  const content = (el) => {
    if (el.dataset.tipKey) {
      const k = KEYS[el.dataset.tipKey];
      if (!k) return '';
      const g = el.dataset.tipGame && k.games[el.dataset.tipGame];
      return `<b><i class="sw" style="--c:${k.color}"></i>${esc(k.name)}</b><span>${esc(g ? `${g.where} ${g.note}` : k.short)}</span><em>More in Help → Rewards guide</em>`;
    }
    if (el.dataset.tipKind) {
      const k = KINDS[el.dataset.tipKind] || KINDS.other;
      return `<b>${k.ic} ${esc(k.name)}</b><span>${esc(k.about)}</span><em>Found in: ${esc(k.games)}</em>`;
    }
    return esc(el.dataset.tip);
  };
  const place = () => {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    let top = r.top - h - 8;
    tip.classList.toggle('below', top < 8);
    if (top < 8) top = r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const show = (el) => {
    const html = content(el);
    if (!html) return;
    target = el;
    tip.innerHTML = html;
    tip.hidden = false;
    tip.classList.remove('in');
    place();
    requestAnimationFrame(() => tip.classList.add('in'));
    el.setAttribute('aria-describedby', 'srTip');
  };
  const hide = () => {
    clearTimeout(timer);
    if (target) target.removeAttribute('aria-describedby');
    target = null;
    tip.hidden = true;
  };
  const sel = '[data-tip], [data-tip-key], [data-tip-kind]';
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.(sel);
    if (el === target) return;
    clearTimeout(timer);
    if (!el) return hide();
    timer = setTimeout(() => show(el), target ? 0 : 220);
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.(sel);
    if (el) show(el);
    else hide();
  });
  document.addEventListener('focusout', hide);
  addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
}

// ------------------------------------------------------------------ Help → Rewards guide

/**
 * Interactive explainer. counts (optional): { keys: { gameId: { golden, … } }, kinds: { kindId: n } }
 * from the rewards report, so each entry can say what you've already unlocked.
 */
export function renderGuide(root, { game = '', counts = null, onGame } = {}) {
  const pick = GAMES.find((g) => g.id === game);
  const keyIds = keyTypesFor(game);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const have = (keyId) => {
    if (!counts) return '';
    const n = game ? counts.keys?.[game]?.[keyId] || 0 : Object.values(counts.keys || {}).reduce((a, t) => a + (t[keyId] || 0), 0);
    return `<span class="gd-have ${n ? 'yes' : ''}">${n ? `You’ve unlocked <b>${fmt(n)}</b>${game ? '' : ' in total'}` : 'None unlocked yet'}</span>`;
  };
  const keyCard = (id) => {
    const k = KEYS[id];
    const rows = (game ? [[game, k.games[game]]] : Object.entries(k.games))
      .map(([gid, g]) => `<li><span class="gd-game">${esc(GAMES.find((x) => x.id === gid)?.short || gid)}</span><span>${esc(g.where)} <small>${esc(g.note)}</small></span></li>`)
      .join('');
    return `<article class="gd-card" style="--c:${k.color}">
      <header><i class="gd-key" aria-hidden="true"></i><div><h5>${esc(k.name)}</h5>${have(id)}</div></header>
      <p>${esc(k.about)}</p>
      <ul class="gd-where">${rows}</ul>
      <a class="gd-more" href="${k.wiki}" target="_blank" rel="noopener">Learn more on the Borderlands Wiki ↗</a>
    </article>`;
  };
  const kindCount = (id) => (counts?.kinds?.[id] ? `<span class="gd-have yes"><b>${fmt(counts.kinds[id])}</b> redeemed</span>` : '');
  root.innerHTML = `
    <p class="lead">What SHiFT rewards actually do in each game. Pick a game to see only what applies to it.</p>
    <div class="seg gd-games" role="tablist" aria-label="Game">
      <button role="tab" data-gd-game="" aria-selected="${!game}">All games</button>
      ${GAMES.map((g) => `<button role="tab" data-gd-game="${g.id}" aria-selected="${game === g.id}" title="${esc(g.name)}">${g.short}</button>`).join('')}
    </div>
    <h4 class="help-h">${pick ? `Keys in ${esc(pick.name)}` : 'Keys'}</h4>
    <div class="gd-keys">${keyIds.map(keyCard).join('')}</div>
    ${pick && !keyIds.length ? '<p class="hint">This game doesn’t use SHiFT keys.</p>' : ''}
    <h4 class="help-h">How keys reach you</h4>
    <ul class="help-steps">
      <li>SHiFT Redeemer redeems each code for every game and platform you picked. Each platform gets its own copy.</li>
      <li>The keys appear in the game’s in-game mail the next time you play online on that platform, signed in to the same SHiFT account. Claim them from the mail, then head to the chest.</li>
      <li>Rewards don’t move between platforms. If you play on two, the app redeems the code on both.</li>
    </ul>
    <h4 class="help-h">Cosmetics</h4>
    <p class="hint">Codes that don’t give keys usually give cosmetics. They only change how things look. Your <a href="#rewards" data-gd-close>Rewards report</a> lists every cosmetic the app has unlocked, grouped by these types.</p>
    <div class="gd-kinds">${KIND_ORDER.filter((id) => id !== 'other')
      .map((id) => {
        const k = KINDS[id];
        return `<div class="gd-kind"><span class="tile-ic" aria-hidden="true">${k.ic}</span><div><b>${esc(k.name)}</b>${kindCount(id)}<span>${esc(k.about)}</span><small>${esc(k.games)} · <a href="${k.wiki}" target="_blank" rel="noopener">Wiki ↗</a></small></div></div>`;
      })
      .join('')}</div>
    <p class="gd-credit">Explanations written for SHiFT Redeemer, based on the <a href="https://borderlands.fandom.com" target="_blank" rel="noopener">Borderlands Wiki</a> (Fandom, CC BY-SA). Game details can change with patches; the wiki has the latest.</p>`;
  root.querySelectorAll('[data-gd-game]').forEach((b) => b.addEventListener('click', () => onGame?.(b.dataset.gdGame)));
}
