// Pure logic for scripts/playtest.mjs. No I/O here, so it can be tested without a browser or network.
// Constants are the contract fixed by the T0 check (docs/plans/004-tasks.md). Function bodies are T1's job.

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

const todo = (name) => () => {
  throw new Error(`${name}: not implemented`);
};

/** @returns {{ origin: string, label: string } | null} null = rejected (production, other hosts, bad URL). */
export const parseTarget = todo('parseTarget');
/** @returns {{ serial: boolean, url: string, personas: string[] }} throws on bad usage. */
export const parseArgs = todo('parseArgs');
/** @returns {{ kind: 'device', name: string } | { kind: 'viewport', size: string }} throws if missing. */
export const readDevice = todo('readDevice');
/** @returns {string[]} Playwright MCP flags for the device. */
export const deviceArgs = todo('deviceArgs');
/** @returns {{ mcpServers: Record<string, { command: string, args: string[] }> }} */
export const buildMcpConfig = todo('buildMcpConfig');
/** @returns {string[]} claude CLI args (without the binary). */
export const buildClaudeArgs = todo('buildClaudeArgs');
/** @returns {string} */
export const buildPrompt = todo('buildPrompt');
/** @returns {{ ok: true } | { ok: false, reason: string }} */
export const checkIsolation = todo('checkIsolation');
/** @returns {{ input: number, output: number, cacheCreation: number, cacheRead: number }} */
export const sumUsage = todo('sumUsage');
/** @returns {{ status: 'complete' | 'incomplete' | 'failed', reason: string | null, report: string, durationMs: number | null, usage: object | null, usageApprox: boolean }} */
export const classifyRun = todo('classifyRun');
/** @returns {string} */
export const truncateReport = todo('truncateReport');
/** @returns {string[]} */
export const selectScreenshots = todo('selectScreenshots');
/** @returns {string} */
export const formatMode = todo('formatMode');
/** @returns {string} */
export const formatHeader = todo('formatHeader');
/** @returns {string} */
export const runDirName = todo('runDirName');
/** @returns {string} */
export const claudeProjectDirName = todo('claudeProjectDirName');
