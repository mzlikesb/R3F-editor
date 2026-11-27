// Headless screenshots of a Preview for the neon art critique (no persona, no model).
// Usage: node scripts/snapshot.mjs <preview-url> [sha]. Last stdout line is the result folder.
// Playwright is installed outside the repo (no repo dependency): ~/.cache/outpost-snapshot.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  PLAYWRIGHT_PACKAGE,
  VIEWPORTS,
  parseSnapshotArgs,
  parseTarget,
  shotName,
  snapshotDirName,
  snapshotRunInfo,
  sweepPoints,
} from './snapshot-lib.mjs';

const fail = (msg) => {
  console.error(`snapshot: ${msg}`);
  process.exit(2);
};

const args = parseSnapshotArgs(process.argv.slice(2));
if (!args) fail('usage: scripts/snapshot.mjs <preview-url> [sha]');
const target = parseTarget(args.url);
if (!target)
  fail('production·알 수 없는 URL은 거절한다. Preview(https://pr-N-outpost.<계정>.workers.dev)나 localhost만 쓴다');

const toolDir = process.env.SNAPSHOT_TOOL_DIR ?? join(homedir(), '.cache', 'outpost-snapshot');
if (!existsSync(join(toolDir, 'node_modules', 'playwright'))) {
  mkdirSync(toolDir, { recursive: true });
  const r = spawnSync('npm', ['install', '--no-save', '--prefix', toolDir, PLAYWRIGHT_PACKAGE], { stdio: 'inherit' });
  if (r.status !== 0) fail('playwright 설치에 실패했다');
  const c = spawnSync('npx', ['playwright', 'install', 'chromium'], { cwd: toolDir, stdio: 'inherit' });
  if (c.status !== 0) fail('Chromium 준비에 실패했다');
}
const { chromium, devices } = createRequire(join(toolDir, 'x.js'))('playwright');

const runsDir = process.env.SNAPSHOT_RUNS_DIR ?? join(homedir(), '.local', 'share', 'outpost-playtests');
const runDir = join(runsDir, snapshotDirName(target.label, new Date()));
mkdirSync(runDir, { recursive: true });
writeFileSync(
  join(runDir, 'run.json'),
  `${JSON.stringify(snapshotRunInfo({ url: args.url, startedAt: new Date(), sha: args.sha }), null, 2)}\n`,
);

const browser = await chromium.launch();
let shots = 0;
try {
  for (const vp of VIEWPORTS) {
    const base = vp.device ? devices[vp.device] : {};
    const ctx = await browser.newContext({ ...base, viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const dir = join(runDir, vp.name);
    mkdirSync(dir, { recursive: true });
    await page.goto(target.origin, { waitUntil: 'load' });
    // Loading overlay leaves when models and the first snapshot are in.
    await page.waitForSelector('.loading.loading-done', { state: 'attached', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(dir, shotName(1, 'first')) });
    shots++;

    // Look for a faulty module: tap points from the center out until a warn panel opens.
    let found = false;
    for (const p of sweepPoints()) {
      await page.mouse.click(Math.round(p.x * vp.width), Math.round(p.y * vp.height));
      await page.waitForTimeout(250);
      if (await page.locator('aside.panel .status.warn').count()) {
        found = true;
        break;
      }
    }
    if (found) {
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(dir, shotName(2, 'selected')) });
      shots++;
    } else {
      console.error(`snapshot: ${vp.name}: 고장 모듈을 찾지 못했다(고장이 없거나 클릭이 빗나감). 첫 화면만 남긴다`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (shots === 0) fail('스크린샷이 없다');
console.log(runDir);
