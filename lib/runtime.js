// Everything that differs between "developer running node server.js" and
// "regular user double-clicking the packaged app".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import * as sea from 'node:sea';

export const APP_NAME = 'SHiFT Redeemer';
export const REPO = 'approved48/shift-redeemer';

/** True when running as the packaged single-file app. */
export const isPackaged = (() => {
  try {
    return sea.isSea();
  } catch {
    return false;
  }
})();

/* global __APP_VERSION__ */
export const VERSION =
  typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : (() => {
        try {
          return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
        } catch {
          return '0.0.0';
        }
      })();

/** Read a UI file embedded in the packaged app. */
export function getAsset(name) {
  try {
    return Buffer.from(sea.getAsset(name));
  } catch {
    return null;
  }
}

/** Per-user folder for settings, codes and the session (writable without admin rights). */
export function appDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_NAME);
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', APP_NAME);
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'shift-redeemer');
}

// ------------------------------------------------------------------ logging

let logFile = null;

export function initLog(dir) {
  if (!isPackaged) return;
  logFile = path.join(dir, 'app.log');
  try {
    if (fs.statSync(logFile).size > 2_000_000) fs.renameSync(logFile, `${logFile}.old`);
  } catch {
    /* no log yet */
  }
}

// The packaged Windows app has no console window, so never touch stdout there.
const consoleOk = !isPackaged || process.platform !== 'win32';

export function out(line) {
  if (logFile) {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* disk full or locked — ignore */
    }
  }
  if (consoleOk) {
    try {
      console.log(line);
    } catch {
      /* no console */
    }
  }
}

// ------------------------------------------------------------------ windows

function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, cmd);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** A Chromium-based browser that can show the UI as a standalone app window. */
function findAppBrowser() {
  const c = [];
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots) c.push(path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    for (const r of roots) c.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    for (const r of roots) c.push(path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  } else if (process.platform === 'darwin') {
    for (const root of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      c.push(`${root}/Google Chrome.app/Contents/MacOS/Google Chrome`);
      c.push(`${root}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`);
      c.push(`${root}/Brave Browser.app/Contents/MacOS/Brave Browser`);
      c.push(`${root}/Chromium.app/Contents/MacOS/Chromium`);
    }
  } else {
    for (const cmd of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
      const p = onPath(cmd);
      if (p) c.push(p);
    }
  }
  return c.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function launch(cmd, args, hide = true) {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: hide });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Open a URL in the user's default browser. */
export function openInBrowser(url) {
  if (process.platform === 'win32') return launch('rundll32', ['url.dll,FileProtocolHandler', url]);
  if (process.platform === 'darwin') return launch('open', [url]);
  return launch('xdg-open', [url]);
}

/** Open the UI in its own app-style window (Edge/Chrome), falling back to a normal browser tab. */
export async function openAppWindow(url) {
  const browser = findAppBrowser();
  if (browser && (await launch(browser, [`--app=${url}`, '--window-size=1320,900', '--no-first-run', '--no-default-browser-check'], false))) return 'window';
  await openInBrowser(url);
  return 'browser';
}

/** Open a folder in Explorer / Finder. */
export function revealFolder(dir) {
  if (process.platform === 'win32') return launch('explorer.exe', [dir], false);
  if (process.platform === 'darwin') return launch('open', [dir]);
  return launch('xdg-open', [dir]);
}

// ------------------------------------------------------------------ start with computer

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const MAC_AGENT = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.github.shiftredeemer.plist');
const LINUX_DESKTOP = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'shift-redeemer.desktop');

const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout || '') })));

export const autostartSupported = isPackaged;

export async function getAutostart() {
  if (!autostartSupported) return false;
  if (process.platform === 'win32') return (await run('reg', ['query', RUN_KEY, '/v', APP_NAME])).ok;
  if (process.platform === 'darwin') return fs.existsSync(MAC_AGENT);
  return fs.existsSync(LINUX_DESKTOP);
}

export async function setAutostart(on) {
  if (!autostartSupported) throw new Error('Only available in the installed app');
  const exe = process.execPath;
  if (process.platform === 'win32') {
    const r = on
      ? await run('reg', ['add', RUN_KEY, '/v', APP_NAME, '/t', 'REG_SZ', '/d', `"${exe}" --background`, '/f'])
      : await run('reg', ['delete', RUN_KEY, '/v', APP_NAME, '/f']);
    if (!r.ok && on) throw new Error('Could not update Windows startup settings');
  } else if (process.platform === 'darwin') {
    if (on) {
      fs.mkdirSync(path.dirname(MAC_AGENT), { recursive: true });
      fs.writeFileSync(
        MAC_AGENT,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.github.shiftredeemer</string>
  <key>ProgramArguments</key><array><string>${exe.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string><string>--background</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`,
      );
    } else fs.rmSync(MAC_AGENT, { force: true });
  } else if (on) {
    fs.mkdirSync(path.dirname(LINUX_DESKTOP), { recursive: true });
    fs.writeFileSync(LINUX_DESKTOP, `[Desktop Entry]\nType=Application\nName=${APP_NAME}\nExec="${exe}" --background\nX-GNOME-Autostart-enabled=true\n`);
  } else fs.rmSync(LINUX_DESKTOP, { force: true });
  return getAutostart();
}

// ------------------------------------------------------------------ updates

function newer(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

/** Returns { version, url } when a newer release is published on GitHub, else null. */
export async function checkForUpdate() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'shift-redeemer-update-check' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/i, '');
    return latest && newer(latest, VERSION) ? { version: latest, url: j.html_url } : null;
  } catch {
    return null;
  }
}
