// Pure logic for scripts/playtest.mjs. No I/O here, so it can be tested without a browser or network.
// Constants are the contract fixed by the T0 check (docs/plans/004-tasks.md).

export const PLAYWRIGHT_MCP_PACKAGE = '@playwright/mcp@0.0.86';
export const MCP_SERVER_NAME = 'playwright';
const PREFIX = `mcp__${MCP_SERVER_NAME}__browser_`;

/** Tools a player gets: what a person can do by looking at the screen. Exact, no wildcards. */
export const ALLOWED_TOOLS = [
  'navigate',
  'navigate_back',
  'take_screenshot',
  'mouse_click_xy',
  'mouse_move_xy',
  'mouse_down',
  'mouse_up',
  'mouse_drag_xy',
  'mouse_wheel',
  'press_key',
  'wait_for',
].map((t) => PREFIX + t);

/**
 * Every other tool @playwright/mcp@0.0.86 exposes with `--caps vision`. An allowlist alone keeps
 * them in the model's tool list (T0), so they are removed with --disallowedTools as well.
 */
export const DENIED_TOOLS = [
  'click',
  'close',
  'console_messages',
  'drag',
  'drop',
  'emulate_media',
  'evaluate',
  'file_upload',
  'fill_form',
  'find',
  'handle_dialog',
  'hover',
  'network_request',
  'network_requests',
  'resize',
  'run_code_unsafe',
  'select_option',
  'snapshot',
  'tabs',
  'type',
].map((t) => PREFIX + t);

export const DEFAULTS = Object.freeze({
  actionBudget: 15,
  maxTurns: 80,
  timeoutSec: 600,
  killGraceMs: 5000,
  staggerSec: 0,
  reportMaxChars: 8000,
  firstShots: 5,
  latestShots: 15,
});

const DONE_STATUS = Object.freeze({ complete: '완료', incomplete: '미완료', failed: '실패' });

/** @returns {{ origin: string, label: string } | null} null = rejected (production, other hosts, bad URL). */
export function parseTarget(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (url.protocol === 'https:' && url.port === '') {
    const m = /^pr-(\d+)-outpost\.[a-z0-9-]+\.workers\.dev$/.exec(url.hostname);
    if (m) return { origin: url.origin, label: `pr-${m[1]}` };
    return null;
  }
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === 'localhost') {
    return { origin: url.origin, label: 'local' };
  }
  return null;
}

/** @returns {{ serial: boolean, url: string, personas: string[] }} throws on bad usage. */
export function parseArgs(argv) {
  let serial = false;
  let sha = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--serial') serial = true;
    else if (a === '--sha') {
      sha = argv[++i];
      if (!sha || sha.startsWith('--')) throw new Error('--sha 값이 없다');
    } else if (a.startsWith('--sha=')) sha = a.slice(6) || null;
    else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    else rest.push(a);
  }
  if (rest.length === 0) throw new Error('사용법: playtest.sh [--serial] [--sha <SHA>] <URL> [페르소나…]');
  const [url, ...personas] = rest;
  return { serial, sha, url, personas };
}

/** Metadata saved as run.json in the result folder. sha is the tested commit, when given. */
export function buildRunInfo({ url, startedAt, sha }) {
  return { url, startedAt: startedAt.toISOString(), sha: sha ?? null };
}

/** @returns {{ kind: 'device', name: string } | { kind: 'viewport', size: string }} throws if missing. */
export function readDevice(text) {
  const m = /^device:[ \t]*(\S.*?)[ \t]*$/.exec(text.split('\n')[0].replace(/\r$/, ''));
  if (!m) throw new Error('페르소나 문서 첫 줄에 `device: …`가 없다');
  const value = m[1];
  return /^\d+x\d+$/.test(value) ? { kind: 'viewport', size: value } : { kind: 'device', name: value };
}

/** @returns {string[]} Playwright MCP flags for the device. */
export function deviceArgs(device) {
  return device.kind === 'viewport' ? ['--viewport-size', device.size] : ['--device', device.name];
}

/** @returns {{ mcpServers: Record<string, { command: string, args: string[] }> }} */
export function buildMcpConfig({ origin, device, outputDir }) {
  return {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: 'npx',
        args: [
          '-y',
          PLAYWRIGHT_MCP_PACKAGE,
          '--isolated',
          '--headless',
          '--caps',
          'vision',
          '--browser',
          'chromium',
          '--snapshot-mode',
          'none',
          '--no-webmcp',
          '--allowed-origins',
          origin,
          '--output-dir',
          outputDir,
          ...deviceArgs(device),
        ],
      },
    },
  };
}

/** @returns {string[]} claude CLI args (without the binary). */
export function buildClaudeArgs({ prompt, mcpConfigPath, maxTurns }) {
  return [
    '-p',
    prompt,
    '--model',
    'sonnet',
    '--tools',
    '',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfigPath,
    '--allowedTools',
    ALLOWED_TOOLS.join(','),
    '--disallowedTools',
    DENIED_TOOLS.join(','),
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(maxTurns),
  ];
}

/** @returns {string} */
export function buildPrompt({ url, persona, template, budget }) {
  return [
    '아래 인물이 되어 주소 하나를 열고 직접 써 본다. 인물 소개에 없는 것은 모른다.',
    '',
    `주소: ${url}`,
    '',
    '## 인물',
    '',
    persona.trim(),
    '',
    '## 방법',
    '',
    '- 화면(스크린샷)에 보이는 것만 근거로 판단한다. 사람이 화면을 보고 할 수 있는 조작만 쓴다.',
    '- 스크린샷은 `filename` 없이 찍는다. `filename`을 주면 이미지가 돌아오지 않는다.',
    '- 누르기 전에 마우스를 그 위치로 옮겨야 한다. 오래 눌러야 할 때는 누른 채로 기다린 뒤 뗀다.',
    `- 행동(이동·클릭·누르기·키 입력)은 최대 ${budget}회다. 예산이 끝나면 더 하지 말고 리포트를 쓴다.`,
    '- 리포트의 각 항목마다 근거가 된 스크린샷 파일 이름을 적는다.',
    '',
    '## 리포트 형식',
    '',
    template.trim(),
    '',
  ].join('\n');
}

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function checkIsolation(init) {
  const fail = (reason) => ({ ok: false, reason });
  if (!init || typeof init !== 'object') return fail('init 이벤트 없음');
  const tools = init.tools;
  if (!Array.isArray(tools)) return fail('도구 목록 없음');
  if (tools.some((t) => typeof t !== 'string')) return fail('도구 목록 형태가 다름');
  const allowed = new Set(ALLOWED_TOOLS);
  const extra = tools.filter((t) => !allowed.has(t));
  if (extra.length > 0) return fail(`허용 목록 밖 도구: ${extra.join(', ')}`);
  const missing = ALLOWED_TOOLS.filter((t) => !tools.includes(t));
  if (missing.length > 0) return fail(`빠진 도구: ${missing.join(', ')}`);
  const servers = init.mcp_servers;
  if (
    !Array.isArray(servers) ||
    servers.length !== 1 ||
    servers[0]?.name !== MCP_SERVER_NAME ||
    servers[0]?.status !== 'connected'
  )
    return fail('MCP 서버가 playwright 하나로 연결되지 않음');
  if (!Array.isArray(init.skills) || init.skills.length > 0) return fail('스킬이 섞임');
  if (!Array.isArray(init.slash_commands) || init.slash_commands.length > 0) return fail('슬래시 명령이 섞임');
  if (!Array.isArray(init.plugins)) return fail('플러그인 목록 없음');
  const outside = init.plugins.filter((p) => !String(p?.source ?? '').endsWith('@builtin'));
  if (outside.length > 0) return fail(`내장이 아닌 플러그인: ${outside.map((p) => p?.name).join(', ')}`);
  return { ok: true };
}

const toUsage = (u) => ({
  input: u?.input_tokens ?? 0,
  output: u?.output_tokens ?? 0,
  cacheCreation: u?.cache_creation_input_tokens ?? 0,
  cacheRead: u?.cache_read_input_tokens ?? 0,
});

/** Assistant events deduped by message.id (the last snapshot wins, first-seen order kept). */
function assistantMessages(events) {
  const byId = new Map();
  let anon = 0;
  for (const e of events) {
    if (e?.type !== 'assistant' || !e.message) continue;
    byId.set(e.message.id ?? `anon-${anon++}`, e.message);
  }
  return [...byId.values()];
}

/** @returns {{ input: number, output: number, cacheCreation: number, cacheRead: number }} */
export function sumUsage(events) {
  const total = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
  for (const m of assistantMessages(events)) {
    if (!m.usage) continue;
    const u = toUsage(m.usage);
    total.input += u.input;
    total.output += u.output;
    total.cacheCreation += u.cacheCreation;
    total.cacheRead += u.cacheRead;
  }
  return total;
}

const assistantText = (events) =>
  assistantMessages(events)
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((c) => c?.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n\n');

/** @returns {{ status: 'complete' | 'incomplete' | 'failed', reason: string | null, report: string, durationMs: number | null, usage: object | null, usageApprox: boolean }} */
export function classifyRun({ events, timedOut, exitCode, abort }) {
  // A failure can still have spent tokens (e.g. a turn that ran before an isolation kill).
  const spent = assistantMessages(events).some((m) => m.usage);
  const failed = (reason) => ({
    status: 'failed',
    reason,
    report: '',
    durationMs: null,
    usage: spent ? sumUsage(events) : null,
    usageApprox: spent,
  });
  if (abort) return failed(abort);
  if (!events.some((e) => e?.type === 'system' && e.subtype === 'init')) return failed('시작하지 못함');
  const result = events.findLast((e) => e?.type === 'result');
  const incomplete = (reason) => ({
    status: 'incomplete',
    reason,
    report: assistantText(events),
    durationMs: null,
    usage: result?.usage ? toUsage(result.usage) : sumUsage(events),
    usageApprox: !result?.usage,
  });
  if (result) {
    if (result.is_error && (result.terminal_reason === 'api_error' || result.api_error_status != null)) {
      const status = result.api_error_status != null ? ` ${result.api_error_status}` : '';
      return failed(`API 오류${status}`);
    }
    if (result.subtype === 'success' && !timedOut) {
      if (result.is_error) return failed('오류 결과');
      return {
        status: 'complete',
        reason: null,
        report: String(result.result ?? ''),
        durationMs: result.duration_ms ?? null,
        usage: toUsage(result.usage),
        usageApprox: false,
      };
    }
    if (result.subtype === 'error_max_turns') return incomplete('턴 상한');
    if (timedOut) return incomplete('시간 상한'); // a result after our SIGTERM does not make the run complete
    return incomplete(String(result.subtype));
  }
  if (timedOut) return incomplete('시간 상한');
  return failed(`결과 없이 종료(코드 ${exitCode})`);
}

/** @returns {string} */
export function truncateReport(text, max = DEFAULTS.reportMaxChars) {
  if (text.length <= max) return text;
  const marker = '\n\n(잘림)';
  return text.slice(0, max - marker.length) + marker;
}

/** @returns {string[]} */
export function selectScreenshots(names, first = DEFAULTS.firstShots, latest = DEFAULTS.latestShots) {
  const pngs = names.filter((n) => n.endsWith('.png')).sort();
  if (pngs.length <= first + latest) return pngs;
  return [...pngs.slice(0, first), ...pngs.slice(pngs.length - latest)];
}

/** @returns {string} */
export function formatMode({ serial, staggerSec }) {
  if (serial) return '순차';
  return staggerSec > 0 ? `시차 ${staggerSec}초` : '동시';
}

const num = (n) => n.toLocaleString('en-US');

/** @returns {string} */
export function formatHeader({ status, reason, mode, device, durationMs, usage, usageApprox }) {
  const state = status === 'complete' ? DONE_STATUS.complete : `${DONE_STATUS[status]}(${reason})`;
  const secs = Math.round((durationMs ?? 0) / 1000);
  const time = durationMs == null ? '알 수 없음' : `${Math.floor(secs / 60)}분 ${secs % 60}초`;
  const tokens = usage
    ? // Summed from the stream: input matches result.usage, but output is only the first chunk of each turn.
      `입력 ${num(usage.input + usage.cacheCreation + usage.cacheRead)} · 출력 ${num(usage.output)}${usageApprox ? ' 이상 (근사)' : ''}`
    : '없음';
  return [`상태: ${state}`, `실행 모드: ${mode}`, `기기: ${device}`, `시간: ${time}`, `토큰: ${tokens}`].join('\n');
}

/** @returns {string} */
export function runDirName(label, date) {
  const p = (n) => String(n).padStart(2, '0');
  const d = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const t = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${label}-${d}-${t}`;
}

/** @returns {string} */
export function claudeProjectDirName(realPath) {
  return realPath.replace(/[^a-zA-Z0-9]/g, '-');
}
