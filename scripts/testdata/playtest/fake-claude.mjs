#!/usr/bin/env node
// Stand-in for `claude -p ... --output-format stream-json` in playtest tests. No network, no browser.
// The scenario comes from a `FAKE:<name>` token in the prompt (the persona fixture carries it).
// It records what it was given to $FAKE_LOG_DIR/<scenario>.json so tests can check the launch.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ALLOWED_TOOLS, claudeProjectDirName } from '../../playtest-lib.mjs';

const argv = process.argv.slice(2);
const arg = (name) => argv[argv.indexOf(name) + 1];
const prompt = arg('-p') ?? '';
const scenario = /FAKE:([a-z-]+)/.exec(prompt)?.[1] ?? 'success';
const mcp = JSON.parse(readFileSync(arg('--mcp-config'), 'utf8'));
const mcpArgs = mcp.mcpServers.playwright.args;
const outDir = mcpArgs[mcpArgs.indexOf('--output-dir') + 1];
const cwd = realpathSync(process.cwd());
const logDir = process.env.FAKE_LOG_DIR;

writeFileSync(
  join(logDir, `${scenario}.json`),
  JSON.stringify({
    argv,
    cwd,
    cwdEntries: readdirSync(cwd),
    claudeEnv: Object.keys(process.env).filter((k) => k.startsWith('CLAUDE')),
    mcp,
    startedAt: Date.now(),
  }),
);
// Real claude leaves an empty per-folder state dir behind; the runner must remove it.
mkdirSync(join(homedir(), '.claude', 'projects', claudeProjectDirName(cwd), 'memory'), { recursive: true });

const emit = (e) => process.stdout.write(JSON.stringify(e) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usage = (i, o) => ({
  input_tokens: i,
  output_tokens: o,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 1000,
});
const say = (id, text) =>
  emit({ type: 'assistant', message: { id, content: [{ type: 'text', text }], usage: usage(1, 10) } });
const shots = (n) => {
  mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < n; i++)
    writeFileSync(join(outDir, `page-2026-11-27T00-00-${String(i).padStart(2, '0')}-000Z.png`), 'png');
  writeFileSync(join(outDir, 'console-2026-11-27T00-00-00-000Z.log'), 'log');
};
const init = (tools = ALLOWED_TOOLS) =>
  emit({
    type: 'system',
    subtype: 'init',
    cwd,
    tools,
    mcp_servers: [{ name: 'playwright', status: 'connected' }],
    slash_commands: [],
    skills: [],
    plugins: [{ name: 'cc-plugin-telemetry', source: 'cc-plugin-telemetry@builtin' }],
  });
const success = (result) =>
  emit({ type: 'result', subtype: 'success', is_error: false, result, duration_ms: 4321, usage: usage(20, 300) });
// A child in the same process group stands in for Chromium. Started before init so its pid is
// recorded even if the runner kills the group right after init.
const startBrowser = () => {
  process.on('SIGTERM', () => {}); // ignore, so the runner has to escalate to SIGKILL
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' });
  writeFileSync(join(logDir, `${scenario}.child`), String(child.pid));
};
const hangForever = async () => {
  for (;;) await sleep(1000);
};

switch (scenario) {
  case 'success':
  case 'success-pc':
    init();
    say('m1', '들어가 본다');
    shots(3);
    await sleep(400); // long enough for concurrent runs to overlap
    success(`REPORT ${scenario}`);
    break;
  case 'many':
    init();
    shots(25);
    success('REPORT many');
    break;
  case 'long':
    init();
    shots(1);
    success('가'.repeat(9000));
    break;
  case 'maxturns':
    init();
    say('m1', '첫 문단');
    say('m1', '첫 문단'); // same message id again: must be counted once
    say('m2', '둘째 문단');
    shots(2);
    emit({ type: 'result', subtype: 'error_max_turns', is_error: true, usage: usage(7, 70) });
    process.exitCode = 1;
    break;
  case 'hang':
    startBrowser();
    init();
    say('m1', '보는 중');
    shots(1);
    await hangForever();
    break;
  case 'leak':
    startBrowser();
    init([...ALLOWED_TOOLS, 'mcp__playwright__browser_snapshot']);
    await hangForever();
    break;
  case 'ratelimit':
    init();
    emit({
      type: 'result',
      subtype: 'success',
      is_error: true,
      terminal_reason: 'api_error',
      api_error_status: 429,
      result: 'rate limited',
    });
    process.exitCode = 1;
    break;
  case 'crash':
    process.exitCode = 3;
    break;
  default:
    throw new Error(`unknown scenario ${scenario}`);
}
