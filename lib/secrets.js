// Secure password storage using what the operating system already provides:
//   Windows → Credential Manager (Generic Credential, via the Win32 Cred* API from PowerShell)
//   macOS   → Keychain (via /usr/bin/security)
//   Linux   → Secret Service, i.e. GNOME Keyring / KWallet (via secret-tool, if installed)
// No native modules or extra installs. Secrets are always passed over stdin, never on the
// command line, so other programs can't see them in the process list.
//
// SHIFT_SECRETS=memory|unavailable switches to a fake backend (used by the tests).

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const SERVICE = `SHiFT Redeemer${process.env.SHIFT_SECRETS_NAMESPACE ? ` ${process.env.SHIFT_SECRETS_NAMESPACE}` : ''}`;
const TIMEOUT = 30_000;

export class SecureStoreError extends Error {}

function run(cmd, args, input) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { windowsHide: true, timeout: TIMEOUT, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), err }),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

const firstLine = (s) => String(s || '').trim().split(/\r?\n/).pop()?.slice(0, 200) || '';

// ------------------------------------------------------------------ Windows

const WIN_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SrCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWriteW(ref CREDENTIAL c, int flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredReadW(string target, int type, int flags, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDeleteW(string target, int type, int flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static void Write(string target, string user, string secret) {
    byte[] b = Encoding.Unicode.GetBytes(secret);
    CREDENTIAL c = new CREDENTIAL();
    c.Type = 1; c.TargetName = target; c.UserName = user; c.Persist = 2;
    c.Comment = "Saved by SHiFT Redeemer so auto-pilot can sign in to SHiFT.";
    c.CredentialBlobSize = b.Length; c.CredentialBlob = Marshal.AllocHGlobal(b.Length);
    try {
      Marshal.Copy(b, 0, c.CredentialBlob, b.Length);
      if (!CredWriteW(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static string Read(string target) {
    IntPtr p;
    if (!CredReadW(target, 1, 0, out p)) return null;
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if (c.CredentialBlobSize == 0) return "";
      byte[] b = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, b, 0, b.Length);
      return Encoding.Unicode.GetString(b);
    } finally { CredFree(p); }
  }
  public static void Delete(string target) { CredDeleteW(target, 1, 0); }
}
"@
  # Write directly to stdout: PowerShell's normal output wraps long lines when redirected.
  function Emit([string]$s) { [Console]::Out.Write($s); [Console]::Out.Flush() }
  $req = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $secret = ''
  if ($req.secret) { $secret = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($req.secret)) }
  switch ($req.op) {
    'probe'  { Emit 'OK' }
    'write'  { [SrCred]::Write($req.target, $req.user, $secret); Emit 'OK' }
    'read'   { $v = [SrCred]::Read($req.target); if ($null -eq $v) { Emit 'NONE' } else { Emit ('VAL:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($v))) } }
    'delete' { [SrCred]::Delete($req.target); Emit 'OK' }
  }
} catch {
  [Console]::Out.Write('ERR:' + $_.Exception.Message)
  exit 3
}
`;
const WIN_ENCODED = Buffer.from(WIN_SCRIPT, 'utf16le').toString('base64');

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  const p = path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(p) ? p : 'powershell.exe';
}

async function win(op, account, secret) {
  const req = { op, target: `${SERVICE}/${account}`, user: account, secret: secret == null ? '' : Buffer.from(secret, 'utf8').toString('base64') };
  const r = await run(powershellPath(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', WIN_ENCODED], JSON.stringify(req));
  const err = r.stdout.indexOf('ERR:');
  if (!r.ok || err >= 0) {
    const msg = err >= 0 ? r.stdout.slice(err + 4).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    throw new SecureStoreError(msg || firstLine(r.stderr) || `PowerShell exited with code ${r.code}`);
  }
  // Base64/status tokens never contain whitespace, so drop any line breaks that slipped in.
  return r.stdout.replace(/\s+/g, '');
}

const windowsBackend = {
  id: 'wincred',
  name: 'Windows Credential Manager',
  where: 'Windows Credential Manager (Control Panel → Credential Manager → Windows Credentials)',
  async available() {
    return { ok: true };
  },
  async save(account, secret) {
    await win('write', account, secret);
  },
  async load(account) {
    const v = await win('read', account);
    return v.startsWith('VAL:') ? Buffer.from(v.slice(4), 'base64').toString('utf8') : null;
  },
  async remove(account) {
    await win('delete', account);
  },
};

// ------------------------------------------------------------------ macOS

const SECURITY = '/usr/bin/security';
// Stored as "b64:<base64>" so any password (quotes, spaces, unicode) round-trips exactly.
// `security -i` splits its input on whitespace, so the service and account names used with it
// must never contain spaces or quotes — and every call must use exactly the same names.
const MAC_SERVICE = SERVICE.replace(/[^A-Za-z0-9._@+-]+/g, '-');
const macAccount = (a) => String(a).replace(/[^A-Za-z0-9._@+-]+/g, '-');

const macBackend = {
  id: 'keychain',
  name: 'macOS Keychain',
  where: 'your macOS login Keychain (Keychain Access → "SHiFT-Redeemer")',
  async available() {
    return fs.existsSync(SECURITY) ? { ok: true } : { ok: false, reason: 'the macOS security tool was not found' };
  },
  async save(account, secret) {
    const hex = Buffer.from(`b64:${Buffer.from(secret, 'utf8').toString('base64')}`, 'utf8').toString('hex');
    // Interactive mode reads the command from stdin, keeping the secret off the command line.
    const r = await run(SECURITY, ['-i'], `add-generic-password -U -a ${macAccount(account)} -s ${MAC_SERVICE} -X ${hex}\n`);
    if (!r.ok) throw new SecureStoreError(firstLine(r.stderr) || 'Keychain refused the password');
    // `security -i` doesn't always report failures through its exit code — verify.
    if ((await this.load(account)) !== secret) {
      throw new SecureStoreError(firstLine(r.stderr) || firstLine(r.stdout) || 'Keychain did not store the password');
    }
  },
  async load(account) {
    const r = await run(SECURITY, ['find-generic-password', '-a', macAccount(account), '-s', MAC_SERVICE, '-w']);
    if (!r.ok) return null;
    const v = r.stdout.replace(/\r?\n$/, '');
    if (v.startsWith('b64:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
    return v;
  },
  async remove(account) {
    await run(SECURITY, ['delete-generic-password', '-a', macAccount(account), '-s', MAC_SERVICE]);
  },
};

// ------------------------------------------------------------------ Linux

function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) if (dir && fs.existsSync(path.join(dir, cmd))) return path.join(dir, cmd);
  return null;
}

const linuxBackend = {
  id: 'secret-service',
  name: 'your system keyring',
  where: 'your system keyring (GNOME Keyring / KWallet)',
  async available() {
    return onPath('secret-tool') ? { ok: true } : { ok: false, reason: 'no system keyring tool (secret-tool) is installed' };
  },
  async save(account, secret) {
    const tool = onPath('secret-tool');
    if (!tool) throw new SecureStoreError('no system keyring tool (secret-tool) is installed');
    const r = await run(tool, ['store', `--label=${SERVICE}`, 'service', SERVICE, 'account', account], secret);
    if (!r.ok) throw new SecureStoreError(firstLine(r.stderr) || 'the system keyring refused the password');
  },
  async load(account) {
    const tool = onPath('secret-tool');
    if (!tool) return null;
    const r = await run(tool, ['lookup', 'service', SERVICE, 'account', account]);
    return r.ok && r.stdout ? r.stdout : null;
  },
  async remove(account) {
    const tool = onPath('secret-tool');
    if (tool) await run(tool, ['clear', 'service', SERVICE, 'account', account]);
  },
};

// ------------------------------------------------------------------ test backends

const memory = new Map();
const memoryBackend = {
  id: 'memory',
  name: 'Test vault',
  where: 'the test vault',
  async available() {
    return { ok: true };
  },
  async save(a, s) {
    memory.set(a, s);
  },
  async load(a) {
    return memory.has(a) ? memory.get(a) : null;
  },
  async remove(a) {
    memory.delete(a);
  },
};
const unavailableBackend = {
  id: 'none',
  name: 'Secure storage',
  where: '',
  async available() {
    return { ok: false, reason: 'secure storage is disabled for testing' };
  },
  async save() {
    throw new SecureStoreError('secure storage is disabled for testing');
  },
  async load() {
    return null;
  },
  async remove() {},
};

// ------------------------------------------------------------------ public API

export function backend() {
  if (process.env.SHIFT_SECRETS === 'memory') return memoryBackend;
  if (process.env.SHIFT_SECRETS === 'unavailable') return unavailableBackend;
  if (process.platform === 'win32') return windowsBackend;
  if (process.platform === 'darwin') return macBackend;
  return linuxBackend;
}

/** { id, name, where, available, reason } — a cheap check, safe to call at startup. */
export async function secureStoreInfo() {
  const b = backend();
  const a = await b.available().catch((e) => ({ ok: false, reason: e.message }));
  return { id: b.id, name: b.name, where: b.where, available: !!a.ok, reason: a.reason || null };
}

export async function saveSecret(account, secret) {
  const b = backend();
  const a = await b.available();
  if (!a.ok) throw new SecureStoreError(a.reason);
  await b.save(account, secret);
  return b.id;
}

export async function loadSecret(account) {
  try {
    return await backend().load(account);
  } catch {
    return null;
  }
}

export async function deleteSecret(account) {
  try {
    await backend().remove(account);
  } catch {
    /* already gone */
  }
}
