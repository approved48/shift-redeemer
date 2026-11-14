# SHiFT Redeemer

**Finds SHiFT codes for you and redeems them automatically** for the Borderlands games and platforms you choose. No more hunting through websites and copy-pasting codes one by one.

Works with Borderlands 4, Tiny Tina's Wonderlands, Borderlands 3, The Pre-Sequel, Borderlands 2 and Borderlands GOTY, on Steam, Epic, PlayStation, Xbox and Nintendo.

> Free, non-commercial fan tool. Not affiliated with, endorsed by or sponsored by Gearbox Software, 2K or Take-Two. Borderlands and SHiFT are trademarks of their respective owners.

## Download and install

Go to the [**Releases page**](https://github.com/approved48/shift-redeemer/releases/latest) and download the file for your computer:

| Your computer | Download |
| --- | --- |
| **Windows 10 / 11** | `SHiFT-Redeemer-Setup-…-Windows.exe` |
| **Mac** (Apple Silicon or Intel) | `SHiFT-Redeemer-…-macOS.dmg` |
| Linux | `SHiFT-Redeemer-…-Linux-x64.tar.gz` |

You don't need to install anything else.

**Windows:** run the Setup file and click through it. If you see **"Windows protected your PC"**, click **More info → Run anyway**. This appears because the app isn't code-signed, which costs money and isn't worth it for a free fan tool. SHiFT Redeemer opens when setup finishes and is in your Start menu from then on.

**Mac:** open the `.dmg` and drag **SHiFT Redeemer** into **Applications**. The first time, right-click the app and choose **Open**. If macOS still refuses, go to **System Settings → Privacy & Security** and click **Open Anyway**.

## Using it

The first time you open it, a short **setup wizard** walks you through everything:

1. **Connect your SHiFT account**: your SHiFT email and password, or (if SHiFT asks for extra verification) a session borrowed from your browser.
2. **Link your gaming platforms** on the SHiFT website, so rewards have somewhere to go.
3. **Pick your games and platforms**, or leave everything selected.
4. **Turn on auto-pilot** if you'd like it to keep going on its own.
5. Press **Find & redeem**.

You can run the wizard again any time from **Settings**.

**Your rewards report.** The **Rewards** tab adds up everything the app has unlocked for you: Golden, Diamond and Skeleton Keys and cosmetic items, per game and per platform. It includes a month-by-month chart, the full history, filters for time period and platform, and **Export CSV**. When one code gives different rewards in different games, each game is credited with its own share.

**Need help?** Press **?** (or the **Help** button) any time. You can search questions and settings, browse quick answers and topics, or jump straight to a setting with **show me**. Pin answers you want to keep handy, and use **Support → Copy diagnostics** when reporting a problem.

That's it. The app searches the web for codes, checks each one with SHiFT, and redeems it for every game and platform you picked. It remembers what it has already done, so nothing is redeemed twice.

**Want it fully automatic?** In **Settings**, turn on **Auto-pilot** and **Start with my computer**. SHiFT Redeemer then runs quietly in the background and redeems new codes every few hours.

**Closing the app:** closing the window quits it, unless auto-pilot is on, in which case it keeps working in the background. The **⏻** button at the top always quits completely.

### Good to know

- **"Launch a SHiFT-enabled game first."** Gearbox sometimes pauses redemptions until you start a game. **Game launch assist** handles this. The app finds a Borderlands game installed through Steam (or uses your Epic launch link), starts it, waits about a minute at the main menu so SHiFT registers it, closes it again and carries on redeeming. It only closes a game it started itself. Set it to *Automatically*, *Ask me* (one click: "Launch & resume") or *Off* in **Settings**. Games can't be started invisibly, so you'll see it open briefly. Console games can't be launched remotely; for those the dashboard says exactly what it's waiting for.
- **Missing a platform?** SHiFT only redeems for platforms linked to your account. Link them on the SHiFT website under *Gaming Platforms*.
- **Your data stays on your computer.** The app only talks to SHiFT and the code websites it searches.
- **"Keep me signed in"** saves your SHiFT password in your system's secure password storage: **Windows Credential Manager** or the **macOS Keychain** (on Linux, GNOME Keyring or KWallet). If that isn't available, the app asks first and clearly warns you before saving it unencrypted, and you can always choose not to save it. **Forget saved password** on the Account tab removes it.
- **Updating:** when a new version is out, the app shows a banner. Install the new version over the old one; your codes and settings are kept.
- **Uninstalling (Windows):** Settings → Apps → SHiFT Redeemer → Uninstall.

## Where codes come from

| Source | What it is |
| --- | --- |
| Community code feed | [`ugoogalizer/autoshift-codes`](https://github.com/ugoogalizer/autoshift-codes): every known code with game, reward and expiry (data from MentalMars) |
| MentalMars | The per-game code tables, read directly to catch new codes early |
| Steam news | Official announcements for each game |
| Reddit | Recent "SHiFT code" posts in the Borderlands subreddits |
| Steam Community guides | Popular "SHiFT codes" guides for each game |
| OzBargain | Deals and posts that mention Borderlands SHiFT codes |
| Your own | Add any web page, or paste codes you found anywhere (tweets, Discord, …) |

---

## For developers

This is a zero-runtime-dependency Node.js app (a local web server plus a browser UI). Releases package the app and a Node runtime into one executable, using Node's [single executable applications](https://nodejs.org/api/single-executable-applications.html) feature.

```bash
npm install        # dev tools only (esbuild, postject, rcedit)
npm start          # run from source → http://localhost:4777
npm test           # end-to-end tests against a mock SHiFT server
npm run build      # build the app for the current OS into dist/
npm run smoke      # launch the built app and test it end-to-end
npm run mock       # mock SHiFT server on :4999 (vault@hunter.test / hunter2)
```

### Making a release

Every push builds and smoke-tests Windows, macOS and Linux apps on GitHub Actions; the builds are downloadable from the run's **Artifacts**. To publish a release, do one of:

- **Actions** tab → **Build apps** → **Run workflow** → enter a version such as `1.1.0`, or
- push a tag: `git tag v1.1.0 && git push origin v1.1.0`

The workflow builds every platform, tests the apps and the Windows installer (silent install, launch, uninstall), then creates a GitHub Release with all the downloads and install instructions attached.

### How it fits together

| Path | Role |
| --- | --- |
| `server.js` | Local HTTP server and API, single-instance handling, app window lifecycle |
| `lib/shift.js` | SHiFT website client (sign-in, code check, redemption) |
| `lib/engine.js` | Queue, targeting, redemption runs, auto-pilot scheduler |
| `lib/sources.js` | Code discovery |
| `lib/runtime.js` | Packaged-app behaviour (data folder, app window, start with computer, update check) |
| `public/` | UI (no build step) |
| `scripts/build.mjs` | Packages the single-file app for the current OS |
| `packaging/windows/installer.iss` | Windows installer (Inno Setup, per-user, no admin prompt) |

The installed app stores its data in `%APPDATA%\SHiFT Redeemer` (Windows), `~/Library/Application Support/SHiFT Redeemer` (macOS) or `~/.local/share/shift-redeemer` (Linux). When run from source it uses `./data`.

Environment overrides: `PORT`, `DATA_DIR`, `NO_OPEN=1`, `NO_UPDATE_CHECK=1`, `SHIFT_BASE_URL` (point at the mock for testing).

Credit: the SHiFT request flow is based on [Fabbi/autoshift](https://github.com/Fabbi/autoshift).
