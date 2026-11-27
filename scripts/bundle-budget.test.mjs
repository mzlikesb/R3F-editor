import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { check } from './bundle-budget.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'bundle-budget.mjs');
const KB = 1024;

// Incompressible bytes, so gzip size is about the raw size.
function fixture({ entryKb, depKb, lazyKb, modelKb }) {
  const dist = mkdtempSync(join(tmpdir(), 'budget-'));
  for (const d of ['assets', '.vite', 'models']) mkdirSync(join(dist, d));
  const put = (rel, kb) => writeFileSync(join(dist, rel), randomBytes(kb * KB));
  put('assets/index.js', entryKb);
  put('assets/vendor.js', depKb);
  put('assets/lazy.js', lazyKb);
  put('models/base.glb', modelKb);
  writeFileSync(join(dist, 'assets/index.css'), 'body{}');
  writeFileSync(join(dist, 'index.html'), '<html></html>');
  writeFileSync(
    join(dist, '.vite/manifest.json'),
    JSON.stringify({
      'index.html': {
        file: 'assets/index.js',
        src: 'index.html',
        isEntry: true,
        imports: ['_vendor.js'],
        dynamicImports: ['lazy.ts'],
        css: ['assets/index.css'],
      },
      '_vendor.js': { file: 'assets/vendor.js' },
      'lazy.ts': { file: 'assets/lazy.js', isDynamicEntry: true, imports: ['_vendor.js'] },
    }),
  );
  return dist;
}

test('under budget passes and counts entry + static import as initial', () => {
  const r = check(fixture({ entryKb: 100, depKb: 200, lazyKb: 50, modelKb: 500 }));
  assert.deepEqual(r.errors, []);
  assert.ok(r.initialGzip > 300 * KB && r.initialGzip < 310 * KB);
});

test('lazy chunks are reported apart and never count toward the initial budget', () => {
  const r = check(fixture({ entryKb: 100, depKb: 100, lazyKb: 600, modelKb: 10 }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.lazyCount, 1);
  assert.ok(r.lazyGzip > 600 * KB);
  assert.ok(r.initialGzip < 210 * KB);
});

test('initial JS over 450KB fails', () => {
  const r = check(fixture({ entryKb: 300, depKb: 200, lazyKb: 1, modelKb: 10 }));
  assert.deepEqual(r.errors, ['initial JS is over budget']);
});

test('static assets over 3MB fail', () => {
  const r = check(fixture({ entryKb: 10, depKb: 10, lazyKb: 1, modelKb: 3100 }));
  assert.deepEqual(r.errors, ['static assets are over budget']);
});

test('cli exits 1 when over budget and 0 when within', () => {
  const bad = fixture({ entryKb: 300, depKb: 200, lazyKb: 1, modelKb: 10 });
  assert.equal(spawnSync('node', [script, bad]).status, 1);
  const good = fixture({ entryKb: 10, depKb: 10, lazyKb: 1, modelKb: 10 });
  assert.match(execFileSync('node', [script, good]).toString(), /bundle budget ok/);
});
