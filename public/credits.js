// "Fair play" note and credits. Shown in first-time setup and in Settings → About & credits.
// Only things this app actually uses (or used while it was being made) are listed.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const CREDITS = [
  {
    group: 'Code and ideas',
    items: [
      { name: 'Fabbi/autoshift', url: 'https://github.com/Fabbi/autoshift', what: 'How the app signs in to SHiFT and redeems codes is based on this project.' },
      { name: 'ugoogalizer/autoshift-codes', url: 'https://github.com/ugoogalizer/autoshift-codes', what: 'The community code feed, our main list of codes.' },
    ],
  },
  {
    group: 'Where codes come from',
    items: [
      { name: 'MentalMars', url: 'https://mentalmars.com', what: 'Code tables for every game (they also feed the community list).' },
      { name: 'Steam', url: 'https://store.steampowered.com', what: 'Official game news and community guides.' },
      { name: 'Reddit', url: 'https://www.reddit.com/r/Borderlands/', what: 'Code posts in the Borderlands subreddits.' },
      { name: 'OzBargain', url: 'https://www.ozbargain.com.au/tag/shift-code', what: 'Codes shared by the OzBargain community.' },
      { name: 'Eurogamer, PCGamesN, Game8, esports.net, Fossbytes, GIGA', what: 'Code guides from games websites.' },
      { name: 'Lockercodes, Supercheats, Mobalytics, Icy Veins, GameStar', what: 'Extra code lists, only used if you turn them on.' },
    ],
  },
  {
    group: 'Game info',
    items: [{ name: 'Borderlands Wiki (Fandom)', url: 'https://borderlands.fandom.com', what: 'Facts behind the rewards guide and tips (CC BY-SA).' }],
  },
  {
    group: 'Built with',
    items: [
      { name: 'Node.js', url: 'https://nodejs.org', what: 'Runs the app.' },
      { name: 'esbuild, postject, rcedit', what: 'Package it into one file.' },
      { name: 'Inno Setup', url: 'https://jrsoftware.org/isinfo.php', what: 'The Windows installer.' },
      { name: 'Google Fonts', url: 'https://fonts.google.com', what: 'Saira Stencil One, Barlow, Share Tech Mono and the game-banner fonts (SIL Open Font License).' },
    ],
  },
];

/** The fair-play message, written to be easy to read. */
export function fairPlayHTML() {
  return `<div class="fairplay">
    <p class="fp-lead"><b>Made by fans, for fans.</b> SHiFT Redeemer is free. It is <b>not</b> made by, linked to or approved by Gearbox Software, 2K or Take-Two.</p>
    <p>We love Borderlands. This app just saves you typing in codes by hand.</p>
    <ul class="fp-rules">
      <li><span aria-hidden="true">✔</span> Only use it on your own SHiFT account.</li>
      <li><span aria-hidden="true">✔</span> Don't sell codes or use the app to spam SHiFT.</li>
      <li><span aria-hidden="true">✔</span> Keep the wait between checks, so SHiFT's servers stay happy.</li>
      <li><span aria-hidden="true">♥</span> Support Gearbox: buy the games and DLC and play them. That's how we get more Borderlands.</li>
    </ul>
  </div>`;
}

/** Compact credits list (fits in a <details> or a settings panel). */
export function creditsHTML() {
  return `<div class="credits">${CREDITS.map(
    (g) => `<div class="cr-group"><h4 class="eyebrow">${esc(g.group)}</h4><ul>${g.items
      .map((i) => `<li>${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a>` : `<b>${esc(i.name)}</b>`} <span>${esc(i.what)}</span></li>`)
      .join('')}</ul></div>`,
  ).join('')}<p class="hint cr-thanks">Thank you to everyone who finds and shares codes. Borderlands, SHiFT and their logos belong to their owners.</p></div>`;
}
