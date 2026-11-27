// Unit tests for the pure runner logic (node:test, no browser, no network).
// Run: node --test scripts/playtest-lib.test.mjs (also part of `npm run test:hooks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_TOOLS,
  DEFAULTS,
  DENIED_TOOLS,
  PLAYWRIGHT_MCP_PACKAGE,
  buildClaudeArgs,
  buildMcpConfig,
  buildPrompt,
  checkIsolation,
  claudeProjectDirName,
  classifyRun,
  deviceArgs,
  formatHeader,
  formatMode,
  parseArgs,
  parseTarget,
  readDevice,
  runDirName,
  selectScreenshots,
  sumUsage,
  truncateReport,
} from './playtest-lib.mjs';

/** Value right after `name` in an argv array (undefined if absent). */
const flag = (args, name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};

// ---------- contract constants ----------

test('allowed and denied tools are disjoint and cover the 31 tools of the pinned MCP', () => {
  assert.equal(PLAYWRIGHT_MCP_PACKAGE, '@playwright/mcp@0.0.86');
  assert.equal(ALLOWED_TOOLS.length, 11);
  assert.equal(DENIED_TOOLS.length, 20);
  assert.equal(new Set([...ALLOWED_TOOLS, ...DENIED_TOOLS]).size, 31);
  for (const t of ['snapshot', 'click', 'type', 'resize', 'evaluate', 'run_code_unsafe', 'tabs'])
    assert.ok(DENIED_TOOLS.includes(`mcp__playwright__browser_${t}`), t);
});

test('defaults match T0', () => {
  assert.equal(DEFAULTS.actionBudget, 15);
  assert.equal(DEFAULTS.maxTurns, 80);
  assert.equal(DEFAULTS.timeoutSec, 600);
  assert.equal(DEFAULTS.reportMaxChars, 8000);
  assert.equal(DEFAULTS.firstShots + DEFAULTS.latestShots, 20);
});

// ---------- URL ----------

test('parseTarget accepts Preview and localhost', () => {
  assert.deepEqual(parseTarget('https://pr-30-outpost.mintzzzzz42.workers.dev'), {
    origin: 'https://pr-30-outpost.mintzzzzz42.workers.dev',
    label: 'pr-30',
  });
  assert.deepEqual(parseTarget('https://pr-7-outpost.some-acct.workers.dev/'), {
    origin: 'https://pr-7-outpost.some-acct.workers.dev',
    label: 'pr-7',
  });
  assert.deepEqual(parseTarget('http://localhost:8787'), { origin: 'http://localhost:8787', label: 'local' });
  assert.deepEqual(parseTarget('http://localhost:5173/'), { origin: 'http://localhost:5173', label: 'local' });
});

test('parseTarget rejects production and look-alikes', () => {
  for (const url of [
    'https://outpost.mintzzzzz42.workers.dev', // production
    'https://outpost.mintzzzzz42.workers.dev/?pr-1-outpost',
    'http://pr-30-outpost.mintzzzzz42.workers.dev', // not https
    'https://pr-30-outpost.mintzzzzz42.workers.dev.evil.com',
    'https://pr-x-outpost.mintzzzzz42.workers.dev',
    'https://pr-30-other.mintzzzzz42.workers.dev',
    'https://user:pw@pr-30-outpost.mintzzzzz42.workers.dev',
    'http://localhost.evil.com:8787',
    'http://evil.com/?localhost',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    '',
  ])
    assert.equal(parseTarget(url), null, url);
});

// ---------- args ----------

test('parseArgs reads --serial, URL and persona names', () => {
  assert.deepEqual(parseArgs(['http://localhost:8787']), { serial: false, url: 'http://localhost:8787', personas: [] });
  assert.deepEqual(parseArgs(['--serial', 'http://localhost:8787', 'pc-dev', 'phone-casual']), {
    serial: true,
    url: 'http://localhost:8787',
    personas: ['pc-dev', 'phone-casual'],
  });
});

test('parseArgs throws on missing URL or unknown flag', () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(['--serial']));
  assert.throws(() => parseArgs(['--fast', 'http://localhost:8787']));
});

// ---------- device ----------

test('readDevice reads the device: line', () => {
  assert.deepEqual(readDevice('device: iPhone 13\n\n# 누구\n...'), { kind: 'device', name: 'iPhone 13' });
  assert.deepEqual(readDevice('device: 1280x800\n'), { kind: 'viewport', size: '1280x800' });
  assert.deepEqual(readDevice('device:   390x844  \nrest'), { kind: 'viewport', size: '390x844' });
});

test('readDevice throws without a device line', () => {
  assert.throws(() => readDevice('# 누구\n폰으로 들어온다'));
  assert.throws(() => readDevice('device:\n'));
});

test('deviceArgs maps to --device or --viewport-size', () => {
  assert.deepEqual(deviceArgs({ kind: 'device', name: 'iPhone 13' }), ['--device', 'iPhone 13']);
  assert.deepEqual(deviceArgs({ kind: 'viewport', size: '1280x800' }), ['--viewport-size', '1280x800']);
});

// ---------- launch args ----------

test('buildMcpConfig runs only the pinned Playwright MCP with screen-only options', () => {
  const cfg = buildMcpConfig({
    origin: 'http://localhost:8787',
    device: { kind: 'device', name: 'iPhone 13' },
    outputDir: '/tmp/pt-x/shots',
  });
  assert.deepEqual(Object.keys(cfg.mcpServers), ['playwright']);
  const { command, args } = cfg.mcpServers.playwright;
  assert.equal(command, 'npx');
  assert.ok(args.includes(PLAYWRIGHT_MCP_PACKAGE));
  for (const f of ['--isolated', '--headless', '--no-webmcp']) assert.ok(args.includes(f), f);
  assert.equal(flag(args, '--caps'), 'vision');
  assert.equal(flag(args, '--browser'), 'chromium');
  assert.equal(flag(args, '--snapshot-mode'), 'none');
  assert.equal(flag(args, '--allowed-origins'), 'http://localhost:8787');
  assert.equal(flag(args, '--output-dir'), '/tmp/pt-x/shots');
  assert.equal(flag(args, '--device'), 'iPhone 13');
  assert.equal(flag(args, '--viewport-size'), undefined);
});

test('buildClaudeArgs isolates the player', () => {
  const args = buildClaudeArgs({ prompt: 'P', mcpConfigPath: '/tmp/pt-x/mcp.json', maxTurns: 80 });
  assert.equal(flag(args, '-p'), 'P');
  assert.equal(flag(args, '--model'), 'sonnet');
  assert.equal(flag(args, '--tools'), '');
  assert.equal(flag(args, '--setting-sources'), '');
  assert.equal(flag(args, '--mcp-config'), '/tmp/pt-x/mcp.json');
  assert.equal(flag(args, '--output-format'), 'stream-json');
  assert.equal(flag(args, '--max-turns'), '80');
  assert.deepEqual(flag(args, '--allowedTools').split(','), ALLOWED_TOOLS);
  assert.deepEqual(flag(args, '--disallowedTools').split(','), DENIED_TOOLS);
  for (const f of ['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--verbose'])
    assert.ok(args.includes(f), f);
  assert.ok(!args.includes('--bare'), '--bare cannot use login auth (T0)');
});

test('buildPrompt carries only URL, persona, template and budget', () => {
  const p = buildPrompt({
    url: 'http://localhost:8787',
    persona: 'PERSONA-TEXT',
    template: 'TEMPLATE-TEXT',
    budget: 15,
  });
  for (const s of ['http://localhost:8787', 'PERSONA-TEXT', 'TEMPLATE-TEXT', '15']) assert.ok(p.includes(s), s);
  for (const s of ['OUTPOST', '발전기', '수리', '기지', '고장']) assert.ok(!p.includes(s), `leaks ${s}`);
  // filename suppresses the image sent back to the model (T0), so the prompt must forbid it.
  assert.match(p, /filename/);
});

// ---------- isolation ----------

const goodInit = () => ({
  type: 'system',
  subtype: 'init',
  tools: [...ALLOWED_TOOLS].reverse(),
  mcp_servers: [{ name: 'playwright', status: 'connected' }],
  slash_commands: [],
  skills: [],
  plugins: [{ name: 'cc-plugin-telemetry', source: 'cc-plugin-telemetry@builtin' }],
});

test('checkIsolation accepts exactly the allowed tools (any order)', () => {
  assert.deepEqual(checkIsolation(goodInit()), { ok: true });
});

test('checkIsolation rejects extra, missing or non-MCP tools', () => {
  const extra = goodInit();
  extra.tools.push('mcp__playwright__browser_snapshot');
  assert.equal(checkIsolation(extra).ok, false);
  const missing = goodInit();
  missing.tools.pop();
  assert.equal(checkIsolation(missing).ok, false);
  const builtin = goodInit();
  builtin.tools.push('Bash');
  assert.equal(checkIsolation(builtin).ok, false);
});

test('checkIsolation rejects user plugins, skills, slash commands, other MCP servers, disconnected MCP', () => {
  const plugin = goodInit();
  plugin.plugins.push({ name: 'x', source: 'x@user-marketplace' });
  assert.equal(checkIsolation(plugin).ok, false);
  const skill = goodInit();
  skill.skills = ['retro'];
  assert.equal(checkIsolation(skill).ok, false);
  const slash = goodInit();
  slash.slash_commands = ['start-task'];
  assert.equal(checkIsolation(slash).ok, false);
  const other = goodInit();
  other.mcp_servers.push({ name: 'easel', status: 'connected' });
  assert.equal(checkIsolation(other).ok, false);
  const down = goodInit();
  down.mcp_servers = [{ name: 'playwright', status: 'failed' }];
  assert.equal(checkIsolation(down).ok, false);
  assert.equal(checkIsolation(undefined).ok, false);
});

test('checkIsolation fails (never throws) on unexpected init shapes', () => {
  const mutate = (f) => {
    const i = goodInit();
    f(i);
    return i;
  };
  const cases = [
    mutate((i) => (i.mcp_servers = [null])),
    mutate((i) => (i.mcp_servers = ['playwright'])),
    mutate((i) => (i.mcp_servers = {})),
    mutate((i) => delete i.mcp_servers),
    mutate((i) => delete i.plugins),
    mutate((i) => (i.plugins = null)),
    mutate((i) => (i.plugins = 'x')),
    mutate((i) => (i.plugins = { name: 'x' })),
    mutate((i) => (i.plugins = [null])),
    mutate((i) => (i.plugins = ['x@builtin'])),
    mutate((i) => (i.tools = [null])),
    null,
    'init',
  ];
  for (const c of cases) assert.equal(checkIsolation(c).ok, false, JSON.stringify(c));
});

// ---------- usage ----------

const asst = (id, usage, content = [{ type: 'text', text: '' }]) => ({
  type: 'assistant',
  message: { id, content, usage },
});
const u = (input, output, cc = 0, cr = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cc,
  cache_read_input_tokens: cr,
});

test('sumUsage dedupes by message.id (last event wins) and sums', () => {
  const events = [
    { type: 'system', subtype: 'init' },
    asst('m1', u(2, 10, 100, 0)),
    asst('m1', u(2, 40, 100, 0)), // same message streamed again with a later snapshot
    { type: 'user', message: { content: [] } },
    asst('m2', u(3, 5, 0, 1000)),
    { type: 'rate_limit_event' },
  ];
  assert.deepEqual(sumUsage(events), { input: 5, output: 45, cacheCreation: 100, cacheRead: 1000 });
  assert.deepEqual(sumUsage([]), { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 });
});

// ---------- completion ----------

const init = goodInit();
const text = (id, t) => asst(id, u(1, 1), [{ type: 'text', text: t }]);
const toolUse = (id) =>
  asst(id, u(1, 1), [{ type: 'tool_use', name: 'mcp__playwright__browser_take_screenshot', input: {} }]);

test('classifyRun: success result is complete with result usage and duration', () => {
  const r = classifyRun({
    events: [
      init,
      text('a', '먼저'),
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'REPORT',
        duration_ms: 1234,
        usage: u(22, 1427, 9102, 90629),
      },
    ],
    timedOut: false,
    exitCode: 0,
    abort: null,
  });
  assert.equal(r.status, 'complete');
  assert.equal(r.reason, null);
  assert.equal(r.report, 'REPORT');
  assert.equal(r.durationMs, 1234);
  assert.deepEqual(r.usage, { input: 22, output: 1427, cacheCreation: 9102, cacheRead: 90629 });
  assert.equal(r.usageApprox, false);
});

test('classifyRun: error_max_turns is incomplete with joined assistant text and result usage', () => {
  const r = classifyRun({
    events: [
      init,
      text('a', '첫 문단'),
      toolUse('b'),
      text('c', '둘째 문단'),
      { type: 'result', subtype: 'error_max_turns', is_error: true, usage: u(10, 20, 30, 40) },
    ],
    timedOut: false,
    exitCode: 1,
    abort: null,
  });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.reason, '턴 상한');
  assert.ok(r.report.indexOf('첫 문단') < r.report.indexOf('둘째 문단'));
  assert.deepEqual(r.usage, { input: 10, output: 20, cacheCreation: 30, cacheRead: 40 });
  assert.equal(r.durationMs, null); // runner uses wall clock
});

test('classifyRun: error_max_turns without usage falls back to the per-turn sum', () => {
  const r = classifyRun({
    events: [init, asst('a', u(1, 2, 3, 4)), { type: 'result', subtype: 'error_max_turns', is_error: true }],
    timedOut: false,
    exitCode: 1,
    abort: null,
  });
  assert.deepEqual(r.usage, { input: 1, output: 2, cacheCreation: 3, cacheRead: 4 });
  assert.equal(r.usageApprox, true);
});

test('classifyRun: time limit (no result) is incomplete with approximate usage', () => {
  const r = classifyRun({
    events: [init, asst('a', u(1, 2, 3, 4), [{ type: 'text', text: '보는 중' }])],
    timedOut: true,
    exitCode: null,
    abort: null,
  });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.reason, '시간 상한');
  assert.match(r.report, /보는 중/);
  assert.deepEqual(r.usage, { input: 1, output: 2, cacheCreation: 3, cacheRead: 4 });
  assert.equal(r.usageApprox, true);
});

test('classifyRun: other error subtype is incomplete with that subtype', () => {
  const r = classifyRun({
    events: [init, text('a', 'x'), { type: 'result', subtype: 'error_during_execution', is_error: true }],
    timedOut: false,
    exitCode: 1,
    abort: null,
  });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.reason, 'error_during_execution');
});

test('classifyRun: API error (e.g. 429) is a failure, not success', () => {
  const r = classifyRun({
    events: [
      init,
      {
        type: 'result',
        subtype: 'success',
        is_error: true,
        terminal_reason: 'api_error',
        api_error_status: 429,
        result: 'rate limited',
      },
    ],
    timedOut: false,
    exitCode: 1,
    abort: null,
  });
  assert.equal(r.status, 'failed');
  assert.match(r.reason, /429/);
});

test('classifyRun: time limit wins when claude still emits a result after SIGTERM', () => {
  for (const result of [
    { type: 'result', subtype: 'success', is_error: false, result: 'REPORT', duration_ms: 1, usage: u(1, 1) },
    { type: 'result', subtype: 'error_during_execution', is_error: true },
  ]) {
    const r = classifyRun({ events: [init, text('a', '보는 중'), result], timedOut: true, exitCode: 1, abort: null });
    assert.equal(r.status, 'incomplete', result.subtype);
    assert.equal(r.reason, '시간 상한', result.subtype);
    assert.match(r.report, /보는 중/);
  }
});

test('classifyRun: runner abort (isolation) wins over anything else', () => {
  const r = classifyRun({
    events: [init, { type: 'result', subtype: 'success', is_error: false, result: 'x' }],
    timedOut: false,
    exitCode: 0,
    abort: '격리',
  });
  assert.equal(r.status, 'failed');
  assert.equal(r.reason, '격리');
});

test('classifyRun: no init or exit without result is a failure', () => {
  assert.equal(classifyRun({ events: [], timedOut: false, exitCode: 1, abort: null }).status, 'failed');
  assert.equal(
    classifyRun({ events: [init, text('a', 'x')], timedOut: false, exitCode: 1, abort: null }).status,
    'failed',
  );
});

// ---------- report text ----------

test('truncateReport keeps short text and cuts long text to the limit with a marker', () => {
  assert.equal(truncateReport('짧다', 8000), '짧다');
  const exact = '가'.repeat(8000);
  assert.equal(truncateReport(exact, 8000), exact);
  const cut = truncateReport('가'.repeat(9000), 8000);
  assert.ok(cut.length <= 8000);
  assert.match(cut, /\(잘림\)$/);
});

test('formatMode', () => {
  assert.equal(formatMode({ serial: false, staggerSec: 0 }), '동시');
  assert.equal(formatMode({ serial: false, staggerSec: 20 }), '시차 20초');
  assert.equal(formatMode({ serial: true, staggerSec: 20 }), '순차');
});

test('formatHeader shows status, mode, device, time and tokens', () => {
  const h = formatHeader({
    status: 'complete',
    reason: null,
    mode: '동시',
    device: 'iPhone 13',
    durationMs: 192_000,
    usage: { input: 22, output: 1427, cacheCreation: 9102, cacheRead: 90629 },
    usageApprox: false,
  });
  for (const s of ['상태: 완료', '실행 모드: 동시', '기기: iPhone 13', '3분 12초', '입력 99,753', '출력 1,427'])
    assert.ok(h.includes(s), s);
  assert.ok(!h.includes('근사'));
  assert.ok(!/\$|USD|원/.test(h), 'no money');

  const t = formatHeader({
    status: 'incomplete',
    reason: '시간 상한',
    mode: '순차',
    device: '1280x800',
    durationMs: 61_000,
    usage: { input: 1, output: 2, cacheCreation: 0, cacheRead: 0 },
    usageApprox: true,
  });
  for (const s of ['미완료(시간 상한)', '순차', '1분 1초', '근사']) assert.ok(t.includes(s), s);

  const f = formatHeader({
    status: 'failed',
    reason: '격리',
    mode: '동시',
    device: 'iPhone 13',
    durationMs: 3000,
    usage: null,
    usageApprox: false,
  });
  assert.ok(f.includes('실패(격리)'));
});

// ---------- screenshots ----------

const shot = (i) => `page-2026-11-27T00-00-${String(i).padStart(2, '0')}-000Z.png`;

test('selectScreenshots keeps all up to 20, sorted by name', () => {
  const names = [shot(3), shot(1), 'console-x.log', shot(2), 'page-x.yml'];
  assert.deepEqual(selectScreenshots(names, 5, 15), [shot(1), shot(2), shot(3)]);
});

test('selectScreenshots keeps the first 5 and latest 15 when over 20', () => {
  const names = Array.from({ length: 25 }, (_, i) => shot(i)).reverse();
  const got = selectScreenshots(names, 5, 15);
  assert.equal(got.length, 20);
  assert.deepEqual(got.slice(0, 5), [0, 1, 2, 3, 4].map(shot));
  assert.deepEqual(
    got.slice(5),
    Array.from({ length: 15 }, (_, i) => shot(i + 10)),
  );
});

// ---------- paths ----------

test('runDirName uses local time YYYYMMDD-HHMMSS', () => {
  assert.equal(runDirName('pr-30', new Date(2026, 10, 27, 8, 5, 9)), 'pr-30-20261127-080509');
  assert.equal(runDirName('local', new Date(2026, 0, 2, 23, 59, 0)), 'local-20260102-235900');
});

test('claudeProjectDirName matches how claude names per-folder state', () => {
  assert.equal(
    claudeProjectDirName('/private/var/folders/pg/abc/T/pt-9VC99J'),
    '-private-var-folders-pg-abc-T-pt-9VC99J',
  );
  assert.equal(claudeProjectDirName('/tmp/pt.x_y'), '-tmp-pt-x-y');
});

test('classifyRun: a failure keeps tokens already spent (approximate), none if nothing ran', () => {
  const spent = classifyRun({
    events: [init, asst('a', u(1, 2, 3, 4))],
    timedOut: false,
    exitCode: null,
    abort: '격리',
  });
  assert.deepEqual(spent.usage, { input: 1, output: 2, cacheCreation: 3, cacheRead: 4 });
  assert.equal(spent.usageApprox, true);
  const none = classifyRun({ events: [init], timedOut: false, exitCode: null, abort: '격리' });
  assert.equal(none.usage, null);
});
