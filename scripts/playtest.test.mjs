// Integration tests for scripts/playtest.mjs with a fake `claude` (node:test).
// No network, no browser: PLAYTEST_SKIP_PREP=1 skips the npx/Chromium check.
// Run: node --test scripts/playtest.test.mjs (also part of `npm run test:hooks`).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeProjectDirName } from './playtest-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = realpathSync(join(here, '..'));
const runner = join(here, 'playtest.mjs');
const data = join(here, 'testdata', 'playtest');
const fake = join(data, 'fake-claude.mjs');
chmodSync(fake, 0o755);

const LOCAL = 'http://localhost:8787';
const bases = [];
after(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});
const T = 30_000; // per test: a missing or stuck runner fails instead of hanging

/**
 * Runs the runner with a fresh HOME/runs/log dir.
 * @returns {Promise<{ code: number|null, stdout: string, stderr: string, ms: number, runs: string, logs: string, home: string, child: import('node:child_process').ChildProcess }>}
 */
function run(args, { env = {}, onSpawn } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'pt-test-'));
  bases.push(base);
  const dirs = { runs: join(base, 'runs'), logs: join(base, 'logs'), home: join(base, 'home') };
  for (const d of Object.values(dirs)) mkdirSync(d);
  const t0 = Date.now();
  const child = spawn(process.execPath, [runner, ...args], {
    cwd: repo,
    env: {
      ...process.env,
      HOME: dirs.home,
      CLAUDECODE: '1', // must be stripped before launching the player
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      PLAYTEST_CLAUDE_BIN: fake,
      PLAYTEST_SKIP_PREP: '1',
      PLAYTEST_RUNS_DIR: dirs.runs,
      PLAYTEST_PERSONAS_DIR: join(data, 'personas'),
      PLAYTEST_REPORT_TEMPLATE: join(data, 'template.md'),
      PLAYTEST_TIMEOUT_SEC: '20',
      PLAYTEST_KILL_GRACE_MS: '300',
      FAKE_LOG_DIR: dirs.logs,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  onSpawn?.(child, dirs);
  return new Promise((resolve) =>
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - t0, child, ...dirs })),
  );
}

/** The single run folder `<runs>/<label>-<YYYYMMDD-HHMMSS>`. */
function runDir(runs, label = 'local') {
  const names = readdirSync(runs);
  assert.equal(names.length, 1, `one run folder, got ${names}`);
  assert.match(names[0], new RegExp(`^${label}-\\d{8}-\\d{6}$`));
  return join(runs, names[0]);
}
const report = (dir, persona) => readFileSync(join(dir, persona, 'report.md'), 'utf8');
const pngs = (dir, persona) =>
  readdirSync(join(dir, persona))
    .filter((f) => f.endsWith('.png'))
    .sort();
const log = (logs, scenario) => JSON.parse(readFileSync(join(logs, `${scenario}.json`), 'utf8'));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('rejects a production URL before launching anything', { timeout: T }, async () => {
  const r = await run(['https://outpost.mintzzzzz42.workers.dev', 'success']);
  assert.equal(r.code, 2);
  assert.deepEqual(readdirSync(r.logs), [], 'no player launched');
  assert.deepEqual(readdirSync(r.runs), [], 'no run folder');
});

test('rejects an unknown persona before launching anything', { timeout: T }, async () => {
  const r = await run([LOCAL, 'nobody']);
  assert.equal(r.code, 2);
  assert.deepEqual(readdirSync(r.logs), []);
});

test('runs personas concurrently with an isolated launch and collects reports', { timeout: T }, async () => {
  const r = await run([LOCAL, 'success', 'success-pc']);
  assert.equal(r.code, 0, r.stderr);
  const dir = runDir(r.runs);
  assert.ok(r.stdout.includes(dir), 'prints the run folder');

  for (const [p, device] of [
    ['success', 'iPhone 13'],
    ['success-pc', '1280x800'],
  ]) {
    const rep = report(dir, p);
    for (const s of ['상태: 완료', '실행 모드: 동시', `기기: ${device}`, '토큰: 입력', `REPORT ${p}`])
      assert.ok(rep.includes(s), `${p}: ${s}`);
    assert.equal(pngs(dir, p).length, 3);
    assert.ok(!readdirSync(join(dir, p)).some((f) => f.endsWith('.log') || f.endsWith('.yml')), 'png only');
  }

  const a = log(r.logs, 'success');
  const b = log(r.logs, 'success-pc');
  // overlap: the second started before the first could have finished (fake sleeps 400ms)
  assert.ok(Math.abs(a.startedAt - b.startedAt) < 400, 'started together');

  // isolation of the launch
  assert.deepEqual(a.claudeEnv, [], 'parent CLAUDE* env stripped');
  assert.ok(!a.cwd.startsWith(repo), 'player cwd outside the repo');
  assert.ok(
    a.cwdEntries.every((f) => ['mcp.json', 'shots'].includes(f)),
    `cwd entries ${a.cwdEntries}`,
  );
  assert.notEqual(a.cwd, b.cwd, 'one temp folder per persona');
  assert.ok(!existsSync(a.cwd), 'temp folder removed');
  assert.ok(!existsSync(join(r.home, '.claude', 'projects', claudeProjectDirName(a.cwd))), 'claude state dir removed');
  const args = a.mcp.mcpServers.playwright.args;
  assert.equal(args[args.indexOf('--allowed-origins') + 1], LOCAL);
  assert.equal(args[args.indexOf('--device') + 1], 'iPhone 13');
  const pcArgs = b.mcp.mcpServers.playwright.args;
  assert.equal(pcArgs[pcArgs.indexOf('--viewport-size') + 1], '1280x800');
  assert.equal(a.argv[a.argv.indexOf('--max-turns') + 1], '80');
});

test('--serial runs one at a time and says so', { timeout: T }, async () => {
  const r = await run(['--serial', LOCAL, 'success', 'success-pc']);
  assert.equal(r.code, 0, r.stderr);
  const dir = runDir(r.runs);
  assert.ok(report(dir, 'success').includes('실행 모드: 순차'));
  const a = log(r.logs, 'success');
  const b = log(r.logs, 'success-pc');
  assert.ok(Math.abs(a.startedAt - b.startedAt) >= 400, 'not overlapping');
});

test('env overrides budget and max turns', { timeout: T }, async () => {
  const r = await run([LOCAL, 'success'], { env: { PLAYTEST_MAX_TURNS: '12', PLAYTEST_ACTION_BUDGET: '7' } });
  assert.equal(r.code, 0, r.stderr);
  const a = log(r.logs, 'success');
  assert.equal(a.argv[a.argv.indexOf('--max-turns') + 1], '12');
  assert.ok(a.argv[a.argv.indexOf('-p') + 1].includes('7'));
});

test('keeps the first 5 and latest 15 screenshots', { timeout: T }, async () => {
  const r = await run([LOCAL, 'many']);
  assert.equal(r.code, 0, r.stderr);
  const got = pngs(runDir(r.runs), 'many');
  const name = (i) => `page-2026-11-27T00-00-${String(i).padStart(2, '0')}-000Z.png`;
  assert.deepEqual(got, [0, 1, 2, 3, 4, ...Array.from({ length: 15 }, (_, i) => i + 10)].map(name));
});

test('cuts the report body at 8,000 characters', { timeout: T }, async () => {
  const r = await run([LOCAL, 'long']);
  assert.equal(r.code, 0, r.stderr);
  const rep = report(runDir(r.runs), 'long');
  assert.match(rep, /\(잘림\)/);
  assert.ok(rep.split('가'.repeat(10)).length < 900, 'body cut');
  assert.ok(rep.length < 8000 + 1000, 'header + 8,000');
});

test('max turns: incomplete report from assistant text, tokens counted, exit 0', { timeout: T }, async () => {
  const r = await run([LOCAL, 'maxturns']);
  assert.equal(r.code, 0, r.stderr);
  const dir = runDir(r.runs);
  const rep = report(dir, 'maxturns');
  for (const s of ['미완료(턴 상한)', '첫 문단', '둘째 문단', '토큰: 입력']) assert.ok(rep.includes(s), s);
  assert.ok(!rep.includes('미집계'));
  assert.equal(pngs(dir, 'maxturns').length, 2);
});

test('time limit: kills the whole process group, keeps partial report and screenshots', { timeout: T }, async () => {
  const r = await run([LOCAL, 'hang'], { env: { PLAYTEST_TIMEOUT_SEC: '1' } });
  assert.equal(r.code, 0, r.stderr);
  const dir = runDir(r.runs);
  const rep = report(dir, 'hang');
  for (const s of ['미완료(시간 상한)', '보는 중', '근사']) assert.ok(rep.includes(s), s);
  assert.equal(pngs(dir, 'hang').length, 1);
  const childPid = Number(readFileSync(join(r.logs, 'hang.child'), 'utf8'));
  assert.ok(!alive(childPid), 'browser stand-in killed with the group');
  assert.ok(!existsSync(log(r.logs, 'hang').cwd), 'temp folder removed');
  assert.ok(r.ms < 8000, `took ${r.ms}ms`);
});

test('isolation mismatch in init: killed at once, 실패(격리), exit 1', { timeout: T }, async () => {
  const r = await run([LOCAL, 'leak'], { env: { PLAYTEST_KILL_GRACE_MS: '10000' } });
  assert.equal(r.code, 1);
  const rep = report(runDir(r.runs), 'leak');
  assert.match(rep, /실패\(격리\)/);
  assert.ok(r.ms < 5000, `SIGKILL without grace, took ${r.ms}ms`);
  assert.ok(!alive(Number(readFileSync(join(r.logs, 'leak.child'), 'utf8'))));
});

test('one failure does not stop the others; rate limit and crash are failures', { timeout: T }, async () => {
  const r = await run([LOCAL, 'success', 'ratelimit', 'crash']);
  assert.equal(r.code, 1);
  const dir = runDir(r.runs);
  assert.ok(report(dir, 'success').includes('상태: 완료'));
  assert.match(report(dir, 'ratelimit'), /실패\(.*429.*\)/);
  assert.match(report(dir, 'crash'), /실패\(/);
});

test('SIGINT to the runner cleans up players and temp folders', { timeout: T }, async () => {
  const r = await run([LOCAL, 'hang'], {
    env: { PLAYTEST_TIMEOUT_SEC: '60' },
    onSpawn: (child, dirs) => {
      const tick = setInterval(() => {
        if (child.exitCode !== null) clearInterval(tick);
        else if (existsSync(join(dirs.logs, 'hang.child'))) {
          clearInterval(tick);
          setTimeout(() => child.kill('SIGINT'), 200);
        }
      }, 50);
    },
  });
  assert.notEqual(r.code, 0);
  assert.ok(!alive(Number(readFileSync(join(r.logs, 'hang.child'), 'utf8'))));
  assert.ok(!existsSync(log(r.logs, 'hang').cwd));
  assert.ok(r.ms < 8000, `took ${r.ms}ms`);
});

test('prints the run folder with the home directory shortened to ~', { timeout: T }, async () => {
  const home = mkdtempSync(join(tmpdir(), 'pt-home-'));
  bases.push(home);
  const r = await run([LOCAL, 'success'], { env: { HOME: home, PLAYTEST_RUNS_DIR: join(home, 'runs') } });
  assert.equal(r.code, 0, r.stderr);
  const last = r.stdout.trim().split('\n').at(-1);
  assert.match(last, /^~\/runs\/local-\d{8}-\d{6}$/);
  assert.ok(!r.stdout.includes(home));
});
