// Tests for scripts/snapshot-lib.mjs (node:test). No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSnapshotArgs,
  parseTarget,
  shotName,
  snapshotDirName,
  snapshotRunInfo,
  sweepPoints,
  VIEWPORTS,
} from './snapshot-lib.mjs';

test('URL guard: Preview and localhost pass, production and others are rejected', () => {
  assert.equal(parseTarget('https://pr-64-outpost.mintzzzzz42.workers.dev')?.label, 'pr-64');
  assert.equal(parseTarget('http://localhost:8787')?.label, 'local');
  assert.equal(parseTarget('https://outpost.mintzzzzz42.workers.dev'), null);
  assert.equal(parseTarget('https://example.com'), null);
  assert.equal(parseTarget('nonsense'), null);
});

test('args: url and optional sha only', () => {
  assert.deepEqual(parseSnapshotArgs(['u']), { url: 'u', sha: null });
  assert.deepEqual(parseSnapshotArgs(['u', 'abc']), { url: 'u', sha: 'abc' });
  assert.equal(parseSnapshotArgs([]), null);
  assert.equal(parseSnapshotArgs(['u', 'a', 'b']), null);
});

test('result folder name carries -snap-', () => {
  assert.equal(snapshotDirName('pr-64', new Date(2026, 10, 27, 10, 15, 0)), 'pr-64-snap-20261127-101500');
});

test('shot names sort in capture order', () => {
  assert.deepEqual([shotName(1, 'first'), shotName(2, 'selected')], ['01-first.png', '02-selected.png']);
});

test('viewports are the phone and the pc size', () => {
  assert.deepEqual(
    VIEWPORTS.map((v) => [v.name, v.width, v.height]),
    [
      ['phone', 390, 844],
      ['pc', 1280, 800],
    ],
  );
});

test('sweep starts at the center, stays in the viewport', () => {
  const pts = sweepPoints();
  assert.equal(pts.length, 35);
  assert.ok(Math.abs(pts[0].x - 0.5) < 0.1);
  for (const p of pts) assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
});

test('run.json records sha and kind', () => {
  const info = snapshotRunInfo({ url: 'u', startedAt: new Date(0), sha: 'abc' });
  assert.equal(info.sha, 'abc');
  assert.equal(info.kind, 'snapshot');
});
