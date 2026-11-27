#!/usr/bin/env node
// Persona playtest runner: one isolated `claude -p` per persona, all at once by default.
// Pure logic lives in playtest-lib.mjs. Usage: scripts/playtest.sh [--serial] <URL> [persona...]
// Exit code: 0 = every persona complete or incomplete, 1 = at least one failed, 2 = bad usage (nothing launched).
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  DEFAULTS,
  PLAYWRIGHT_MCP_PACKAGE,
  buildClaudeArgs,
  buildMcpConfig,
  buildPrompt,
  checkIsolation,
  claudeProjectDirName,
  classifyRun,
  formatHeader,
  formatMode,
  parseArgs,
  parseTarget,
  readDevice,
  runDirName,
  selectScreenshots,
  truncateReport,
} from './playtest-lib.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const envNum = (name, fallback) => {
  const n = Number(env[name]);
  return env[name] !== undefined && env[name] !== '' && Number.isFinite(n) ? n : fallback;
};

const config = {
  claudeBin: env.PLAYTEST_CLAUDE_BIN || 'claude',
  skipPrep: env.PLAYTEST_SKIP_PREP === '1',
  runsDir: env.PLAYTEST_RUNS_DIR || join(homedir(), '.local', 'share', 'outpost-playtests'),
  personasDir: env.PLAYTEST_PERSONAS_DIR || join(repoRoot, 'docs', 'playtests', 'personas'),
  template: env.PLAYTEST_REPORT_TEMPLATE || join(repoRoot, 'docs', 'templates', 'playtest.md'),
  actionBudget: envNum('PLAYTEST_ACTION_BUDGET', DEFAULTS.actionBudget),
  maxTurns: envNum('PLAYTEST_MAX_TURNS', DEFAULTS.maxTurns),
  timeoutSec: envNum('PLAYTEST_TIMEOUT_SEC', DEFAULTS.timeoutSec),
  killGraceMs: envNum('PLAYTEST_KILL_GRACE_MS', DEFAULTS.killGraceMs),
  staggerSec: envNum('PLAYTEST_STAGGER_SEC', DEFAULTS.staggerSec),
};

const usageError = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Signals a whole process group (claude + the browser it started). Already-gone groups are fine. */
function signalGroup(pid, sig) {
  try {
    process.kill(-pid, sig);
  } catch {
    // ESRCH: nothing left to signal.
  }
}

/** Process groups of running players, so an interrupt of the runner can end them. */
const active = new Set();
let interrupted = false;

/** SIGTERM the group, SIGKILL it if anything is still there after the grace period. */
async function terminateGroup(pid) {
  signalGroup(pid, 'SIGTERM');
  await sleep(config.killGraceMs);
  signalGroup(pid, 'SIGKILL');
}

/**
 * Runs one persona in its own temp folder and returns { name, status }.
 * Always removes the temp folder and claude's per-folder state dir.
 */
async function runPersona({ name, personaText, device, target, template, outDir, mode }) {
  mkdirSync(outDir, { recursive: true });
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'pt-')));
  const shotsDir = join(tmp, 'shots');
  const claudeState = join(homedir(), '.claude', 'projects', claudeProjectDirName(tmp));
  const events = [];
  const stderrTail = [];
  let abort = null;
  let abortDetail = '';
  let timedOut = false;
  let exitCode = null;
  const startedAt = Date.now();
  try {
    mkdirSync(shotsDir);
    const mcpConfigPath = join(tmp, 'mcp.json');
    writeFileSync(
      mcpConfigPath,
      JSON.stringify(buildMcpConfig({ origin: target.origin, device, outputDir: shotsDir })),
    );
    const prompt = buildPrompt({ url: target.origin, persona: personaText, template, budget: config.actionBudget });
    const args = buildClaudeArgs({ prompt, mcpConfigPath, maxTurns: config.maxTurns });
    const childEnv = Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('CLAUDE')));

    const child = spawn(config.claudeBin, args, {
      cwd: tmp,
      env: childEnv,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = new Promise((resolve) => {
      child.on('error', (err) => {
        stderrTail.push(String(err.message));
        resolve(null);
      });
      child.on('exit', (code) => resolve(code));
    });
    if (child.pid !== undefined) active.add(child.pid);

    const stream = createWriteStream(join(outDir, 'stream.jsonl'));
    const lines = createInterface({ input: child.stdout });
    const linesClosed = new Promise((resolve) => lines.on('close', resolve));
    lines.on('line', (line) => {
      stream.write(`${line}\n`);
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      events.push(e);
      if (e.type === 'system' && e.subtype === 'init' && !abort) {
        const check = checkIsolation(e);
        if (!check.ok) {
          abort = '격리';
          abortDetail = check.reason;
          signalGroup(child.pid, 'SIGKILL');
        }
      }
    });
    child.stderr.on('data', (d) => {
      stderrTail.push(String(d));
      while (stderrTail.join('').length > 600) stderrTail.shift();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      void terminateGroup(child.pid);
    }, config.timeoutSec * 1000);
    exitCode = await exited;
    clearTimeout(timer);
    // Sweep anything the player left behind (the browser), then let the output pipe drain.
    if (child.pid !== undefined) {
      signalGroup(child.pid, 'SIGKILL');
      active.delete(child.pid);
    }
    await Promise.race([linesClosed, sleep(2000)]);
    await new Promise((resolve) => stream.end(resolve));

    const run = classifyRun({ events, timedOut, exitCode, abort });
    const durationMs = run.durationMs ?? Date.now() - startedAt;
    const deviceLabel = device.kind === 'viewport' ? device.size : device.name;
    const header = formatHeader({ ...run, mode, device: deviceLabel, durationMs });
    let body;
    if (run.status === 'failed') {
      const detail = [abortDetail, stderrTail.join('').trim()].filter(Boolean).join('\n');
      body = `실패(${run.reason})${detail ? `\n\n${detail.slice(0, 600)}` : ''}`;
    } else {
      body = truncateReport(run.report);
    }
    writeFileSync(join(outDir, 'report.md'), `${header}\n\n${body}\n`);

    let shotNames = [];
    try {
      shotNames = selectScreenshots(readdirSync(shotsDir));
    } catch {
      // No screenshots were taken.
    }
    for (const f of shotNames) copyFileSync(join(shotsDir, f), join(outDir, f));
    return { name, status: run.status, reason: run.reason };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(claudeState, { recursive: true, force: true });
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    usageError(err.message);
  }
  const target = parseTarget(parsed.url);
  if (!target)
    usageError(
      `허용하지 않는 주소: ${parsed.url}\nPreview(https://pr-<N>-outpost.<계정>.workers.dev)나 localhost만 쓴다.`,
    );

  let available;
  try {
    available = readdirSync(config.personasDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md'))
      .sort();
  } catch {
    usageError(`페르소나 폴더를 읽을 수 없다: ${config.personasDir}`);
  }
  const names = parsed.personas.length > 0 ? parsed.personas : available;
  if (names.length === 0) usageError('페르소나가 없다');
  const unknown = names.filter((n) => !available.includes(n));
  if (unknown.length > 0) usageError(`모르는 페르소나: ${unknown.join(', ')} (있는 것: ${available.join(', ')})`);

  let template;
  const personas = [];
  try {
    template = readFileSync(config.template, 'utf8');
    for (const name of names) {
      const personaText = readFileSync(join(config.personasDir, `${name}.md`), 'utf8');
      personas.push({ name, personaText, device: readDevice(personaText) });
    }
  } catch (err) {
    usageError(err.message);
  }

  if (!config.skipPrep) {
    const prep = spawnSync('npx', ['-y', '-p', PLAYWRIGHT_MCP_PACKAGE, 'playwright', 'install', 'chromium'], {
      stdio: 'inherit',
    });
    if (prep.status !== 0) usageError('Chromium 준비에 실패했다');
  }

  const mode = formatMode({ serial: parsed.serial, staggerSec: config.staggerSec });
  const runDir = join(config.runsDir, runDirName(target.label, new Date()));
  mkdirSync(runDir, { recursive: true });

  const onSignal = async () => {
    interrupted = true;
    await Promise.all([...active].map(terminateGroup));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const launch = (p) =>
    runPersona({ ...p, target, template, outDir: join(runDir, p.name), mode }).catch((err) => ({
      name: p.name,
      status: 'failed',
      reason: err.message,
    }));
  let results;
  if (parsed.serial) {
    results = [];
    for (const p of personas) if (!interrupted) results.push(await launch(p));
  } else {
    results = await Promise.all(
      personas.map(async (p, i) => {
        if (i > 0 && config.staggerSec > 0) await sleep(i * config.staggerSec * 1000);
        return interrupted ? { name: p.name, status: 'failed', reason: '중단' } : launch(p);
      }),
    );
  }

  for (const r of results) process.stdout.write(`${r.name}: ${r.status}${r.reason ? `(${r.reason})` : ''}\n`);
  const home = homedir();
  process.stdout.write(`${runDir.startsWith(`${home}/`) ? `~${runDir.slice(home.length)}` : runDir}\n`);
  if (interrupted) process.exit(130);
  process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
}

await main();
