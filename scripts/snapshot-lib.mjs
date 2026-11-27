// Pure logic for scripts/snapshot.mjs (no I/O, no browser). The URL guard and the run folder
// naming are shared with the persona playtest (playtest-lib.mjs).
import { parseTarget, runDirName } from './playtest-lib.mjs';

export { parseTarget };

/** Same Chromium build as the playtest's @playwright/mcp (its playwright dependency). */
export const PLAYWRIGHT_PACKAGE = 'playwright@1.66.0-alpha-2026-11-18';

/** One folder per viewport: neon-art-critique picks the shots per sub folder. */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'phone', width: 390, height: 844, device: 'iPhone 13' }),
  Object.freeze({ name: 'pc', width: 1280, height: 800, device: null }),
]);

/** @returns {{ url: string, sha: string | null } | null} null = usage error. */
export function parseSnapshotArgs(argv) {
  const [url, sha, ...rest] = argv;
  if (!url || rest.length > 0) return null;
  return { url, sha: sha || null };
}

/** `pr-7-snap-20261127-101500` for a Preview target. */
export function snapshotDirName(label, date) {
  const base = runDirName(label, date); // pr-7-20261127-101500
  return base.replace(/^(.+?)-(\d{8}-\d{6})$/, '$1-snap-$2');
}

/** `01-first.png`, `02-selected.png`: name order is the picking order. */
export function shotName(index, kind) {
  return `${String(index).padStart(2, '0')}-${kind}.png`;
}

/** Click points (fractions of the viewport) swept from the center out to find a module. */
export function sweepPoints(cols = 7, rows = 5) {
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) pts.push({ x: (c + 0.5) / cols, y: 0.25 + (0.6 * (r + 0.5)) / rows });
  }
  const d = (p) => (p.x - 0.5) ** 2 + (p.y - 0.55) ** 2;
  return pts.sort((a, b) => d(a) - d(b));
}

/** Run metadata saved as run.json. */
export function snapshotRunInfo({ url, startedAt, sha }) {
  return { url, startedAt: startedAt.toISOString(), sha: sha ?? null, kind: 'snapshot' };
}
