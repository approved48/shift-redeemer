# SHiFT Redeemer

A local web app that **finds SHiFT codes** across the web and **redeems them automatically** on your account, only for the Borderlands games and platforms you choose.

It runs on your own PC. Your browser talks to a small local server (`http://localhost:4777`), and that server talks to `shift.gearboxsoftware.com` the same way the **CHECK** and **Redeem for …** buttons do on the [SHiFT rewards page](https://shift.gearboxsoftware.com/rewards).

> Free, non-commercial fan tool. Not affiliated with, endorsed by or sponsored by Gearbox Software, 2K or Take-Two. Borderlands and SHiFT are trademarks of their respective owners.

## Quick start

1. Install **Node.js 18 or newer** from <https://nodejs.org> (no other installs; there are no npm dependencies).
2. Start the app:
   - **Windows:** double-click `start.bat`
   - **macOS:** double-click `start.command`
   - **Any OS:** run `node server.js` in this folder (or `npm start`)
3. Your browser opens at **http://localhost:4777**.
4. On the **Account** tab, connect your SHiFT account (see below).
5. On the **Games & Platforms** tab, choose your targets.
6. Press **Find & redeem** on the Dashboard.

Leave the window running if you want auto-pilot to keep redeeming new codes on a timer.

## Connecting your account

**Option A: use your Chrome session (no password).** If you're already signed in to SHiFT in Chrome:

1. Open <https://shift.gearboxsoftware.com/rewards>.
2. Press `F12`, then go to **Application** → **Cookies** → `https://shift.gearboxsoftware.com`.
3. Copy the **Value** of the cookie named `si` and paste it into the app.

**Option B: email and password.** These are the same credentials you use on the SHiFT website. You can tick *Remember* so auto-pilot can sign in again when the session expires. They are stored unencrypted in `data/session.json` on your PC.

## What it does

| Section | What you can do |
| --- | --- |
| **Dashboard** | One-click *Find & redeem*, *Find codes* only, or *Redeem queue*; live progress and activity log; last-run summary |
| **Codes** | Every code found, with reward, expiry, source links, and per-game/per-platform results. Search and filter, paste codes from anywhere, redeem, re-check or ignore a single code |
| **Games & Platforms** | **Titles:** *All titles*, or pick from BL4, Wonderlands, BL3, Pre-Sequel, BL2 and BL GOTY (new titles SHiFT reports are added automatically). **Platforms:** *All linked platforms*, or pick from Steam, Epic, PlayStation, Xbox and Nintendo. Also smart filtering to save requests |
| **Code Sources** | Turn built-in sources on or off, search a single source, add your own pages |
| **Settings** | Request pacing, a per-run limit, auto-pilot interval, and JSON export |

### Where codes come from

| Source | Notes |
| --- | --- |
| Community code feed | [`ugoogalizer/autoshift-codes`](https://github.com/ugoogalizer/autoshift-codes): a JSON feed of every known code with game, reward and expiry (data from MentalMars) |
| MentalMars (direct) | Scrapes the per-game code tables, so new codes show up before the feed refreshes |
| Steam news | Official announcements for each game, via the public Steam Web API |
| Reddit | Recent "shift code" posts in the Borderlands subreddits |
| Steam Community guides | Top "SHiFT codes" guides for each game |
| OzBargain | Deals and forum posts mentioning Borderlands SHiFT codes |
| Your own pages | Any URL, optionally following links that match a regex (e.g. `/node/\d+$` on OzBargain, or `sharedfiles/filedetails` on Steam) |
| Paste | Paste any text (a tweet, a Discord message, a whole guide) and the codes are pulled out |

Sources only suggest candidate codes. Every code is checked with SHiFT first, and SHiFT decides which games and platforms it is valid for.

### How redemption works

For each queued code (codes expiring soonest go first):

1. **Check** the code with SHiFT. Expired or invalid codes are marked dead and never retried.
2. For every **title × platform** pair SHiFT offers that matches your targets and isn't already done, **redeem** it.
3. Results are saved, so a code is never redeemed twice. If you later add a game or platform, only the new pairs are redeemed.

What it handles automatically:

- **Rate limits:** a delay between requests (default 5s), plus a back-off of 60s or more when SHiFT says *slow down*.
- **"Launch a SHiFT-enabled title first":** Gearbox sometimes pauses redemptions until you start a game. The app pauses that platform, carries on with any others, and the dashboard tells you. Launch any Borderlands game, wait at the main menu for a minute, then press *Redeem queue*.
- **Expired session:** if you saved credentials, it signs in again on its own. Otherwise the app asks you to reconnect.

## Privacy and safety

- The server listens on `127.0.0.1` only. API calls must come from the app's own page (custom header plus Origin/Host checks), so other websites can't drive it.
- Your session cookie, settings and history stay in `./data/` (git-ignored).
- The app sends requests only to SHiFT and the code sources listed above.

## Configuration (optional)

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4777` | Local port |
| `DATA_DIR` | `./data` | Where codes, history and the session are stored |
| `NO_OPEN=1` | off | Don't open a browser on start (also `--no-open`) |
| `SHIFT_BASE_URL` | `https://shift.gearboxsoftware.com` | Point at the mock server for testing |

## Development

```bash
npm test          # end-to-end tests against a mock SHiFT server
npm run mock      # mock SHiFT on :4999 (login vault@hunter.test / hunter2)
SHIFT_BASE_URL=http://127.0.0.1:4999 DATA_DIR=./data-dev node server.js
```

Layout: `server.js` (HTTP and API), `lib/shift.js` (SHiFT client), `lib/engine.js` (queue, redemption, scheduler), `lib/sources.js` (code discovery), `lib/catalog.js` (games and platforms), and `public/` (UI, no build step).

Credit: the SHiFT request flow is based on [Fabbi/autoshift](https://github.com/Fabbi/autoshift).
