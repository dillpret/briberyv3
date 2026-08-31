import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import process from 'node:process';

const [ownerPidText, command, ...args] = process.argv.slice(2);
const ownerPid = Number(ownerPidText);

if (!Number.isInteger(ownerPid) || !command) {
  console.error('Usage: node owned-process.mjs <owner-pid> <command> [...args]');
  process.exit(2);
}

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
});
let stopping = false;

async function removeCleanupDirectory() {
  const cleanupDirectory = process.env.UI_GUARDIAN_CLEANUP_DIR;
  if (!cleanupDirectory) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.rm(cleanupDirectory, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function stop(exitCode = 0, ownerDisappeared = false) {
  if (stopping) return;
  stopping = true;
  clearInterval(ownerCheck);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  if (ownerDisappeared) await removeCleanupDirectory();
  process.exit(exitCode);
}

const ownerCheck = setInterval(() => {
  try {
    process.kill(ownerPid, 0);
  } catch {
    void stop(143, true);
  }
}, 500);
ownerCheck.unref();

process.on('message', (message) => {
  if (message?.type === 'shutdown') void stop(0);
});
process.once('SIGINT', () => void stop(130));
process.once('SIGTERM', () => void stop(143));
child.once('error', (error) => {
  console.error(error);
  void stop(1);
});
child.once('close', (code, signal) => {
  if (stopping) return;
  clearInterval(ownerCheck);
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
