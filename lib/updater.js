// In-app updates: find the newest GitHub release, download the right file for this computer,
// check it, then hand over to a tiny helper script that waits for the app to quit, installs the
// update and opens the app again.
//
//   Windows, installed  → runs the Setup .exe silently (per-user, no admin prompt)
//   Windows, portable   → replaces the .exe it was started from
//   macOS               → mounts the .dmg and replaces the .app bundle
//   Linux               → unpacks the .tar.gz over the app's folder

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { REPO, VERSION, isPackaged } from './runtime.js';

// Overridable for tests (a local server pretending to be GitHub).
const API = () => process.env.SHIFT_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;

export function newer(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

/** How this copy of the app is installed, which decides how it updates. */
export function installKind({ platform = process.platform, execPath = process.execPath, packaged = isPackaged, env = process.env } = {}) {
  if (!packaged) return { kind: 'source', target: null };
  if (platform === 'win32') {
    const programs = path.win32.join(env.LOCALAPPDATA || path.win32.join(os.homedir(), 'AppData', 'Local'), 'Programs').toLowerCase();
    const installed = path.win32.dirname(execPath).toLowerCase().startsWith(programs);
    return { kind: installed ? 'windows-installer' : 'windows-portable', target: execPath };
  }
  if (platform === 'darwin') {
    const m = execPath.match(/^(.*?\.app)\/Contents\/MacOS\//);
    return { kind: m ? 'macos' : 'source', target: m ? m[1] : null };
  }
  return { kind: 'linux', target: path.dirname(execPath) };
}

const ASSET_RX = {
  'windows-installer': /^SHiFT-Redeemer-Setup-.*-Windows\.exe$/i,
  'windows-portable': /^SHiFT-Redeemer-.*-Windows-Portable\.exe$/i,
  macos: /^SHiFT-Redeemer-.*-macOS\.dmg$/i,
  linux: /^SHiFT-Redeemer-.*-Linux-x64\.tar\.gz$/i,
};

/** The download for this computer from a release's assets. */
export function pickAsset(assets, kind) {
  const rx = ASSET_RX[kind];
  return rx ? (assets || []).find((a) => rx.test(a.name)) || null : null;
}

/** Only the "What's new" part of the release notes (or the start of them). */
export function whatsNew(body) {
  const text = String(body || '');
  const m = text.match(/##\s*What'?s new\s*\n([\s\S]*?)(?:\n##\s|$)/i);
  return (m ? m[1] : text.split(/\n##\s/)[0]).trim().slice(0, 4000);
}

/** Can this copy replace itself? Returns a reason when it can't. */
function writableReason(kind, target) {
  if (kind === 'source') return 'You’re running SHiFT Redeemer from source. Update it with git pull.';
  try {
    const dir = kind === 'linux' ? target : path.dirname(target);
    fs.accessSync(dir, fs.constants.W_OK);
    return null;
  } catch {
    return kind === 'macos'
      ? 'SHiFT Redeemer can’t replace itself in this folder. Download the update and drag it into Applications instead.'
      : 'SHiFT Redeemer can’t write to the folder it’s in. Download the update instead.';
  }
}

/** Ask GitHub for the newest release. Returns null if there isn't a newer one (or on any error). */
export async function checkLatest({ current = VERSION } = {}) {
  const r = await fetch(API(), {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'shift-redeemer-updater' },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404) throw new Error('no published releases were found on GitHub');
  if (r.status === 403 || r.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a little while');
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const j = await r.json();
  const version = String(j.tag_name || '').replace(/^v/i, '');
  if (!version || !newer(version, current)) return null;
  const { kind, target } = installKind();
  const asset = pickAsset(j.assets, kind);
  const reason = writableReason(kind, target) || (asset ? null : 'This release has no download for your computer yet.');
  return {
    version,
    url: j.html_url,
    notes: whatsNew(j.body),
    publishedAt: j.published_at || null,
    kind,
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size, digest: asset.digest || null } : null,
    canInstall: !reason,
    reason,
  };
}

/** Download an asset to a temp folder, checking its size and SHA-256. onProgress(0..1). */
export async function download(asset, { dir = path.join(os.tmpdir(), 'shift-redeemer-update'), onProgress = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(asset.name));
  const part = `${file}.part`;
  const res = await fetch(asset.url, { headers: { 'user-agent': 'shift-redeemer-updater', accept: 'application/octet-stream' }, signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(part);
  let got = 0;
  let last = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (total && (got - last > total / 100 || got === total)) {
        last = got;
        onProgress(Math.min(1, got / total));
      }
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  } catch (e) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw e;
  }
  const sha = hash.digest('hex');
  if (asset.size && got !== asset.size) {
    fs.rmSync(part, { force: true });
    throw new Error(`Download was incomplete (${got} of ${asset.size} bytes)`);
  }
  const want = String(asset.digest || '').replace(/^sha256:/i, '').toLowerCase();
  if (want && want !== sha) {
    fs.rmSync(part, { force: true });
    throw new Error('The download didn’t match its published checksum, so it wasn’t installed');
  }
  fs.renameSync(part, file);
  onProgress(1);
  return { file, sha256: sha };
}

// ------------------------------------------------------------------ hand-over helpers

const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** The helper script that installs the update once this process has quit. Exported for tests. */
export function helperScript({ kind, file, target, pid, relaunchArgs = [] }) {
  if (kind === 'windows-installer' || kind === 'windows-portable') {
    const args = relaunchArgs.length ? `-ArgumentList ${relaunchArgs.map(psq).join(',')}` : '';
    const install =
      kind === 'windows-installer'
        ? `$p = Start-Process -FilePath ${psq(file)} -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-' -Wait -PassThru
if ($p.ExitCode -ne 0) { $ok = $false }`
        : `$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) { try { Copy-Item -LiteralPath ${psq(file)} -Destination ${psq(target)} -Force -ErrorAction Stop; $ok = $true } catch { Start-Sleep -Milliseconds 500 } }`;
    return `$ErrorActionPreference = 'SilentlyContinue'
$ok = $true
try { Wait-Process -Id ${Number(pid)} -Timeout 60 } catch {}
Start-Sleep -Milliseconds 500
${install}
Start-Process -FilePath ${psq(target)} ${args}
Remove-Item -LiteralPath ${psq(file)} -Force
`;
  }
  const relaunch = relaunchArgs.map(shq).join(' ');
  if (kind === 'macos') {
    return `#!/bin/sh
while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.3; done
MNT="$(mktemp -d)"
APP=${shq(target)}
if hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$MNT" ${shq(file)}; then
  NEW="$(find "$MNT" -maxdepth 1 -name '*.app' | head -n 1)"
  if [ -n "$NEW" ] && ditto "$NEW" "$APP.updating"; then
    rm -rf "$APP.old" && mv "$APP" "$APP.old" && mv "$APP.updating" "$APP" && rm -rf "$APP.old"
  fi
  rm -rf "$APP.updating"
  hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
fi
[ -d "$APP" ] || mv "$APP.old" "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
rm -f ${shq(file)}
"$APP/Contents/MacOS/shift-redeemer" ${relaunch} >/dev/null 2>&1 &
`;
  }
  return `#!/bin/sh
while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.3; done
TMP="$(mktemp -d)"
DIR=${shq(target)}
if tar -xzf ${shq(file)} -C "$TMP" && [ -x "$TMP/SHiFT-Redeemer/shift-redeemer" ]; then
  cp -f "$TMP/SHiFT-Redeemer/"* "$DIR/"
fi
rm -rf "$TMP" ${shq(file)}
nohup "$DIR/shift-redeemer" ${relaunch} >/dev/null 2>&1 &
`;
}

/** Start the helper (detached) so it outlives this process. The caller then quits. */
export function startHelper({ kind, file, target, relaunchArgs }) {
  const script = helperScript({ kind, file, target, pid: process.pid, relaunchArgs });
  if (kind.startsWith('windows')) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  const sh = path.join(path.dirname(file), 'apply-update.sh');
  fs.writeFileSync(sh, script, { mode: 0o755 });
  spawn('/bin/sh', [sh], { detached: true, stdio: 'ignore' }).unref();
}
