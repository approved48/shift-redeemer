## What's new
- **Getting started is clearer.** A big **Start setup** button, and a short **walkthrough** of the app after setup. Skip it and it stays off. Turn it back on any time in **Settings → Data & display**.
- **Fits big screens.** A new **Display size** setting. **Automatic** scales the app up on large, high-resolution and ultrawide monitors and adjusts when you move the window to another screen. Or pick 90–150%.
- **Easier game and platform picking.** Unticking one while "All" is on switches to **Pick** with everything else still ticked.
- **Counts that agree.** Every dashboard number follows the games and platforms you picked, the per-game tiles match, and "Done" means the same thing everywhere.
- **Auto-pilot answers.** Little **?** buttons next to auto-pilot open the right help, with new answers to the most common questions.
- **Auto-pilot on a schedule.** Run every few hours, or on set days and times, e.g. **every Wednesday at 3:00** while you're asleep (your computer's clock).
- **New Settings layout.** A menu on the left (Auto-pilot, Game launching, Pace, Updates, Display & data) and one section at a time on the right.
- **Gentler on SHiFT.** Requests are never closer than 3 seconds apart, the default is now 10 seconds, and below 10 the app suggests slowing down. New **Smart pace** adjusts between 4 and 18 seconds: quicker through dead codes, slower while redeeming.
- **Better game launches (Windows).** Games start **muted**, the app presses Enter to get past the title screen so SHiFT notices the game, and it closes everything it started, including the 2K launcher. If the 2K launcher gets in the way, the app tells you how to skip it. While auto-pilot is on, the dashboard shows whether games will be closed and muted, with one-click switches.

If you have 1.4.0 or newer, select **Update now** when the app offers it.

## Download

> 👉 **On Windows? Download `SHiFT-Redeemer-Setup-{{VERSION}}-Windows.exe`** from **Assets** below, open it and click through. That's the right choice for almost everyone.

| Your computer | Download this | Why |
| --- | --- | --- |
| **Windows 10 / 11** ⭐ | **`SHiFT-Redeemer-Setup-{{VERSION}}-Windows.exe`** | Installs like any app, no admin password, Start menu shortcut, updates itself |
| Windows, can't install | `SHiFT-Redeemer-{{VERSION}}-Windows-Portable.exe` | One file, nothing installed: for work PCs or USB sticks |
| **Mac** (Apple Silicon or Intel) | **`SHiFT-Redeemer-{{VERSION}}-macOS.dmg`** | Drag into Applications |
| Linux | `SHiFT-Redeemer-{{VERSION}}-Linux-x64.tar.gz` | Extract and run |

The files without a version number are the same downloads under a fixed name (used by the links in the README). The **Source code** files are for developers; you don't need them. Nothing else to install: everything the app needs is included.

## Install

**Windows**
1. Run `SHiFT-Redeemer-Setup-{{VERSION}}-Windows.exe`.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. This appears because the app isn't code-signed, which costs money and isn't worth it for a free fan tool.
3. Click through the installer. SHiFT Redeemer opens when it finishes, and it's in your Start menu from then on.

**Mac**
1. Open the `.dmg` and drag **SHiFT Redeemer** into **Applications**.
2. The first time, **right-click** the app and choose **Open**, then click **Open** again.
3. If macOS says it "can't be opened", go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.

**Linux**
1. Extract the archive.
2. Double-click `shift-redeemer`, or run `./shift-redeemer`.
3. Optional: run `./install-desktop-entry.sh` to add it to your applications menu.

## First run
1. **Sign in** with your SHiFT email and password.
2. **Pick your games and platforms**, or leave everything selected.
3. Tell setup whether you'll **play Borderlands while it runs**.
4. Press **Find & redeem**.

**Keep me signed in** stores your password in **Windows Credential Manager** or the **macOS Keychain**, never in a plain file. If secure storage isn't available, the app asks you first and warns you before saving anything unencrypted.

**Updating:** from 1.4.0 on, the app updates itself: select **Update now** when it tells you a new version is out. For older versions, install the new version over the old one once. Your codes and settings are always kept.

*Free, non-commercial fan tool. Not affiliated with Gearbox Software, 2K or Take-Two.*
