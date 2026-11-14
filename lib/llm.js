// Builds a ready-to-paste instruction sheet for an AI assistant with web search (ChatGPT, Claude,
// Gemini, Grok, …) that asks it to find current SHiFT codes and answer with a file SHiFT Redeemer
// can import. This keeps the app useful even if every built-in source disappears.

import { TITLES, PLATFORMS } from './catalog.js';
import { LIST_FORMAT } from './codelists.js';

const WHERE = [
  'Official channels first: the Borderlands and Gearbox accounts on X/Twitter, Bluesky, Instagram, Facebook and YouTube, borderlands.com news, and each game\'s Steam news page.',
  'SHiFT code trackers and tables: MentalMars (mentalmars.com), the community feed at github.com/ugoogalizer/autoshift-codes, and other trackers that list a reward and expiry date for each code.',
  'Games press guides: Eurogamer, PCGamesN, Game8, GamesRadar, Polygon, IGN, Rock Paper Shotgun and similar.',
  'Community posts: r/Borderlands and the per-game subreddits, Steam Community guides, and deal sites such as OzBargain.',
];

/**
 * opts: { titles: [titleId], platforms: [platformId], known: [code], version, today }
 * Returns { filename, content } (Markdown).
 */
export function buildLlmInstructions({ titles = [], platforms = [], known = [], version = '', today = new Date() } = {}) {
  const ts = (titles.length ? TITLES.filter((t) => titles.includes(t.id)) : TITLES).map((t) => t.name);
  const ps = (platforms.length ? PLATFORMS.filter((p) => platforms.includes(p.id)) : PLATFORMS).map((p) => p.name);
  const date = today.toISOString().slice(0, 10);
  const allNames = TITLES.map((t) => `"${t.name}"`).join(', ');
  const sample = {
    format: LIST_FORMAT,
    version: 1,
    app: 'AI code search',
    exported: `${date}T00:00:00Z`,
    codes: [
      { code: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX', reward: '5 Golden Keys', games: [ts[0] || TITLES[0].name], platforms: [], expires: 'YYYY-MM-DD', source: 'https://example.com/page-where-you-saw-it' },
    ],
  };

  const lines = [
    '# Find current Borderlands SHiFT codes',
    '',
    `_Instructions from SHiFT Redeemer${version ? ` ${version}` : ''}, made ${date}. Paste everything below into an AI assistant that can search the web (for example ChatGPT, Claude, Gemini or Grok), or attach this file and ask it to follow it._`,
    '',
    '---',
    '',
    'You are helping me collect **SHiFT codes** for Borderlands games. SHiFT codes are redeemed at shift.gearboxsoftware.com and unlock in-game rewards such as Golden Keys, Diamond Keys, Skeleton Keys and cosmetics.',
    '',
    '**Use web search now.** Do not answer from memory: codes change every week and old codes expire.',
    '',
    '## What I want',
    '',
    `- **Games:** ${ts.join(', ')}.`,
    `- **Platforms I play on:** ${ps.join(', ')}. Most codes work on every platform; include those too.`,
    `- **Today is ${date}.** Include codes that are still active, and codes with no published expiry date. Leave out codes whose expiry date has passed.`,
    '- Aim for every working code you can find, newest first. 10 to 100 codes is normal.',
    '',
    '## Where to look',
    '',
    ...WHERE.map((w) => `- ${w}`),
    '- Check at least 4 different websites, and prefer pages updated in the last month.',
    '',
    '## Rules',
    '',
    '1. A SHiFT code is **25 letters and numbers in five groups of five**, separated by hyphens, like `ABCDE-12345-FGHIJ-67890-KLMNO`.',
    '2. **Copy every code exactly as written on the page.** Never invent, guess, "fix" or complete a code. If any character is unclear, leave that code out.',
    '3. Every code must come from a page you actually opened. Put that page\'s address in `source`.',
    '4. Do not include codes that a source says are expired, and do not include anything that is not a SHiFT code (for example Vault Insider, VIP or console store codes).',
    '5. If a code is listed for several games, list every game it works in.',
    '6. If you cannot browse the web, say so and stop. Do not make up a list.',
    '',
  ];

  if (known.length) {
    lines.push(
      '## Codes I already have (skip these)',
      '',
      'Leave these out of your answer; I already have them.',
      '',
      '```',
      ...known,
      '```',
      '',
    );
  }

  lines.push(
    '## How to answer',
    '',
    'Reply with **one JSON code block** in exactly this format, and nothing inside the block except the JSON:',
    '',
    '```json',
    JSON.stringify(sample, null, 2),
    '```',
    '',
    `- \`games\`: use these exact names: ${allNames}.`,
    '- `platforms`: leave empty (`[]`) unless the source says the code only works on one platform. Then use "Steam", "Epic Games", "PlayStation", "Xbox" or "Nintendo Switch".',
    '- `expires`: the date as YYYY-MM-DD, or an empty string if no expiry is published.',
    '- `reward`: what the source says the code gives, such as "3 Golden Keys" or "Vault Hunter skin: Hype Squad".',
    '',
    'After the code block, add one short line saying how many codes you found and which websites you used. Then tell me: "Save the code block as **shift-codes.json**, or copy it, then in SHiFT Redeemer go to **Codes → Import list** and drop in the file or paste the text."',
    '',
    '---',
    '',
    '_For me (the person using SHiFT Redeemer): copy the AI\'s answer, open SHiFT Redeemer, go to **Codes → Import list**, and paste it. You can paste the whole answer; SHiFT Redeemer finds the codes in it. You\'ll see how many are new before anything is added, and SHiFT checks every code before redeeming, so a wrong or expired code does no harm._',
    '',
  );

  return { filename: `shift-code-search-instructions-${date}.md`, mime: 'text/markdown', content: lines.join('\n') };
}
