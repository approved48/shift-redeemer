// In-app Help: search, rotating quick answers, topic tiles, questions, troubleshooting,
// support, and pinned answers. Content is specific to SHiFT Redeemer.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

import { renderGuide } from './glossary.js';

// ------------------------------------------------------------------ content

// go: { tab, el, label } adds a "Show me" button that jumps to the setting;
// go: { guide: gameId } opens Help → Rewards guide (for that game, or all games with '').

// ---- Best practice: how to get the most out of SHiFT Redeemer. Shown as cards on the Best practice
// tab, and searchable like any other question.
export const TIPS = [
  { ic: '🔗', t: 'Link every platform before your first run', d: 'SHiFT only delivers rewards to platforms linked to your SHiFT account. Link each one you play on (Steam, Epic, PlayStation, Xbox, Switch) on the SHiFT website first, or those rewards are skipped.', go: { tab: 'account', el: 'stepLinks', label: 'Link platforms' } },
  { ic: '🔑', t: 'Turn on “Keep me signed in”', d: 'SHiFT sessions expire. With this on, the app signs itself back in, so auto-pilot never stalls. Your password goes into Windows Credential Manager or the macOS Keychain.', go: { tab: 'account', el: 'stepConnect', label: 'Show me' } },
  { ic: '🎮', t: 'Leave every game selected', d: 'Many codes work in several games at once. Redeeming for a game you don’t play costs nothing, and the reward waits on your account if you start playing it later.', go: { tab: 'targets', el: 'stepTitles', label: 'Games & platforms' } },
  { ic: '🐢', t: 'Let the first run finish, and keep the default pace', d: 'The first run checks hundreds of codes, a few seconds each, because SHiFT limits how fast you can ask. Lowering the delay mostly gets you paused. If SHiFT says “too many requests”, the app waits and carries on by itself.', go: { tab: 'settings', el: 'setPace', label: 'Pace settings' } },
  { ic: '🕹️', t: 'Auto-launch on when you’re away, off while you play', d: 'SHiFT sometimes wants a game launched before it accepts more codes. Let the app handle it when you’re not at the computer. Switch Auto-launch games off on the dashboard while you’re playing, so it never starts a game on you.', go: { tab: 'dashboard', el: 'cmdBar', label: 'Show the switch' } },
  { ic: '📬', t: 'Claim your rewards in the game', d: 'Keys and cosmetics land in each game’s in-game mail the next time you play online on that platform. Claim them there. Rewards don’t move between platforms.', go: { guide: '', label: 'Rewards guide' } },
  { ic: '⏱️', t: 'Use auto-pilot and “Start with my computer”', d: 'New codes come out most weeks and some expire within days. Auto-pilot checks every few hours in the background, so you never miss one.', go: { tab: 'settings', el: 'setAutopilot', label: 'Auto-pilot settings' } },
  { ic: '💻', t: 'Run it on one computer per SHiFT account', d: 'Two copies redeeming for the same account double the requests and trip SHiFT’s limits. Pick one computer for auto-pilot.' },
  { ic: '⬆️', t: 'Keep updates on', d: 'Code websites and SHiFT change now and then, and updates keep the app working with them. Turn on Install updates automatically and you never have to think about it.', go: { tab: 'settings', el: 'setUpdates', label: 'Updates' } },
  { ic: '📊', t: 'Check “to go” on the Rewards page', d: 'Each game shows what’s on your account and what’s still to go. If a game’s “to go” number never shrinks, the usual cause is a platform that isn’t linked.', go: { tab: 'rewards', el: 'rpTitles', label: 'Rewards' } },
  { ic: '🤖', t: 'Have a backup when sources go quiet', d: 'Import a friend’s list, or ask an AI to search for you. SHiFT checks every code before anything is redeemed, so a wrong one does no harm.', go: { tab: 'sources', el: 'stepAi', label: 'Ask an AI' } },
  { ic: '🔒', t: 'Never share your password or browser session', d: 'Nobody needs them to share codes with you. Code list exports never include your account, sign-in or history.' },
];

// ---- Keys & cosmetics (explanations based on the Borderlands Wiki, written for this app)
const REWARDS_FAQ = [
  { cat: 'Keys & cosmetics', q: 'What does a Golden Key do?', a: [
    'It opens a <b>Golden Chest</b> once for a round of better-than-usual loot, scaled to the level of the character who opens it. Keys are used up and can\'t be traded.',
    '<ul><li><b>Borderlands 4</b>: Golden Chests in The Launchpad, Carcadia, Belton\'s Bore and The Lockaway.</li><li><b>Borderlands 3</b>: aboard Sanctuary III. Can roll legendary gear.</li><li><b>The Pre-Sequel</b>: in Concordia. Purple and E-tech gear.</li><li><b>Borderlands 2</b>: in Sanctuary. Purple gear, E-tech and relics, never legendary. Shared by all your characters.</li><li><b>Borderlands GOTY Enhanced</b>: in Fyrestone and New Haven. Can roll legendary gear.</li></ul>',
    'More detail on the <a href="https://borderlands.fandom.com/wiki/Golden_Key" target="_blank" rel="noopener">Borderlands Wiki</a>.'], go: { guide: '', label: 'Open the rewards guide' } },
  { cat: 'Keys & cosmetics', q: 'What does a Diamond Key do?', a: [
    'Diamond Keys are <b>Borderlands 3 only</b>. Each one unlocks the <b>Diamond Armory</b> aboard Sanctuary III once: a locked room of high-end gear, scaled to your level, including variants you can\'t get anywhere else.',
    'Codes with Diamond Keys usually include Golden Keys too. In the rewards report, the Diamond Keys are only counted for Borderlands 3.'], go: { guide: 'bl3', label: 'Open the rewards guide' } },
  { cat: 'Keys & cosmetics', q: 'What does a Skeleton Key do?', a: [
    'It\'s <b>Tiny Tina\'s Wonderlands</b>\' version of the Golden Key. Each one opens the special loot chest in Brighthoof once, for high-rarity loot scaled to your level. Only Wonderlands uses Skeleton Keys.'], go: { guide: 'ttw', label: 'Open the rewards guide' } },
  { cat: 'Keys & cosmetics', q: 'Where do my keys and rewards show up in the game?', a: [
    'In the game\'s in-game mail, the next time you play online on that platform, signed in to the same SHiFT account. Claim them from the mail first.',
    'Each platform gets its own copy and rewards don\'t move between platforms. If you play on two, SHiFT Redeemer redeems the code on both.'] },
  { cat: 'Keys & cosmetics', q: 'What are cosmetics, and have I got any?', a: [
    'Cosmetics change how things look, not how they play: character skins, heads, weapon skins and trinkets, ECHO themes, ECHO-4 drone skins, emotes, room decorations and vehicle skins. Many codes give one instead of keys.',
    'The <b>Rewards</b> page lists every cosmetic the app has unlocked under <b>Cosmetics collected</b>, by type and game. Hover a type for a quick explanation.'], go: { tab: 'rewards', el: 'rpCosmeticsCard', label: 'Show my cosmetics' } },
  { cat: 'Keys & cosmetics', q: 'Do keys and cosmetics expire once I have them?', a: ['No. Codes expire, but once SHiFT has given you the reward it stays in your mail until you claim it. Golden-type keys are only used up when you open a chest.'] },
];

const FAQ = [
  // ---- Getting started
  { cat: 'Getting started', q: 'What does SHiFT Redeemer do?', a: [
    'It looks for SHiFT codes in several places online, checks each one with SHiFT, and redeems it on your account for the games and platforms you choose.',
    'It remembers every result, so a code is never redeemed twice for the same game and platform.'] },
  { cat: 'Getting started', q: 'Do I need a SHiFT account?', a: [
    'Yes. Rewards are delivered to your SHiFT account. If you don\'t have one, <a href="https://shift.gearboxsoftware.com/home" target="_blank" rel="noopener">create one free on the SHiFT website</a>, then link your gaming platforms there.'], go: { tab: 'account', el: 'stepConnect', label: 'Open Account' } },
  { cat: 'Getting started', q: 'How do I sign in?', a: [
    'Open <b>Account</b> and enter the email and password you use on the SHiFT website.',
    'Tick <b>Keep me signed in</b> if you want auto-pilot to sign back in by itself when SHiFT\'s session expires.'], go: { tab: 'account', el: 'stepConnect', label: 'Show me' } },
  { cat: 'Getting started', q: 'What is the browser session option?', a: [
    'If SHiFT asks for extra verification when you sign in, you can borrow the session from a browser where you\'re already signed in:',
    '<ol><li>Open the SHiFT rewards page in Chrome or Edge while signed in.</li><li>Press <kbd>F12</kbd>, then go to <b>Application</b> → <b>Cookies</b>.</li><li>Copy the value of the cookie called <code>si</code> and paste it into <b>Account → Browser session</b>.</li></ol>'], go: { tab: 'account', el: 'stepConnect', label: 'Show me' } },
  { cat: 'Getting started', q: 'How do I run setup again?', a: ['Open <b>Settings</b> and select <b>Run setup again</b>. Nothing is lost; it just walks you through the main choices again.'], go: { action: 'setup', label: 'Run setup now' } },
  { cat: 'Getting started', q: 'Which games are supported?', a: [
    'Borderlands 4, Tiny Tina\'s Wonderlands, Borderlands 3, The Pre-Sequel, Borderlands 2 and Borderlands: Game of the Year Edition.',
    'If SHiFT reports a game the app doesn\'t know yet, it\'s added to the list automatically.'] },

  // ---- Redeeming
  { cat: 'Redeeming', q: 'How do I redeem codes?', a: [
    '<ul><li><b>Find &amp; redeem</b> searches every source for new codes, then redeems them.</li><li><b>Find codes</b> only searches.</li><li><b>Redeem queue</b> redeems codes already found.</li><li>On the <b>Codes</b> page, the ⚡ button redeems a single code.</li></ul>'], go: { tab: 'dashboard', el: 'cmdBar', label: 'Show me' } },
  { cat: 'Redeeming', q: 'How long does a run take?', a: [
    'Each code takes a few seconds, because SHiFT limits how fast you can ask. The first run checks a lot of codes, so it can take a while. Later runs only check new codes.',
    'You can press <b>Stop</b> at any time. Nothing is lost.'] },
  { cat: 'Redeeming', q: 'What do the code statuses mean?', a: [
    '<ul><li><b>Unchecked</b>: found, not yet checked with SHiFT.</li><li><b>Queued</b>: valid, waiting to be redeemed.</li><li><b>Partly done</b>: redeemed for some of your games or platforms.</li><li><b>Redeemed</b>: done for everything you target.</li><li><b>Expired</b> / <b>Invalid</b>: SHiFT rejected it.</li><li><b>Likely expired</b>: its published expiry date has passed.</li><li><b>Not targeted</b>: only for games or platforms you didn\'t pick.</li><li><b>Retry</b>: a temporary problem; it\'s tried again next run.</li></ul>'] },
  { cat: 'Redeeming', q: 'What do the results of a run mean?', a: [
    '<ul><li><b>Redeemed</b>: new rewards unlocked.</li><li><b>Already had</b>: you\'d redeemed it before, here or on the website.</li><li><b>Expired / invalid</b>: codes SHiFT rejected.</li><li><b>Errors</b>: temporary problems; those codes are retried later.</li><li><b>Game launches</b>: how many times a game was started to unlock redemptions.</li></ul>'] },
  { cat: 'Redeeming', q: 'Why does a code say "already had"?', a: ['SHiFT says that reward is already on your account, usually because you redeemed it yourself on the website or in a game. Nothing more to do.'] },
  { cat: 'Redeeming', q: 'Why is a code "Not targeted"?', a: ['SHiFT says the code only works for games or platforms you haven\'t picked. Change your choices on <b>Games &amp; Platforms</b> and it will be redeemed on the next run.'], go: { tab: 'targets', el: 'stepTitles', label: 'Open Games & Platforms' } },
  { cat: 'Redeeming', q: 'Why are some codes "Likely expired"?', a: ['The site that listed the code says its expiry date has passed, so the app skips it to save time. To try them anyway, turn off <b>Skip expired codes</b>.'], go: { tab: 'targets', el: 'stepFiltering', label: 'Show me' } },
  { cat: 'Redeeming', q: 'Can I add a code I found myself?', a: ['Yes. On <b>Codes</b>, select <b>+ Paste codes</b> and paste anything that contains codes, such as a tweet, a message or a whole guide. The codes are picked out automatically.'], go: { tab: 'codes', el: 'btnAddCodes', label: 'Show me', action: 'paste' } },
  { cat: 'Redeeming', q: 'Can I check a code again?', a: ['On <b>Codes</b>, the ↻ button next to a code forgets its results, so it\'s checked again on the next run.'] },

  // ---- Sharing code lists
  { cat: 'Sharing code lists', q: 'How do I import a list of codes from a friend?', a: [
    'On <b>Codes</b>, select <b>Import list</b>, then drop the file onto the box (or click it to choose the file). You can also paste the list as text.',
    'You\'ll see how many codes were found and how many are new before anything is added. Leave <b>Redeem new codes straight away</b> on to redeem them in one go.'], go: { tab: 'codes', el: 'btnImportOpen', label: 'Show me', action: 'import' } },
  { cat: 'Sharing code lists', q: 'Which files can I import?', a: [
    '<ul><li><b>Text</b>: any text with codes in it, one per line or mixed with other words.</li><li><b>CSV</b> (from Excel or Google Sheets) with a <b>code</b> column. Reward, game, platform and expiry columns are picked up too.</li><li><b>SHiFT Redeemer list files</b> exported by a friend.</li><li>The community code feed\'s JSON format.</li></ul>',
    'Tip: you can drag a file anywhere onto the Codes page to start an import.'] },
  { cat: 'Sharing code lists', q: 'How do I share or back up my codes?', a: [
    'On <b>Codes</b>, select <b>Export list</b>. Choose which codes (still working, in your queue, or everything) and a format, then <b>Download</b> or <b>Copy</b>.',
    '<ul><li><b>Text</b>: one code per line. The easiest to paste into a chat.</li><li><b>CSV</b>: opens in a spreadsheet, with rewards and expiry dates.</li><li><b>List file</b>: best for another SHiFT Redeemer user. Everything is kept, including which codes are dead.</li></ul>'], go: { tab: 'codes', el: 'btnExportOpen', label: 'Show me', action: 'export' } },
  { cat: 'Sharing code lists', q: 'Does an export include my account or which rewards I\'ve had?', a: ['No. Exports only contain the codes and public facts about them: the reward, games, expiry date and whether the code still works. Your email, sign-in and redemption history are never included.'] },

  // ---- Game launch assist
  { cat: 'Game launch assist', q: 'Why is redeeming paused and asking for a game?', a: [
    'After a number of redemptions, SHiFT stops accepting codes until you start a SHiFT-enabled game. This is SHiFT\'s rule, not the app\'s.',
    'Game launch assist can start a game for you, wait for SHiFT to notice it, close it again and carry on. Otherwise the dashboard tells you what to do and offers a <b>Resume</b> button.'], go: { tab: 'settings', el: 'setAssist', label: 'Game launch settings' } },
  { cat: 'Game launch assist', q: 'What does game launch assist do?', a: [
    '<ol><li>Finds a Borderlands game installed through Steam.</li><li>Starts it.</li><li>Waits for SHiFT to notice it. After about 30 seconds it quietly retries one of the paused codes every 15 seconds.</li><li>Closes it as soon as SHiFT accepts codes again, usually within a minute.</li><li>Carries on redeeming.</li></ol>',
    'Choose <b>Automatically</b>, <b>Ask me</b> (one click on the dashboard) or <b>Off</b> in Settings.'], go: { tab: 'settings', el: 'setAssist', label: 'Show me' } },
  { cat: 'Game launch assist', q: 'How do I turn automatic game launching on or off quickly?', a: [
    'Use the <b>Auto-launch games</b> switch on the dashboard, under the progress bar. On means a game is started for you when SHiFT asks. Off means redeeming pauses and offers a one-click <b>Launch &amp; resume</b>. Turn it off while you\'re playing.',
    'While a game is open for SHiFT, the dashboard shows each step. <b>Close game &amp; resume</b> skips the rest of the wait, and <b>Stop</b> also closes the game the app started.'], go: { tab: 'dashboard', el: 'cmdBar', label: 'Show me' } },
  { cat: 'Game launch assist', q: 'Can the game run hidden?', a: ['No. SHiFT only counts a game that actually starts, and Steam doesn\'t allow invisible launches. You\'ll see the game open for about a minute, then close.'] },
  { cat: 'Game launch assist', q: 'Will it close a game I\'m playing?', a: ['No. It only ever closes a game it started itself. If you already have a Borderlands game open, it uses that and leaves it alone.'] },
  { cat: 'Game launch assist', q: 'I play Borderlands while it runs. What should I choose?', a: [
    'Choose <b>Ask me</b> (setup does this when you say you\'ll be playing). The app then never starts or closes a game by itself.',
    'If a Borderlands game is already open when SHiFT asks, SHiFT sees it and redeeming simply carries on after a short wait. Otherwise the dashboard offers a one-click <b>Launch &amp; resume</b>.'], go: { tab: 'settings', el: 'setAssist', label: 'Show me' } },
  { cat: 'Game launch assist', q: 'Why does the dashboard suggest turning automatic launching back on?', a: [
    'With game launch assist set to <b>Ask me</b> or <b>Off</b>, the dashboard offers about once a week (or after redeeming was paused) to switch back to <b>Automatically</b>, for times you\'re not playing.',
    'Select <b>Not now</b> to be asked again later, or <b>Don\'t ask again</b>. You can also turn the reminder off in Settings.'], go: { tab: 'settings', el: 'assistRemindRow', label: 'Show me' } },
  { cat: 'Game launch assist', q: 'Which game does it launch?', a: ['By default the quickest to start of the games you have installed (older games load fastest). You can pick a specific game in Settings.'], go: { tab: 'settings', el: 'setAssist', label: 'Show me' } },
  { cat: 'Game launch assist', q: 'Does it work with Epic Games?', a: ['Yes, with your game\'s Epic launch link. In the Epic launcher, create a desktop shortcut for the game, open the shortcut\'s properties, copy the URL and paste it into <b>Settings → Game launch assist</b>.'], go: { tab: 'settings', el: 'setAssist', label: 'Show me' } },
  { cat: 'Game launch assist', q: 'What about PlayStation, Xbox and Switch?', a: ['Console games can\'t be started from a computer. When SHiFT asks, start any Borderlands game on your console, wait at the main menu for a minute, then press <b>Resume</b> on the dashboard.'] },

  { cat: 'Redeeming', q: 'What does "On your account" on the Rewards page mean?', a: [
    'Each game card shows where that game stands on your SHiFT account, counted per code and platform for every working code the app knows:',
    '<ul><li><b>Redeemed here</b>: rewards SHiFT Redeemer unlocked.</li><li><b>Already redeemed</b>: SHiFT said you already had it, because you redeemed it on the website, in the game or on another device.</li><li><b>To go</b>: still waiting to be redeemed for the platforms you target.</li></ul>',
    'Every run updates it as codes are checked against your account. The platform filter at the top narrows it to one platform. Expired codes aren\'t counted.'], go: { tab: 'rewards', el: 'rpTitles', label: 'Show me' } },
  { cat: 'Redeeming', q: 'What are the game tiles on the dashboard?', a: [
    'One tile for each game you target, with the keys and cosmetics the app has unlocked there so far. During a run, a green <b>+N</b> shows what that run has added to each game, and it stays until your next run.',
    'Select a tile to open its full breakdown on the <b>Rewards</b> page.'], go: { tab: 'dashboard', el: 'gameStrip', label: 'Show me' } },
  { cat: 'Redeeming', q: 'How is the rewards report counted?', a: [
    'The <b>Rewards</b> page adds up what this app has unlocked for you, game by game. Key counts come from each code\'s published reward description, such as "5 Golden Keys".',
    'When one code gives different rewards in different games (for example Diamond Keys in Borderlands 3 only), each game is only credited with its own share. Rewards you already had are listed separately and not counted again.',
    'Wonderlands\' Skeleton Keys are its version of Golden Keys, so a code shared between games is counted as Skeleton Keys for Wonderlands and Golden Keys for the others.',
    'Codes you redeemed on the SHiFT website yourself aren\'t included.'], go: { tab: 'rewards', el: 'rpTotals', label: 'Open the report' } },

  // ---- Games & platforms
  { cat: 'Games & platforms', q: 'How do I choose which games get rewards?', a: ['Open <b>Games &amp; Platforms</b>. Leave <b>All titles</b> on, or choose <b>Only the ones I pick</b> and select your games. Platforms work the same way.'], go: { tab: 'targets', el: 'stepTitles', label: 'Show me' } },
  { cat: 'Games & platforms', q: 'Why isn\'t my platform shown as linked?', a: [
    'Platforms are linked on the SHiFT website, under <b>Gaming Platforms</b>, not in this app.',
    'The app learns which platforms are linked the first time it checks a code with SHiFT, so they may show as not linked until then.'], go: { tab: 'account', el: 'stepLinks', label: 'Show me' } },
  { cat: 'Games & platforms', q: 'What does "Trust source hints" do?', a: ['Some sites say a code is only for a certain game or platform. With this on, codes that are clearly not for your choices are skipped, which saves requests and avoids SHiFT\'s limits.'], go: { tab: 'targets', el: 'stepFiltering', label: 'Show me' } },

  // ---- Codes & sources
  { cat: 'Codes & sources', q: 'Where do codes come from?', a: ['A community feed of known codes, the MentalMars code lists, official announcements on Steam, Reddit, Steam Community guides, OzBargain, and the code guides on Eurogamer, PCGamesN, Game8, esports.net, Fossbytes and GIGA. You can turn any of them off, add your own, or ask an AI to search for you.'], go: { tab: 'sources', el: 'stepBuiltin', label: 'Show me' } },
  { cat: 'Codes & sources', q: 'What are the “Unsure” sources?', a: [
    'Code sites we couldn\'t check when we added them, because they block automated visits from our test setup: Lockercodes, Supercheats, Mobalytics, Icy Veins and GameStar. They start switched off.',
    'They may work fine from your computer. Turn one on under <b>Sources</b> and press its <b>Search</b> button. If it shows an error, that site is blocking apps too. Either way, SHiFT checks every code before anything is redeemed.'], go: { tab: 'sources', el: 'unsureSources', label: 'Show me' } },
  { cat: 'Codes & sources', q: 'Why are there codes in my list before I searched?', a: [
    'New installs start with a <b>starter list</b>: codes that were still working when this version came out. It means your first run has plenty to redeem straight away.',
    'Any that have expired since are simply marked dead when SHiFT checks them. It\'s only added once, for brand-new installs, and never mixed into an existing list.'] },
  { cat: 'Codes & sources', q: 'How do I ask an AI to find codes?', a: [
    '<ol><li>On <b>Sources</b>, under <b>Ask an AI to find codes</b>, select <b>Download instructions</b> (or <b>Copy instructions</b>).</li><li>Give them to an AI assistant that can search the web, such as ChatGPT, Claude, Gemini or Grok. Attach the file or paste the text.</li><li>Copy its whole reply, then on <b>Codes</b> select <b>Import list</b> and paste it.</li></ol>',
    'The instructions are made for your games and platforms and tell the AI exactly which file format to answer with. It\'s a handy backup if code websites change or go quiet.'], go: { tab: 'sources', el: 'stepAi', label: 'Show me' } },
  { cat: 'Codes & sources', q: 'Can an AI give me fake or wrong codes?', a: ['It can, which is why the instructions tell it never to guess and to give the web page for every code. Either way, SHiFT checks each code before anything is redeemed, so a wrong or expired one is just marked invalid. Nothing bad happens to your account.'] },
  { cat: 'Codes & sources', q: 'Can I add my own website?', a: [
    'Yes. On <b>Sources</b>, add the page under <b>Your sources</b>.',
    'If the page links to other pages with codes (like a list of forum posts), fill in <b>Follow links matching</b> with part of those links. For example, <code>/node/</code> follows links that contain "/node/".'], go: { tab: 'sources', el: 'stepCustom', label: 'Show me' } },
  { cat: 'Codes & sources', q: 'A source shows an error. Is something broken?', a: ['Usually not. Websites change or briefly block automated visits. The other sources keep working, and the failed one is tried again next time.'] },

  // ---- Auto-pilot & the app
  { cat: 'Auto-pilot & the app', q: 'How does auto-pilot work?', a: ['Every few hours it searches for new codes and redeems them, as if you\'d pressed <b>Find &amp; redeem</b>. Turn it on in <b>Settings</b>.'], go: { tab: 'settings', el: 'setAutopilot', label: 'Show me' } },
  { cat: 'Auto-pilot & the app', q: 'Does it keep running when I close the window?', a: [
    'Only if auto-pilot is on. Then it keeps working quietly in the background. Turn on <b>Start with my computer</b> to have it start when you sign in.',
    'With auto-pilot off, closing the window quits the app.'], go: { tab: 'settings', el: 'setAutopilot', label: 'Show me' } },
  { cat: 'Auto-pilot & the app', q: 'Can I turn off the animations?', a: ['Yes. In <b>Settings → Data &amp; display</b>, turn on <b>Reduce animations</b>. They\'re also turned off automatically if your computer is set to reduce motion.'], go: { tab: 'settings', el: 'setData', label: 'Show me' } },
  { cat: 'Auto-pilot & the app', q: 'Where did the menu tabs go?', a: ['When the window is too narrow to fit every tab, they fold into the <b>☰ menu</b> button at the top left, next to the logo. It shows the page you\'re on; select it to see every page.'] },
  { cat: 'Auto-pilot & the app', q: 'How do I quit completely?', a: ['Select the <b>⏻</b> button at the top right.'] },
  { cat: 'Auto-pilot & the app', q: 'How do I update the app?', a: [
    'When a new version is out, a banner appears on the dashboard. Select <b>Update now</b>: the app downloads the update, checks it, restarts and keeps all your codes and settings. It takes about a minute. <b>What’s new</b> shows what changed.',
    'You can also check yourself in <b>Settings → Updates</b>, and turn on <b>Install updates automatically</b> so it happens by itself when nothing is running (handy with auto-pilot).',
    'Versions before 1.4.0 can’t update themselves. For those, download the new version once from the release page and install it over the old one.'], go: { tab: 'settings', el: 'setUpdates', label: 'Show me' } },
  { cat: 'Auto-pilot & the app', q: 'Is updating from inside the app safe?', a: [
    'Yes. Updates only come from this project’s GitHub releases, and every download is checked against the fingerprint (SHA-256) GitHub publishes for it before anything is installed. If it doesn’t match, nothing is changed.',
    'On Windows the update installs just for you, with no admin prompt. On a Mac the app in Applications is replaced. Your data folder is never touched.'] },
  { cat: 'Auto-pilot & the app', q: 'Where is my data stored?', a: ['On this computer only, in the app\'s data folder. <b>Settings → Your data</b> shows where it is, and can open it or export everything as a file.'], go: { tab: 'settings', el: 'setData', label: 'Show me' } },
  { cat: 'Auto-pilot & the app', q: 'How do I start over?', a: ['Sign out on <b>Account</b>, quit the app, then delete the data folder shown in <b>Settings → Your data</b>. Next time you open the app, setup starts fresh.'] },

  // ---- Privacy & safety
  { cat: 'Privacy & safety', q: 'Is my password safe?', a: [
    'With <b>Keep me signed in</b>, your password goes into your computer\'s secure password storage: Windows Credential Manager or the macOS Keychain.',
    'If that isn\'t available, the app asks you first and clearly warns you before saving it as plain text. You can remove it any time with <b>Forget saved password</b>.'], go: { tab: 'account', el: 'acctStatus', label: 'Show me' } },
  { cat: 'Privacy & safety', q: 'Does the app send my data anywhere?', a: ['Your sign-in only ever goes to SHiFT. The app also visits the code sources you have turned on, and checks GitHub for new versions. Nothing else leaves your computer.'] },
  { cat: 'Privacy & safety', q: 'Is this an official Gearbox app?', a: ['No. It\'s a free, non-commercial fan tool that automates what you\'d otherwise do by hand on the SHiFT website. It isn\'t affiliated with or endorsed by Gearbox Software, 2K or Take-Two.'] },

  // ---- Troubleshooting
  { cat: 'Troubleshooting', q: 'Sign-in fails or asks for verification', a: [
    'Check you can sign in on the SHiFT website with the same email and password.',
    'If SHiFT asks for extra verification, use <b>Browser session</b> on the Account page instead.'], go: { tab: 'account', el: 'stepConnect', label: 'Show me' } },
  { cat: 'Troubleshooting', q: 'Nothing gets redeemed', a: [
    '<ol><li>Check you\'re signed in (top right).</li><li>Check <b>Games &amp; Platforms</b> has something selected.</li><li>Check your platforms are linked on the SHiFT website.</li><li>Press <b>Find &amp; redeem</b> to look for new codes. If the queue is empty, there\'s nothing new right now.</li></ol>'] },
  { cat: 'Troubleshooting', q: 'The game launched but redeeming is still paused', a: [
    'SHiFT may need the game to run a little longer. Increase <b>Keep the game open for at most</b> in Settings. The game still closes as soon as SHiFT is ready.',
    'If it keeps happening, play for a few minutes, then press <b>Resume</b>.'], go: { tab: 'settings', el: 'setAssist', label: 'Show me' } },
  { cat: 'Troubleshooting', q: 'SHiFT says I\'m making too many requests', a: ['The app waits and tries again by itself. If it happens a lot, increase the delay under <b>Settings → Pace</b>.'], go: { tab: 'settings', el: 'setPace', label: 'Show me' } },
  { cat: 'Troubleshooting', q: 'A code shows "Retry"', a: ['Something went wrong temporarily (for example a network hiccup). It\'s tried again on the next run.'] },
  { cat: 'Troubleshooting', q: '"Windows protected your PC" when installing', a: ['Select <b>More info</b>, then <b>Run anyway</b>. Windows shows this for apps that aren\'t code-signed, which costs money and isn\'t worth it for a free fan tool.'] },
  { cat: 'Troubleshooting', q: 'macOS says the app can\'t be opened', a: ['Right-click the app and choose <b>Open</b>, then <b>Open</b> again. If that doesn\'t work, go to <b>System Settings → Privacy &amp; Security</b> and select <b>Open Anyway</b>.'] },
  { cat: 'Troubleshooting', q: 'I closed the window but the app is still running', a: ['That\'s auto-pilot keeping things going in the background. Open the app again from your Start menu, desktop or Applications folder, then use <b>⏻</b> to quit completely.'] },
  { cat: 'Troubleshooting', q: 'The app window doesn\'t open', a: ['The app opens in its own Edge or Chrome window. If it\'s already running, opening it again brings that window back. If nothing appears, restart your computer and try again.'] },
]
  .concat(REWARDS_FAQ)
  .concat(TIPS.map((t) => ({ cat: 'Best practice', q: t.t, a: [t.d], go: t.go })))
  .concat([{ cat: 'Getting started', q: 'I’m new. Where do I start?', a: [
    'Follow the <b>Getting started</b> checklist at the top of the dashboard: connect your SHiFT account, link your platforms, pick your games, then press <b>Find &amp; redeem</b>. Each step has a button that takes you there, and it ticks itself off as you go.',
    'Then read <b>Help → Best practice</b> for the dozen habits that get the most out of the app.'], go: { tab: 'dashboard', el: 'startList', label: 'Show the checklist' } }])
  .map((f, i) => ({ ...f, id: `q${i}` }));

const SETTINGS = [
  { ic: '🔑', name: 'Sign in', desc: 'Account · step 1', tab: 'account', el: 'stepConnect', k: 'sign in login email password connect account' },
  { ic: '🍪', name: 'Browser session', desc: 'Account · step 1', tab: 'account', el: 'stepConnect', k: 'cookie si browser session verification chrome edge' },
  { ic: '🔗', name: 'Linked platforms', desc: 'Account · step 2', tab: 'account', el: 'stepLinks', k: 'link platforms steam epic playstation xbox switch gaming' },
  { ic: '🎮', name: 'Titles', desc: 'Games & Platforms · step 1', tab: 'targets', el: 'stepTitles', k: 'games titles borderlands choose pick select' },
  { ic: '🖥️', name: 'Platforms', desc: 'Games & Platforms · step 2', tab: 'targets', el: 'stepPlatforms', k: 'platforms steam epic playstation xbox switch' },
  { ic: '🧹', name: 'Smart filtering', desc: 'Games & Platforms · step 3', tab: 'targets', el: 'stepFiltering', k: 'hints expired skip filter trust' },
  { ic: '📊', name: 'Rewards report', desc: 'Rewards', tab: 'rewards', el: 'rpTotals', k: 'rewards report keys golden diamond skeleton items summary totals export csv history' },
  { ic: '🎭', name: 'Cosmetics collected', desc: 'Rewards', tab: 'rewards', el: 'rpCosmeticsCard', k: 'cosmetics cosmetic skins skin heads head trinkets emotes themes decorations items collected unlocked' },
  { ic: '🗝️', name: 'Rewards guide', desc: 'Help · keys & cosmetics explained', guide: '', k: 'guide golden diamond skeleton key keys chest armory cosmetics explained wiki what does' },
  { ic: '🤖', name: 'Ask an AI to find codes', desc: 'Sources · step 3', tab: 'sources', el: 'stepAi', k: 'ai llm chatgpt claude gemini grok instructions prompt assistant find search download' },
  { ic: '🔔', name: 'Automatic launching reminder', desc: 'Settings · step 2', tab: 'settings', el: 'assistRemindRow', k: 'remind reminder suggest ask again automatic launching playing nudge' },
  { ic: '➕', name: 'Paste codes', desc: 'Codes', tab: 'codes', el: 'btnAddCodes', action: 'paste', k: 'add paste code manual found' },
  { ic: '📥', name: 'Import a code list', desc: 'Codes · import', tab: 'codes', el: 'btnImportOpen', action: 'import', k: 'import list file friend community csv txt json drop share load' },
  { ic: '📤', name: 'Export a code list', desc: 'Codes · export', tab: 'codes', el: 'btnExportOpen', action: 'export', k: 'export list file share friend backup download copy csv txt json save' },
  { ic: '✨', name: 'Reduce animations', desc: 'Settings · step 4', tab: 'settings', el: 'setData', k: 'animation animations motion effects transitions reduce turn off' },
  { ic: '📡', name: 'Built-in sources', desc: 'Sources · step 1', tab: 'sources', el: 'stepBuiltin', k: 'sources feed reddit steam ozbargain mentalmars' },
  { ic: '🌐', name: 'Your sources', desc: 'Sources · step 2', tab: 'sources', el: 'stepCustom', k: 'custom website page url follow links' },
  { ic: '⏱️', name: 'Auto-pilot', desc: 'Settings · step 1', tab: 'settings', el: 'setAutopilot', k: 'auto pilot automatic timer schedule background' },
  { ic: '🚀', name: 'Start with my computer', desc: 'Settings · step 1', tab: 'settings', el: 'setAutopilot', k: 'startup start computer boot login windows' },
  { ic: '🕹️', name: 'Game launch assist', desc: 'Settings · step 2', tab: 'settings', el: 'setAssist', k: 'game launch assist paused steam close warm' },
  { ic: '🎚️', name: 'Auto-launch games switch', desc: 'Dashboard', tab: 'dashboard', el: 'cmdBar', k: 'auto launch games toggle switch quick on off dashboard playing' },
  { ic: '🧩', name: 'Game tiles', desc: 'Dashboard', tab: 'dashboard', el: 'gameStrip', k: 'game tiles per game dashboard keys added run progress' },
  { ic: '🟣', name: 'Epic launch link', desc: 'Settings · step 2', tab: 'settings', el: 'setAssist', k: 'epic launcher link shortcut' },
  { ic: '🐢', name: 'Pace', desc: 'Settings · step 3', tab: 'settings', el: 'setPace', k: 'delay pace rate limit slow requests' },
  { ic: '💾', name: 'Your data', desc: 'Settings · step 4', tab: 'settings', el: 'setData', k: 'data folder export backup files' },
  { ic: '⬆️', name: 'Updates', desc: 'Settings · step 5', tab: 'settings', el: 'setUpdates', k: 'update updates upgrade new version install download check automatic latest' },
  { ic: '🧭', name: 'Run setup again', desc: 'Settings', action: 'setup', k: 'setup wizard start again first time playing play while' },
];

const SYNONYMS = {
  login: 'sign', logon: 'sign', signin: 'sign', password: 'sign', email: 'sign', account: 'sign',
  cookie: 'session', cookies: 'session', verification: 'session', verify: 'session', '2fa': 'session',
  game: 'launch', games: 'launch', start: 'launch', steam: 'launch', launcher: 'launch', paused: 'launch', pause: 'launch', blocked: 'launch',
  epic: 'epic', egs: 'epic',
  console: 'playstation', ps5: 'playstation', ps4: 'playstation', psn: 'playstation', xbox: 'playstation', switch: 'playstation', nintendo: 'playstation',
  platform: 'platforms', linked: 'platforms', link: 'platforms',
  key: 'codes', keys: 'codes', golden: 'codes', code: 'codes', shift: 'codes',
  status: 'statuses', statuses: 'statuses', meaning: 'mean', means: 'mean',
  expire: 'expired', expiry: 'expired', old: 'expired',
  auto: 'auto-pilot', autopilot: 'auto-pilot', automatic: 'auto-pilot', schedule: 'auto-pilot', background: 'auto-pilot',
  close: 'quit', exit: 'quit', stop: 'quit',
  update: 'update', upgrade: 'update', version: 'update',
  safe: 'password', secure: 'password', keychain: 'password', credential: 'password', privacy: 'data', private: 'data',
  slow: 'requests', limit: 'requests', 'rate': 'requests', many: 'requests',
  website: 'sources', site: 'sources', reddit: 'sources', feed: 'sources', source: 'sources',
  error: 'troubleshooting', broken: 'troubleshooting', problem: 'troubleshooting', fails: 'troubleshooting', failed: 'troubleshooting',
  windows: 'install', mac: 'install', macos: 'install', smartscreen: 'install', install: 'install',
  reset: 'start over', restart: 'start over', delete: 'start over',
  cosmetics: 'cosmetic', skin: 'cosmetic', skins: 'cosmetic', head: 'cosmetic', heads: 'cosmetic', trinket: 'cosmetic', emote: 'cosmetic', theme: 'cosmetic', items: 'cosmetic',
  diamond: 'diamond', skeleton: 'skeleton', chest: 'key', armory: 'diamond',
  ai: 'ai', llm: 'ai', chatgpt: 'ai', claude: 'ai', gemini: 'ai', grok: 'ai', gpt: 'ai', prompt: 'ai', assistant: 'ai',
  menu: 'menu', hamburger: 'menu', tabs: 'menu', missing: 'menu',
  playing: 'play', gaming: 'play',
  new: 'start', beginner: 'start', begin: 'start', first: 'start', started: 'start',
  best: 'best practice', practice: 'best practice', tips: 'best practice', tip: 'best practice', recommended: 'best practice', advice: 'best practice',
};
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'is', 'it', 'my', 'i', 'do', 'how', 'can', 'what', 'why', 'for', 'with', 'does', 'be', 'are', 'me', 'this', 'that', 'when']);

const TOPICS = [
  ['Getting started', 'what does shift redeemer do'], ['Sign in', 'sign in'], ['Browser session', 'browser session'], ['Paused for a game', 'why redeeming paused asking game'],
  ['Game launch assist', 'game launch assist'], ['Runs hidden?', 'game run hidden'], ['Epic Games', 'epic'], ['Consoles', 'playstation xbox switch'],
  ['Code statuses', 'code statuses'], ['Already had', 'already had'], ['Not targeted', 'not targeted'], ['Likely expired', 'likely expired'],
  ['Add a code', 'add a code'], ['Check again', 'check a code again'], ['Choose games', 'choose games'], ['Linked platforms', 'platform linked'],
  ['Source hints', 'trust source hints'], ['Where codes come from', 'where do codes come from'], ['Add a website', 'add my own website'], ['Source errors', 'source error'],
  ['Auto-pilot', 'auto-pilot'], ['Closing the window', 'close the window'], ['Quit', 'quit completely'], ['Updates', 'update the app'], ['Safe updates', 'updating safe'],
  ['Where is my data', 'where is my data'], ['Start over', 'start over'], ['Password safety', 'password safe'], ['Privacy', 'send my data'],
  ['Official?', 'official gearbox'], ['Nothing redeemed', 'nothing gets redeemed'], ['Too many requests', 'too many requests'], ['Retry', 'retry'],
  ['Windows warning', 'windows protected'], ['macOS warning', 'macos opened'], ['Run results', 'results of a run'], ['How long', 'how long run'],
['New here?', 'new where do i start'], ['Best practice', 'best way set up'], ['Golden Keys', 'what does a golden key do'], ['Diamond Keys', 'what does a diamond key do'], ['Skeleton Keys', 'what does a skeleton key do'], ['Cosmetics', 'what are cosmetics'], ['Ask an AI', 'ask an ai to find codes'], ['Playing while it runs', 'play borderlands while it runs'], ['Where are the tabs?', 'where did the menu tabs go'],
  ['Import a list', 'import list friend'], ['Share codes', 'share back up codes'], ['File types', 'which files import'], ['Export privacy', 'export include account'], ['Animations', 'turn off animations'], ['Rewards report', 'rewards report counted'], ['Already redeemed', 'on your account mean already redeemed'], ['Export rewards', 'rewards report export csv'], ['Setup again', 'run setup again'], ['Supported games', 'which games supported'], ['Which game launches', 'which game launch'], ['Auto-launch switch', 'turn automatic game launching on off quickly'], ['Game tiles', 'game tiles dashboard'], ['Still paused', 'still paused'],
];

const TILES = [
  { ic: '🗝️', t: 'Getting started', d: 'What the app does and the three steps to your first rewards.', s: 'what does shift redeemer do', q: 'What does SHiFT Redeemer do?' },
  { ic: '⏸️', t: 'Paused for a game', d: 'Why SHiFT sometimes stops accepting codes, and what to do.', s: 'paused game', q: 'Why is redeeming paused and asking for a game?' },
  { ic: '🕹️', t: 'Game launch assist', d: 'Starts a game for you, then closes it and carries on.', s: 'game launch assist', q: 'What does game launch assist do?' },
  { ic: '🏷️', t: 'Code statuses', d: 'Queued, redeemed, expired, not targeted and the rest.', s: 'code statuses', q: 'What do the code statuses mean?' },
  { ic: '🎮', t: 'Games & platforms', d: 'Choose where rewards go, and link your platforms.', s: 'choose games', q: 'How do I choose which games get rewards?' },
  { ic: '⏱️', t: 'Auto-pilot', d: 'Keep redeeming new codes without lifting a finger.', s: 'auto-pilot', q: 'How does auto-pilot work?' },
  { ic: '📊', t: 'Rewards report', d: 'Keys and items unlocked, game by game.', s: 'rewards report counted', q: 'How is the rewards report counted?' },
  { ic: '⭐', t: 'Best practice', d: 'A dozen habits that get the most out of the app.', tab: 'tips', feature: true },
  { ic: '🗝️', t: 'Keys & cosmetics explained', d: 'What Golden, Diamond and Skeleton Keys do in each game.', tab: 'guide' },
  { ic: '🤖', t: 'Ask an AI for codes', d: 'Instructions for ChatGPT, Claude, Gemini or Grok.', s: 'ask an ai to find codes', q: 'How do I ask an AI to find codes?' },
  { ic: '🔒', t: 'Password safety', d: 'Where your sign-in is kept, and how to remove it.', s: 'password safe', q: 'Is my password safe?' },
  { ic: '➕', t: 'Add your own codes', d: 'Paste codes you found anywhere.', s: 'add a code', q: 'Can I add a code I found myself?' },
  { ic: '🤝', t: 'Share code lists', d: 'Import a friend\'s list, or export yours.', s: 'import list friend', q: 'How do I import a list of codes from a friend?' },
  { ic: '🛠️', t: 'Something not working?', d: 'Quick fixes for the most common problems.', tab: 'trouble' },
];

// ------------------------------------------------------------------ search helpers

function terms(q) {
  const out = [];
  for (const w of String(q).toLowerCase().split(/[^a-z0-9-]+/)) {
    if (!w || STOP.has(w)) continue;
    out.push(w);
    if (SYNONYMS[w]) out.push(SYNONYMS[w]);
    if (w.length > 4 && w.endsWith('s')) out.push(w.slice(0, -1));
  }
  return [...new Set(out)];
}
const plain = (html) => html.replace(/<[^>]+>/g, ' ');
function score(text, ts) {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of ts) if (t.includes(w)) s++;
  return s;
}
function highlight(html, ts) {
  const words = ts.filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return html;
  const rx = new RegExp(`(${words.join('|')})`, 'gi');
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : part.replace(rx, '<mark class="hl">$1</mark>')))
    .join('');
}

// ------------------------------------------------------------------ module

export function initHelp({ goTo, runAction, getDiagnostics, repoUrl, getRewardCounts, renderChecklist }) {
  const overlay = $('#helpOverlay');
  const search = $('#helpSearch');
  const results = $('#helpResults');
  const panes = $$('.help-pane', overlay);
  let lastFocus = null;

  // ---- render static panes
  const faqItem = (f, open = false, ts = []) => {
    const d = document.createElement('details');
    d.className = 'faq-item';
    d.dataset.id = f.id;
    d.open = open;
    const go = f.go ? `<div class="faq-go"><button class="btn btn-sm" data-faq-go="${f.id}">${esc(f.go.label || 'Show me')}</button></div>` : '';
    d.innerHTML = `<summary><span class="q">${highlight(esc(f.q), ts)}</span><button class="pin-btn" type="button" title="Pin this answer" aria-label="Pin this answer">📌</button></summary>
      <div class="faq-ans">${f.a.map((p) => (/^<(ol|ul)/.test(p) ? highlight(p, ts) : `<p>${highlight(p, ts)}</p>`)).join('')}${go}</div>`;
    return d;
  };

  function renderList(container, filter) {
    container.innerHTML = '';
    let cat = null;
    for (const f of FAQ.filter(filter)) {
      if (f.cat !== cat) {
        cat = f.cat;
        const h = document.createElement('h4');
        h.className = 'faq-cat';
        h.textContent = cat;
        container.appendChild(h);
      }
      container.appendChild(faqItem(f));
    }
  }

  $('[data-pane="about"]', overlay).innerHTML = `
    <p class="lead">SHiFT Redeemer finds SHiFT codes and redeems them on your account for the games and platforms you choose. New here? Start with the checklist below, then skim <button class="link-btn" data-help-tab="tips">Best practice</button>.</p>
    <div class="help-checklist" id="helpChecklist"></div>
    <div class="tile-grid">${TILES.map(
      (t) => `<button class="tile ${t.feature ? 'feature' : ''}" ${t.tab ? `data-tile-tab="${t.tab}"` : `data-tile-s="${esc(t.s)}" data-tile-q="${esc(t.q)}"`}><span class="tile-ic" aria-hidden="true">${t.ic}</span><div><b>${esc(t.t)}</b><span>${esc(t.d)}</span></div><span class="tile-go" aria-hidden="true">›</span></button>`,
    ).join('')}</div>
    <h4 class="help-h">Your first rewards in three steps</h4>
    <ol class="help-steps">
      <li><b>Sign in</b> with your SHiFT account on the Account page.</li>
      <li><b>Pick your games and platforms</b>, or leave everything selected.</li>
      <li>Press <b>Find &amp; redeem</b> on the dashboard and watch the live feed.</li>
    </ol>
    <h4 class="help-h">The dashboard buttons</h4>
    <ul class="help-steps">
      <li><b>Find &amp; redeem</b>: searches for new codes, then redeems everything waiting.</li>
      <li><b>Find codes</b>: searches only, so you can look before redeeming.</li>
      <li><b>Redeem queue</b>: redeems codes already found.</li>
    </ul>
    <div class="help-actions">
      <button class="btn btn-sm" data-help-tab="faq">Browse all questions</button>
      <button class="btn btn-sm" data-help-tab="trouble">Troubleshooting</button>
      <button class="btn btn-sm btn-ghost" data-help-action="setup">Run setup again</button>
    </div>`;
  renderList($('[data-pane="faq"]', overlay), (f) => f.cat !== 'Troubleshooting' && f.cat !== 'Best practice');
  $('[data-pane="tips"]', overlay).innerHTML = `
    <p class="lead">The habits that get the most out of SHiFT Redeemer, roughly in the order you’ll need them.</p>
    <ol class="tips">${TIPS.map((t, i) => {
      const f = FAQ.find((x) => x.q === t.t);
      return `<li class="tip-card"><span class="tip-n">${i + 1}</span><span class="tile-ic" aria-hidden="true">${t.ic}</span><div><b>${esc(t.t)}</b><p>${esc(t.d)}</p>${t.go ? `<button class="btn btn-xs btn-ghost" data-faq-go="${f.id}">${esc(t.go.label || 'Show me')} ›</button>` : ''}</div></li>`;
    }).join('')}</ol>`;
  const trouble = $('[data-pane="trouble"]', overlay);
  trouble.innerHTML = '<p class="lead">Quick fixes for the most common problems. Still stuck? See <button class="link-btn" data-help-tab="support">Support</button>.</p><div></div>';
  renderList(trouble.lastElementChild, (f) => f.cat === 'Troubleshooting');
  $('[data-pane="support"]', overlay).innerHTML = `
    <p class="lead">Found a bug or have an idea? Report it on GitHub. Copying the diagnostics first makes problems much quicker to fix.</p>
    <div class="tile-grid">
      <a class="tile feature" href="${esc(repoUrl)}/issues/new" target="_blank" rel="noopener"><span class="tile-ic" aria-hidden="true">🐞</span><div><b>Report a problem</b><span>Opens a new issue on GitHub. Paste the diagnostics in.</span></div><span class="tile-go" aria-hidden="true">›</span></a>
      <button class="tile" data-help-action="diagnostics"><span class="tile-ic" aria-hidden="true">📋</span><div><b>Copy diagnostics</b><span>App version, settings and recent activity. Email addresses are removed.</span></div><span class="tile-go" aria-hidden="true">›</span></button>
      <button class="tile" data-help-action="data"><span class="tile-ic" aria-hidden="true">📂</span><div><b>Open data folder</b><span>Where your codes and settings are stored.</span></div><span class="tile-go" aria-hidden="true">›</span></button>
      <a class="tile" href="${esc(repoUrl)}/releases/latest" target="_blank" rel="noopener"><span class="tile-ic" aria-hidden="true">⬇️</span><div><b>Latest version</b><span>Download the newest release.</span></div><span class="tile-go" aria-hidden="true">›</span></a>
    </div>
    <h4 class="help-h">What diagnostics include</h4>
    <ul class="help-steps"><li>App version and your operating system.</li><li>Your settings (no passwords or session data).</li><li>The last run's results and the most recent activity, with email addresses removed.</li></ul>`;

  // ---- tabs & search
  function setTab(tab) {
    $$('[role="tab"]', overlay).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    panes.forEach((p) => (p.hidden = p.dataset.pane !== tab));
    $('#helpScroll').scrollTop = 0;
    if (tab === 'guide') drawGuide(true);
    if (tab === 'tips')
      try {
        localStorage.setItem('sr.tipsSeen', '1');
      } catch {
        /* storage unavailable */
      }
  }

  // ---- Rewards guide (interactive, with your own counts from the rewards report)
  const guide = { game: '', counts: null };
  function drawGuide(refresh = false) {
    const pane = $('[data-pane="guide"]', overlay);
    renderGuide(pane, {
      game: guide.game,
      counts: guide.counts,
      onGame: (g) => {
        guide.game = g;
        drawGuide();
      },
    });
    if (refresh && getRewardCounts)
      getRewardCounts()
        .then((c) => {
          guide.counts = c;
          if (!pane.hidden) drawGuide();
        })
        .catch(() => {});
  }
  function openGuide(game = '') {
    if (overlay.hidden) open();
    guide.game = game;
    search.value = '';
    runSearch();
    setTab('guide');
  }

  function runSearch() {
    const q = search.value.trim();
    const tabs = $('#helpTabs');
    if (!q) {
      results.hidden = true;
      tabs.hidden = false;
      const sel = $('[role="tab"][aria-selected="true"]', overlay);
      panes.forEach((p) => (p.hidden = p.dataset.pane !== (sel ? sel.dataset.tab : 'about')));
      return;
    }
    const ts = terms(q);
    tabs.hidden = true;
    panes.forEach((p) => (p.hidden = true));
    results.hidden = false;
    results.innerHTML = '';
    let sets = SETTINGS.map((s) => ({ s, n: score(`${s.name} ${s.k} ${s.desc}`, ts) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    // Only show settings that match nearly as well as the best one.
    if (sets.length) sets = sets.filter((x) => x.n >= Math.max(1, sets[0].n - 1)).slice(0, 4);
    const qs = FAQ.map((f) => ({ f, n: score(f.q, ts) * 3 + score(plain(f.a.join(' ')) + ' ' + f.cat, ts) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    if (sets.length) {
      const g = document.createElement('div');
      g.className = 'help-res-group';
      g.innerHTML = '<h4 class="faq-cat">Settings</h4>';
      for (const { s } of sets) {
        const b = document.createElement('button');
        b.className = 'row-btn';
        b.innerHTML = `<span class="tile-ic" aria-hidden="true">${s.ic}</span><span><b>${esc(s.name)}</b><small>${esc(s.desc)} · show me</small></span>`;
        b.onclick = () => go(s);
        g.appendChild(b);
      }
      results.appendChild(g);
    }
    if (qs.length) {
      const g = document.createElement('div');
      g.className = 'help-res-group';
      g.innerHTML = '<h4 class="faq-cat">Questions</h4>';
      qs.forEach(({ f }, i) => g.appendChild(faqItem(f, i === 0, ts)));
      results.appendChild(g);
    }
    if (!sets.length && !qs.length) {
      results.innerHTML = '<p class="help-empty">No matches. Try different words, or see <button class="link-btn" data-clear-to="support">Support</button>.</p>';
    }
    refreshPinButtons();
  }

  function showAnswer(s, question) {
    search.value = s;
    runSearch();
    const f = FAQ.find((x) => x.q === question);
    if (!f) return;
    $$('.faq-item', results).forEach((d) => (d.dataset.id === f.id ? d.remove() : (d.open = false)));
    let g = $$('.help-res-group', results).find((x) => $('.faq-cat', x)?.textContent === 'Questions');
    if (!g) {
      g = document.createElement('div');
      g.className = 'help-res-group';
      g.innerHTML = '<h4 class="faq-cat">Questions</h4>';
    }
    const item = faqItem(f, true, terms(s));
    item.classList.add('is-focus');
    $('.faq-cat', g).after(item);
    results.prepend(g);
    refreshPinButtons();
    $('#helpScroll').scrollTop = 0;
  }

  function go(target) {
    if (target.guide !== undefined) return openGuide(target.guide);
    close();
    if (target.action) runAction(target.action);
    if (target.tab) goTo(target.tab, target.el);
  }

  // ---- open / close
  function open(query = '') {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    setTab('about');
    renderChecklist?.($('#helpChecklist'));
    search.value = query;
    runSearch();
    startChips();
    setTimeout(() => search.focus(), 30);
  }
  function close() {
    overlay.hidden = true;
    stopChips();
    lastFocus?.focus?.();
  }

  // ---- quick-answer chips
  const chipsEl = $('#helpChips');
  const PER = 5;
  const SETS = Math.ceil(TOPICS.length / PER);
  const CHIP_MS = 9000;
  let chipSet = 0;
  let chipTimer;
  let cueTimer;
  const drawChips = () => {
    chipsEl.innerHTML =
      TOPICS.slice(chipSet * PER, chipSet * PER + PER)
        .map(([l, q]) => `<button class="help-chip" data-q="${esc(q)}">${esc(l)}</button>`)
        .join('') + '<button class="help-chip-next" id="chipNext" title="More quick answers" aria-label="More quick answers">↻</button>';
  };
  const paused = () => chipsEl.matches(':hover') || chipsEl.contains(document.activeElement) || search.value.trim() !== '';
  function schedule() {
    clearTimeout(chipTimer);
    clearTimeout(cueTimer);
    if (overlay.hidden) return;
    cueTimer = setTimeout(() => !paused() && $('#chipNext')?.classList.add('cue'), CHIP_MS - 1500);
    chipTimer = setTimeout(() => nextChips(false), CHIP_MS);
  }
  function nextChips(manual) {
    if (!manual && paused()) return schedule();
    const swap = () => {
      chipSet = (chipSet + 1) % SETS;
      drawChips();
      chipsEl.classList.remove('swap');
    };
    if (reduceMotion) swap();
    else {
      chipsEl.classList.add('swap');
      setTimeout(swap, 220);
    }
    schedule();
  }
  function startChips() {
    chipSet = 0;
    drawChips();
    schedule();
  }
  function stopChips() {
    clearTimeout(chipTimer);
    clearTimeout(cueTimer);
  }

  // ---- pinned answers
  const PIN_KEY = 'sr.pins';
  const POS_KEY = 'sr.pinPos';
  const pinPanel = $('#pinPanel');
  const pinBody = $('#pinBody');
  let pins = [];
  try {
    pins = JSON.parse(localStorage.getItem(PIN_KEY) || '[]').filter((q) => FAQ.some((f) => f.q === q));
  } catch {
    pins = [];
  }
  const savePins = () => {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pins));
    } catch {
      /* storage unavailable */
    }
  };
  function refreshPinButtons() {
    $$('.faq-item').forEach((d) => {
      const f = FAQ.find((x) => x.id === d.dataset.id);
      const b = $('.pin-btn', d);
      if (!f || !b) return;
      const on = pins.includes(f.q);
      b.classList.toggle('on', on);
      b.title = on ? 'Unpin this answer' : 'Pin this answer';
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  let pos = { edge: 'right', t: 0.7 };
  try {
    pos = JSON.parse(localStorage.getItem(POS_KEY)) || pos;
  } catch {
    /* default */
  }
  function placePanel() {
    if (pinPanel.hidden) return;
    const m = 12;
    const w = pinPanel.offsetWidth;
    const h = pinPanel.offsetHeight;
    let x;
    let y;
    if (pos.edge === 'left' || pos.edge === 'right') {
      x = pos.edge === 'left' ? m : innerWidth - w - m;
      y = Math.min(innerHeight - h - m, Math.max(m, pos.t * (innerHeight - h)));
    } else {
      y = pos.edge === 'top' ? m : innerHeight - h - m;
      x = Math.min(innerWidth - w - m, Math.max(m, pos.t * (innerWidth - w)));
    }
    pinPanel.style.left = `${x}px`;
    pinPanel.style.top = `${y}px`;
  }
  function renderPins() {
    $('#pinCount').textContent = pins.length;
    pinPanel.hidden = pins.length === 0;
    pinBody.innerHTML = '';
    for (const q of pins) {
      const f = FAQ.find((x) => x.q === q);
      if (f) pinBody.appendChild(faqItem(f, true));
    }
    refreshPinButtons();
    placePanel();
  }
  function togglePin(id) {
    const f = FAQ.find((x) => x.id === id);
    if (!f) return;
    pins = pins.includes(f.q) ? pins.filter((q) => q !== f.q) : [...pins, f.q];
    savePins();
    renderPins();
  }
  $('#pinClose').onclick = () => {
    pins = [];
    savePins();
    renderPins();
  };
  $('#pinCollapse').onclick = () => $$('details', pinBody).forEach((d) => (d.open = false));
  const toggleMin = () => {
    pinPanel.classList.toggle('min');
    $('#pinMin').textContent = pinPanel.classList.contains('min') ? '▴' : '–';
    placePanel();
  };
  $('#pinMin').onclick = toggleMin;
  $('#pinHead').addEventListener('dblclick', (e) => !e.target.closest('button') && toggleMin());
  $('#pinHead').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const head = $('#pinHead');
    const r = pinPanel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev) => {
      pinPanel.style.left = `${ev.clientX - dx}px`;
      pinPanel.style.top = `${ev.clientY - dy}px`;
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      const b = pinPanel.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const d = { left: cx, right: innerWidth - cx, top: cy, bottom: innerHeight - cy };
      const edge = Object.keys(d).sort((a, z) => d[a] - d[z])[0];
      const t = edge === 'left' || edge === 'right' ? b.top / Math.max(1, innerHeight - b.height) : b.left / Math.max(1, innerWidth - b.width);
      pos = { edge, t: Math.min(1, Math.max(0, t)) };
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        /* storage unavailable */
      }
      placePanel();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
  addEventListener('resize', placePanel);

  // ---- events
  search.addEventListener('input', runSearch);
  $('#helpBtn').onclick = () => open();
  $('#helpClose').onclick = close;
  $('#helpHome').onclick = () => {
    search.value = '';
    runSearch();
    setTab('about');
    search.focus();
  };
  $$('[role="tab"]', overlay).forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return close();
    const t = e.target;
    const chip = t.closest('.help-chip');
    if (chip) {
      search.value = chip.dataset.q;
      runSearch();
      search.focus();
      return;
    }
    if (t.id === 'chipNext') return nextChips(true);
    const tile = t.closest('.tile[data-tile-q], .tile[data-tile-tab]');
    if (tile) return tile.dataset.tileTab ? setTab(tile.dataset.tileTab) : showAnswer(tile.dataset.tileS, tile.dataset.tileQ);
    const tabBtn = t.closest('[data-help-tab]');
    if (tabBtn) {
      search.value = '';
      runSearch();
      return setTab(tabBtn.dataset.helpTab);
    }
    const clear = t.closest('[data-clear-to]');
    if (clear) {
      search.value = '';
      runSearch();
      return setTab(clear.dataset.clearTo);
    }
    if (t.closest('[data-gd-close]')) return close();
    const action = t.closest('[data-help-action]');
    if (action) {
      const a = action.dataset.helpAction;
      if (a === 'diagnostics') return copyDiagnostics();
      if (a === 'setup') close();
      return runAction(a);
    }
  });
  // "Show me" inside answers (also in the pinned panel)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-faq-go]');
    if (!b) return;
    const f = FAQ.find((x) => x.id === b.dataset.faqGo);
    if (f?.go) go(f.go);
  });
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('.pin-btn');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      togglePin(b.closest('.faq-item').dataset.id);
    },
    true,
  );
  // contextual "?" buttons anywhere in the app
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help]');
    if (b) open(b.dataset.help);
    const g = e.target.closest('[data-help-guide]');
    if (g) openGuide(g.dataset.helpGuide || '');
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (!overlay.hidden && e.key === 'Escape') {
      e.preventDefault();
      return close();
    }
    if (overlay.hidden && !typing && (e.key === '?' || e.key === 'F1')) {
      e.preventDefault();
      open();
    }
  });

  async function copyDiagnostics() {
    const text = getDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      runAction('toast', 'Diagnostics copied. Paste them into your report.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      runAction('toast', 'Diagnostics copied. Paste them into your report.');
    }
  }

  renderPins();
  function openTab(tab) {
    open();
    setTab(tab);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help-open]');
    if (b) openTab(b.dataset.helpOpen);
  });

  return { open, close, openGuide, openTab, isOpen: () => !overlay.hidden };
}
