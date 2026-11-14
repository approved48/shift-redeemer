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

// Launchers some Steam versions show before the game itself (the 2K launcher). If one opens, the
// game won't start until someone clicks Play, so we tell the user how to skip it.
export const isLauncher = (name) => /2k.*launcher|launcherpatcher/i.test(String(name));

export const procTitle = (name) => Object.entries(GAME_PROCS).find(([, names]) => names.some((n) => n.toLowerCase() === name.toLowerCase()))?.[0] || null;

/** Borderlands games running right now. */
export async function runningGames() {
  return (await listProcesses()).map((p) => ({ ...p, titleId: procTitle(p.name) })).filter((p) => p.titleId);
}

export async function closeProcess(pid) {
  if (process.platform === 'win32') {
    await run('taskkill', ['/PID', String(pid), '/T']);
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
  if (process.platform === 'win32') await run('taskkill', ['/PID', String(pid), '/T', '/F']);
  else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

// ------------------------------------------------------------------ Windows helpers (title screen, sound)

const ps = (script, timeout = 20_000) =>
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], timeout);

/**
 * Bring a game window we started to the front and press Enter, to get past "Press any key" and
 * intro screens to the main menu (where SHiFT registers the game). Windows only.
 */
export async function pressEnter(pid) {
  if (process.platform !== 'win32') return false;
  const out = await ps(`$w = New-Object -ComObject WScript.Shell
if ($w.AppActivate(${Number(pid)})) { Start-Sleep -Milliseconds 400; $w.SendKeys('~'); 'ok' } else { 'nowindow' }`);
  return out.trim() === 'ok';
}

const MUTE_CS = String.raw`using System;
using System.Runtime.InteropServices;
public static class SrAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int f, int s, out IntPtr d); [PreserveSig] int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 { [PreserveSig] int GetAudioSessionControl(IntPtr a, int b, out IntPtr c); [PreserveSig] int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int s); [PreserveSig] int GetDisplayName(out IntPtr n); [PreserveSig] int SetDisplayName(IntPtr n, IntPtr g);
    [PreserveSig] int GetIconPath(out IntPtr p); [PreserveSig] int SetIconPath(IntPtr p, IntPtr g); [PreserveSig] int GetGroupingParam(out Guid g);
    [PreserveSig] int SetGroupingParam(IntPtr g, IntPtr c); [PreserveSig] int RegisterAudioSessionNotification(IntPtr n); [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int GetSessionIdentifier(out IntPtr s); [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr s); [PreserveSig] int GetProcessId(out uint pid);
  }
  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume { [PreserveSig] int SetMasterVolume(float v, IntPtr g); [PreserveSig] int GetMasterVolume(out float v); [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, IntPtr g); }
  // Mutes every audio session belonging to one of the given processes. -1 = no audio device.
  public static int Mute(int[] pids) {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev;
    if (en.GetDefaultAudioEndpoint(0, 0, out dev) != 0 || dev == null) return -1;
    var iid = typeof(IAudioSessionManager2).GUID;
    object o;
    if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return -1;
    IAudioSessionEnumerator list;
    if (((IAudioSessionManager2)o).GetSessionEnumerator(out list) != 0) return -1;
    int n; list.GetCount(out n);
    int muted = 0;
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 s;
      if (list.GetSession(i, out s) != 0 || s == null) continue;
      uint pid; s.GetProcessId(out pid);
      if (Array.IndexOf(pids, (int)pid) >= 0) { ((ISimpleAudioVolume)s).SetMute(true, IntPtr.Zero); muted++; }
    }
    return muted;
  }
}`;

/** Mute the sound of the given processes (Windows per-app volume). Returns { ok, muted, error }. */
export async function muteProcesses(pids) {
  if (process.platform !== 'win32' || !pids.length) return { ok: false, muted: 0, error: 'not supported here' };
  const out = await ps(
    `$ErrorActionPreference = 'Stop'
try {
  if (-not ('SrAudio' -as [type])) { Add-Type -Language CSharp -TypeDefinition @'
${MUTE_CS}
'@ }
  $n = [SrAudio]::Mute([int[]]@(${pids.map(Number).join(',')}))
  "OK:$n"
} catch { "ERR:" + $_.Exception.Message }`,
    40_000,
  );
  const m = out.trim().match(/^(OK|ERR):(.*)$/m);
  if (!m) return { ok: false, muted: 0, error: out.trim() || 'no output' };
  return m[1] === 'OK' ? { ok: true, muted: Number(m[2]) } : { ok: false, muted: 0, error: m[2].trim() };
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
