// The Windows update helper. The app copies its own .exe to a temp folder and starts that copy with
// "--apply-update <job>". The copy waits for the app to quit, installs the update (runs the Setup
// silently, or replaces the portable .exe) and starts the app again. Using the app itself means no
// PowerShell or console window is involved, and nothing else has to be installed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export const encodeJob = (job) => Buffer.from(JSON.stringify(job), 'utf8').toString('base64');

/** Run one update job. Returns the outcome (also written to update.log next to the download). */
export async function run(arg) {
  const job = JSON.parse(Buffer.from(String(arg || ''), 'base64').toString('utf8'));
  const logFile = path.join(path.dirname(job.file || os.tmpdir()), 'update.log');
  const log = (m) => {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${m}\n`);
    } catch {
      /* best effort */
    }
  };
  log(`apply ${job.kind}: ${job.file} → ${job.target} (waiting for ${job.pid})`);

  for (let i = 0; i < 240 && job.pid && alive(job.pid); i++) await sleep(250);
  await sleep(500);

  let ok = false;
  if (job.kind === 'windows-installer') {
    const r = spawnSync(job.file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'], { windowsHide: true, timeout: 5 * 60_000 });
    ok = r.status === 0;
    log(`installer exited with ${r.status}${r.error ? ` (${r.error.message})` : ''}`);
  } else {
    for (let i = 0; i < 40 && !ok; i++) {
      try {
        fs.copyFileSync(job.file, job.target);
        ok = true;
      } catch (e) {
        if (i === 39) log(`couldn't replace the app: ${e.message}`);
        await sleep(500);
      }
    }
    log(ok ? 'replaced the app' : 'kept the old version');
  }

  // Start the app again either way: the new version, or the old one if something went wrong.
  try {
    spawn(job.target, job.relaunchArgs || [], { detached: true, stdio: 'ignore', cwd: path.dirname(job.target) }).unref();
    log('started the app again');
  } catch (e) {
    log(`couldn't start the app: ${e.message}`);
  }
  if (ok) fs.rmSync(job.file, { force: true });
  return { ok };
}
