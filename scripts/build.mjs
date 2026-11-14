// Builds the self-contained app for the OS this runs on:
//   Windows → dist/build/SHiFT Redeemer.exe  (+ portable copy in dist/release)
//   macOS   → dist/release/SHiFT-Redeemer-<v>-macOS.dmg  (universal: Apple Silicon + Intel)
//   Linux   → dist/release/SHiFT-Redeemer-<v>-Linux-x64.tar.gz
//
// It bundles the app into one script, embeds the UI files, and injects both into a copy of
// the Node.js runtime (Node "single executable applications"). End users need nothing else.
//
// Usage: npm run build            (APP_VERSION=1.2.3 to override the version)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'dist', 'build');
const RELEASE = path.join(ROOT, 'dist', 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = (process.env.APP_VERSION || pkg.version).replace(/^v/i, '');
const NAME = 'SHiFT Redeemer';
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const POSTJECT = path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js');

const sh = (cmd, args, opts = {}) => {
  console.log(`  $ ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
};
const step = (s) => console.log(`\n▶ ${s}`);

fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(RELEASE, { recursive: true });

// ---------------------------------------------------------------- 1. bundle
step(`Bundling app v${VERSION}`);
const bundle = path.join(BUILD, 'app.cjs');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'server.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${process.versions.node.split('.')[0]}`,
  outfile: bundle,
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    'import.meta.url': JSON.stringify('file:///shift-redeemer/server.js'),
  },
  legalComments: 'none',
  logLevel: 'warning',
});

// ---------------------------------------------------------------- 2. SEA blob with embedded UI
step('Creating single-executable blob (UI files embedded)');
const assets = {};
const walk = (dir, prefix = '') => {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const rel = prefix ? `${prefix}/${f}` : f;
    if (fs.statSync(full).isDirectory()) walk(full, rel);
    else assets[rel] = full;
  }
};
walk(path.join(ROOT, 'public'));
console.log(`  embedding ${Object.keys(assets).length} files: ${Object.keys(assets).join(', ')}`);
const blob = path.join(BUILD, 'sea.blob');
const seaConfig = path.join(BUILD, 'sea-config.json');
fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets }, null, 2),
);
sh(process.execPath, ['--experimental-sea-config', seaConfig]);

function inject(binary, macho = false) {
  const args = [POSTJECT, binary, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE, '--overwrite'];
  if (macho) args.push('--macho-segment-name', 'NODE_SEA');
  sh(process.execPath, args);
}

// ---------------------------------------------------------------- 3. per-OS packaging
if (process.platform === 'win32') {
  step('Building Windows app');
  const exe = path.join(BUILD, `${NAME}.exe`);
  fs.copyFileSync(process.execPath, exe);

  // Strip Node's own Authenticode signature (it becomes invalid once we modify the file).
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  const signtool = fs.existsSync(kits)
    ? fs
        .readdirSync(kits)
        .filter((d) => /^10\./.test(d))
        .sort()
        .reverse()
        .map((d) => path.join(kits, d, 'x64', 'signtool.exe'))
        .find((p) => fs.existsSync(p))
    : null;
  if (signtool) {
    try {
      sh(signtool, ['remove', '/s', exe]);
    } catch {
      console.log('  (could not remove signature — continuing)');
    }
  }

  // App icon + name shown in Explorer, Task Manager and the uninstaller.
  const { rcedit } = await import('rcedit');
  const [maj, min, pat] = VERSION.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  await rcedit(exe, {
    icon: path.join(ROOT, 'assets', 'icon.ico'),
    'file-version': `${maj}.${min}.${pat}.0`,
    'product-version': `${maj}.${min}.${pat}.0`,
    'version-string': {
      ProductName: NAME,
      FileDescription: NAME,
      CompanyName: 'SHiFT Redeemer (unofficial fan tool)',
      LegalCopyright: 'Free, non-commercial. Not affiliated with Gearbox Software.',
      OriginalFilename: `${NAME}.exe`,
      InternalName: 'shift-redeemer',
    },
  });

  inject(exe);
  setWindowsGuiSubsystem(exe);
  fs.copyFileSync(exe, path.join(RELEASE, `SHiFT-Redeemer-${VERSION}-Windows-Portable.exe`));
  console.log(`\n✔ ${exe}\n  Installer: run ISCC on packaging/windows/installer.iss (done automatically in CI)`);
} else if (process.platform === 'darwin') {
  step('Building macOS app (universal)');
  const slices = [];
  for (const arch of ['arm64', 'x64']) {
    const bin = path.join(BUILD, `node-${arch}`);
    if (arch === process.arch) fs.copyFileSync(process.execPath, bin);
    else {
      const tgz = path.join(BUILD, `node-${arch}.tar.gz`);
      const url = `https://nodejs.org/dist/${process.version}/node-${process.version}-darwin-${arch}.tar.gz`;
      console.log(`  downloading ${url}`);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
      fs.writeFileSync(tgz, Buffer.from(await r.arrayBuffer()));
      sh('tar', ['-xzf', tgz, '-C', BUILD, `node-${process.version}-darwin-${arch}/bin/node`]);
      fs.renameSync(path.join(BUILD, `node-${process.version}-darwin-${arch}`, 'bin', 'node'), bin);
    }
    fs.chmodSync(bin, 0o755);
    sh('codesign', ['--remove-signature', bin]);
    inject(bin, true);
    slices.push(bin);
  }
  const app = path.join(BUILD, `${NAME}.app`);
  const macos = path.join(app, 'Contents', 'MacOS');
  const res = path.join(app, 'Contents', 'Resources');
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(res, { recursive: true });
  sh('lipo', ['-create', '-output', path.join(macos, 'shift-redeemer'), ...slices]);
  fs.copyFileSync(path.join(ROOT, 'assets', 'icon.icns'), path.join(res, 'AppIcon.icns'));
  fs.writeFileSync(
    path.join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${NAME}</string>
  <key>CFBundleDisplayName</key><string>${NAME}</string>
  <key>CFBundleIdentifier</key><string>com.github.shiftredeemer</string>
  <key>CFBundleExecutable</key><string>shift-redeemer</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`,
  );
  sh('codesign', ['--force', '--deep', '--sign', '-', app]);
  // Disk image with the classic "drag to Applications" layout.
  const stage = path.join(BUILD, 'dmg');
  fs.mkdirSync(stage);
  sh('cp', ['-R', app, stage]);
  fs.symlinkSync('/Applications', path.join(stage, 'Applications'));
  const dmg = path.join(RELEASE, `SHiFT-Redeemer-${VERSION}-macOS.dmg`);
  sh('hdiutil', ['create', '-volname', NAME, '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg]);
  console.log(`\n✔ ${dmg}`);
} else {
  step('Building Linux app');
  const dir = path.join(BUILD, 'SHiFT-Redeemer');
  fs.mkdirSync(dir);
  const bin = path.join(dir, 'shift-redeemer');
  fs.copyFileSync(process.execPath, bin);
  fs.chmodSync(bin, 0o755);
  inject(bin);
  fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(dir, 'shift-redeemer.png'));
  fs.writeFileSync(
    path.join(dir, 'README.txt'),
    `SHiFT Redeemer ${VERSION}\n\nDouble-click "shift-redeemer" (or run ./shift-redeemer) to start.\nThe app opens in Chrome/Chromium/Edge if installed, otherwise your default browser.\n\nOptional: run ./install-desktop-entry.sh to add it to your applications menu.\n`,
  );
  const installer = path.join(dir, 'install-desktop-entry.sh');
  fs.writeFileSync(
    installer,
    `#!/bin/sh\n# Adds SHiFT Redeemer to your desktop's application menu.\nDIR="$(cd "$(dirname "$0")" && pwd)"\nmkdir -p "$HOME/.local/share/applications"\ncat > "$HOME/.local/share/applications/shift-redeemer.desktop" <<EOF\n[Desktop Entry]\nType=Application\nName=${NAME}\nComment=Find and redeem SHiFT codes\nExec="$DIR/shift-redeemer"\nIcon=$DIR/shift-redeemer.png\nTerminal=false\nCategories=Game;Utility;\nEOF\necho "Added ${NAME} to your applications menu."\n`,
  );
  fs.chmodSync(installer, 0o755);
  const tgz = path.join(RELEASE, `SHiFT-Redeemer-${VERSION}-Linux-x64.tar.gz`);
  sh('tar', ['-czf', tgz, '-C', BUILD, 'SHiFT-Redeemer']);
  console.log(`\n✔ ${bin}\n✔ ${tgz}`);
}

/** Mark a Windows .exe as a GUI app so double-clicking it doesn't open a console window. */
function setWindowsGuiSubsystem(file) {
  const fd = fs.openSync(file, 'r+');
  try {
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, 0x3c);
    const pe = b.readUInt32LE(0);
    fs.readSync(fd, b, 0, 4, pe);
    if (b.toString('binary') !== 'PE\0\0') throw new Error('Not a PE file');
    const field = pe + 4 + 20 + 68; // PE signature + COFF header + offset of Subsystem in the optional header
    const s = Buffer.alloc(2);
    s.writeUInt16LE(2); // IMAGE_SUBSYSTEM_WINDOWS_GUI
    fs.writeSync(fd, s, 0, 2, field);
  } finally {
    fs.closeSync(fd);
  }
  console.log('  set Windows GUI subsystem (no console window)');
}
