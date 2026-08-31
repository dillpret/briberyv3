import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const frontendRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..', '..', '..');
const backendProject = path.join(repoRoot, 'src', 'backend', 'BriberyGame.Api', 'BriberyGame.Api.csproj');
const angularCli = path.join(frontendRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const processGuardian = path.join(import.meta.dirname, 'owned-process.mjs');
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'ui-verification');
const stageParent = path.join(frontendRoot, '.angular');
const stageRoot = path.join(stageParent, `ui-verification-${process.pid}`);
const frontendOutput = path.join(stageRoot, 'frontend');
const serverOutput = path.join(stageRoot, 'server');
const mode = process.argv[2] ?? 'verify';

if (!['inspect', 'verify'].includes(mode)) {
  console.error('Usage: node scripts/run-ui-verification.mjs <inspect|verify>');
  process.exit(2);
}

const children = new Set();
let shuttingDown = false;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`> ${path.basename(command)} ${args.join(' ')}`);
    const child = spawn(process.execPath, [processGuardian, String(process.pid), command, ...args], {
      cwd: options.cwd ?? frontendRoot,
      env: { ...process.env, UI_GUARDIAN_CLEANUP_DIR: stageRoot, ...options.env },
      stdio: options.capture ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: true,
    });
    children.add(child);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      options.onStdout?.(chunk.toString());
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      options.onStderr?.(chunk.toString());
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      children.delete(child);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with ${signal ?? `code ${code}`}\n${stderr || stdout}`));
    });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (child.connected) child.send({ type: 'shutdown' });
  else child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.allSettled([...children].map(stopChild));
  await fs.rm(stageRoot, { recursive: true, force: true });
  if (typeof exitCode === 'number') process.exit(exitCode);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.error(`Received ${signal}; cleaning up owned processes.`);
    void shutdown(130);
  });
}

async function removeStaleStages() {
  const entries = await fs.readdir(stageParent, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const match = entry.isDirectory() && entry.name.match(/^ui-verification-(\d+)$/);
    if (!match || Number(match[1]) === process.pid) continue;
    let ownerIsAlive = true;
    try {
      process.kill(Number(match[1]), 0);
    } catch {
      ownerIsAlive = false;
    }
    if (!ownerIsAlive) {
      const stalePath = path.join(stageParent, entry.name);
      console.log(`Removing stale verification stage ${stalePath}`);
      await fs.rm(stalePath, { recursive: true, force: true });
    }
  }
}

async function stageApplication() {
  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(stageRoot, { recursive: true });

  await run(process.execPath, [
    angularCli,
    'build',
    '--configuration',
    'production',
    '--output-path',
    frontendOutput,
  ]);
  await run('dotnet', [
    'publish',
    backendProject,
    '--configuration',
    'Release',
    '--output',
    serverOutput,
    '/p:UseAppHost=false',
  ]);

  const browserOutput = path.join(frontendOutput, 'browser');
  const builtFrontend = await fs.stat(browserOutput).then(() => browserOutput).catch(() => frontendOutput);
  await fs.cp(builtFrontend, path.join(serverOutput, 'wwwroot'), { recursive: true });
}

async function startApplication() {
  const dll = path.join(serverOutput, 'BriberyGame.Api.dll');
  let startupLog = '';
  let resolveUrl;
  let rejectUrl;
  const urlFound = new Promise((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });

  const child = spawn(process.execPath, [
    processGuardian,
    String(process.pid),
    'dotnet',
    dll,
    '--urls',
    'http://127.0.0.1:0',
  ], {
    cwd: serverOutput,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Production',
      UI_GUARDIAN_CLEANUP_DIR: stageRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  children.add(child);

  const inspectOutput = (chunk) => {
    const text = chunk.toString();
    startupLog += text;
    process.stdout.write(`[app] ${text}`);
    const match = startupLog.match(/Now listening on:\s+(http:\/\/127\.0\.0\.1:\d+)/i);
    if (match) resolveUrl(match[1]);
  };
  child.stdout.on('data', inspectOutput);
  child.stderr.on('data', inspectOutput);
  child.once('error', rejectUrl);
  child.once('close', (code) => {
    children.delete(child);
    rejectUrl(new Error(`Application exited before verification (code ${code}).\n${startupLog}`));
  });

  const timeout = setTimeout(() => rejectUrl(new Error(`Timed out waiting for application startup.\n${startupLog}`)), 30000);
  const baseUrl = await urlFound.finally(() => clearTimeout(timeout));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Application exited during readiness checks.\n${startupLog}`);
    try {
      const response = await fetch(baseUrl);
      const body = await response.text();
      if (response.ok && response.headers.get('content-type')?.includes('text/html') && body.includes('Bribery')) {
        return { child, baseUrl };
      }
    } catch {
      // The socket may be listening before ASP.NET is ready to serve the SPA.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application never returned the expected landing page at ${baseUrl}.`);
}

async function runBrowserScript(scriptName, baseUrl) {
  await run(process.execPath, [path.join(import.meta.dirname, scriptName)], {
    env: {
      UI_BASE_URL: baseUrl,
      SMOKE_BASE_URL: baseUrl,
      UI_ARTIFACT_DIR: artifactDir,
    },
  });
}

let app;
try {
  await removeStaleStages();
  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });
  await stageApplication();
  app = await startApplication();
  console.log(`Verified isolated app readiness at ${app.baseUrl}`);
  await runBrowserScript('playwright-visual-inspection.mjs', app.baseUrl);
  if (mode === 'verify') await runBrowserScript('playwright-docker-smoke.mjs', app.baseUrl);
  console.log(`UI ${mode} completed. Artifacts: ${artifactDir}`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await stopChild(app?.child);
  if (app?.child) children.delete(app.child);
  await shutdown();
}
