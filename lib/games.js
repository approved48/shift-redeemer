// Launching a SHiFT-enabled game so SHiFT lifts its "launch a SHiFT-enabled title first" block.
//
// - Finds Borderlands games installed through Steam by reading Steam's own library files.
// - Launches through Steam (steam://rungameid/…) or a user-supplied launch link (e.g. an Epic
//   shortcut URL). Games can't be started invisibly — SHiFT needs them to actually boot.
// - Watches the process list to see the game start, and closes it again afterwards — but only
//   processes that appeared after we launched, never a game the user already had open.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { TITLES } from './catalog.js';
import { openInBrowser } from './runtime.js';

// Process names per title. Windows / Proton use the .exe; macOS ports use the bare name.
export const GAME_PROCS = {
  bl2: ['Borderlands2.exe', 'Borderlands2'],
  tps: ['BorderlandsPreSequel.exe', 'BorderlandsPreSequel'],
  bl1: ['BorderlandsGOTY.exe'],
  bl3: ['Borderlands3.exe', 'Borderlands3'],
  ttw: ['Wonderlands.exe'],
  bl4: ['Borderlands4.exe'],
};
// Older games boot fastest, so they're the best choice for a quick SHiFT check-in.
export const LAUNCH_ORDER = ['bl2', 'tps', 'bl1', 'bl3', 'ttw', 'bl4'];

const run = (cmd, args, timeout = 15_000) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : String(stdout))));

// ------------------------------------------------------------------ Steam detection

async function steamRoots() {
  const home = os.homedir();
  const roots = [];
  if (process.platform === 'win32') {
    const out = await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
    const m = out.match(/SteamPath\s+REG_\w+\s+(.+)/i);
    if (m) roots.push(m[1].trim());
    roots.push(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'));
    roots.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam'));
  } else if (process.platform === 'darwin') {
    roots.push(path.join(home, 'Library', 'Application Support', 'Steam'));
  } else {
    roots.push(path.join(home, '.steam', 'steam'), path.join(home, '.local', 'share', 'Steam'), path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'));
  }
  return [...new Set(roots.map((r) => path.normalize(r)))].filter((r) => fs.existsSync(path.join(r, 'steamapps')));
}

/** Library folders listed in Steam's libraryfolders.vdf. */
export function parseLibraryFolders(vdf) {
  return [...String(vdf).matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'));
}

export async function detectSteam() {
  const roots = await steamRoots();
  if (!roots.length) return { found: false, root: null, installed: [] };
  const libs = new Set();
  for (const r of roots) {
    libs.add(r);
    try {
      for (const p of parseLibraryFolders(fs.readFileSync(path.join(r, 'steamapps', 'libraryfolders.vdf'), 'utf8'))) libs.add(p);
    } catch {
      /* no extra libraries */
    }
  }
  const installed = TITLES.filter((t) => [...libs].some((lib) => fs.existsSync(path.join(lib, 'steamapps', `appmanifest_${t.steamAppId}.acf`)))).map((t) => t.id);
  return { found: true, root: roots[0], installed };
}

// ------------------------------------------------------------------ processes

/** Running processes as [{ pid, name }]. */
export async function listProcesses() {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/FO', 'CSV', '/NH']);
    return out
      .split(/\r?\n/)
      .map((l) => l.match(/^"([^"]+)","(\d+)"/))
      .filter(Boolean)
      .map((m) => ({ name: m[1], pid: Number(m[2]) }));
  }
  const out = await run('ps', ['-axo', 'pid=,args=']);
  return out
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), name: path.basename(m[2].split(/\s+-/)[0].trim().replace(/\\/g, '/')) }));
}

const procTitle = (name) => Object.entries(GAME_PROCS).find(([, names]) => names.some((n) => n.toLowerCase() === name.toLowerCase()))?.[0] || null;

/** Borderlands games running right now. */
export async function runningGames() {
  return (await listProcesses()).map((p) => ({ ...p, titleId: procTitle(p.name) })).filter((p) => p.titleId);
}

export async function closeProcess(pid) {
  if (process.platform === 'win32') {
    await run('taskkill', ['/PID', String(pid)]);
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
  }
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!(await listProcesses()).some((p) => p.pid === pid)) return;
  }
  // Still there (fullscreen games often ignore polite requests) — force it.
  if (process.platform === 'win32') await run('taskkill', ['/PID', String(pid), '/F']);
  else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

// ------------------------------------------------------------------ planning & launching

const titleName = (id) => TITLES.find((t) => t.id === id)?.name || id;

/**
 * Decide how to unblock the given SHiFT services.
 * Returns { ok: true, service, titleId, title, via, target } or { ok: false, reason }.
 */
export async function planLaunch(services, assist, steam) {
  const want = assist.game && assist.game !== 'auto' ? [assist.game] : LAUNCH_ORDER;
  if (services.includes('steam') || services.length === 0) {
    const pick = want.find((id) => steam.installed.includes(id));
    if (pick) {
      const t = TITLES.find((x) => x.id === pick);
      return { ok: true, service: 'steam', titleId: pick, title: t.name, via: 'Steam', target: `steam://rungameid/${t.steamAppId}` };
    }
  }
  if (services.includes('epic') && assist.epicLink) {
    return { ok: true, service: 'epic', titleId: null, title: 'your Epic game', via: 'Epic Games Launcher', target: assist.epicLink };
  }
  if (services.includes('steam') && !steam.found) return { ok: false, reason: "Steam wasn't found on this computer" };
  if (services.includes('steam')) return { ok: false, reason: assist.game !== 'auto' ? `${titleName(assist.game)} isn't installed through Steam` : 'No Borderlands game is installed through Steam' };
  if (services.includes('epic')) return { ok: false, reason: 'Add your Epic launch link in Settings → Game launch assist so the app can start it' };
  return { ok: false, reason: 'Console games (PlayStation, Xbox, Switch) can only be started on the console itself' };
}

export async function launch(target) {
  if (!/^(steam|com\.epicgames\.launcher|https?):\/\//i.test(target)) throw new Error('Unsupported launch link');
  const ok = await openInBrowser(target);
  if (!ok) throw new Error('The game launcher could not be opened');
}

export { titleName };
