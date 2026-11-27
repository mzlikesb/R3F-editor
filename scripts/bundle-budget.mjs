#!/usr/bin/env node
// Bundle budget check on a `vite build` output (needs build.manifest).
//  1. initial JS: the chunk index.html loads + its static imports, gzip sum
//  2. lazy JS: every other chunk, sum only (reported, not budgeted)
//  3. static assets: public/ binaries copied into dist (models, hdri, draco ...), raw sum
// Exits 1 when (1) or (3) is over budget. Usage: bundle-budget.mjs [distDir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

// Budgets in KiB (1024 bytes). Changing these is a user decision (AGENTS.md).
const INITIAL_JS_GZIP_BUDGET_KB = 450;
const STATIC_ASSETS_BUDGET_KB = 3072;

const kb = (bytes) => (bytes / 1024).toFixed(1);
const gzipSize = (file) => gzipSync(readFileSync(file), { level: 9 }).length;

/** Files under dist that are not build output (assets/, .vite/, index.html). */
function publicFiles(dist) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dist);
  return out.filter((f) => {
    const rel = relative(dist, f).split('\\').join('/');
    return !rel.startsWith('assets/') && !rel.startsWith('.vite/') && rel !== 'index.html';
  });
}

export function measure(dist) {
  const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));
  const entry = Object.values(manifest).find((c) => c.isEntry && c.src === 'index.html');
  if (!entry) throw new Error('manifest has no index.html entry');

  const initial = new Set();
  const visit = (key) => {
    if (initial.has(key)) return;
    initial.add(key);
    for (const dep of manifest[key].imports ?? []) visit(dep);
  };
  visit(Object.keys(manifest).find((k) => manifest[k] === entry));

  let initialGzip = 0;
  let lazyGzip = 0;
  let lazyCount = 0;
  for (const [key, chunk] of Object.entries(manifest)) {
    if (!chunk.file.endsWith('.js')) continue;
    const size = gzipSize(join(dist, chunk.file));
    if (initial.has(key)) initialGzip += size;
    else {
      lazyGzip += size;
      lazyCount += 1;
    }
  }
  const staticBytes = publicFiles(dist).reduce((sum, f) => sum + statSync(f).size, 0);
  return { initialGzip, lazyGzip, lazyCount, staticBytes };
}

export function check(dist, budgets = {}) {
  const jsBudget = (budgets.initialJsKb ?? INITIAL_JS_GZIP_BUDGET_KB) * 1024;
  const staticBudget = (budgets.staticKb ?? STATIC_ASSETS_BUDGET_KB) * 1024;
  const m = measure(dist);
  const lines = [
    `initial JS (gzip): ${kb(m.initialGzip)} KB / budget ${kb(jsBudget)} KB`,
    `lazy JS (gzip, ${m.lazyCount} chunks): ${kb(m.lazyGzip)} KB (no budget)`,
    `static assets: ${kb(m.staticBytes)} KB / budget ${kb(staticBudget)} KB`,
  ];
  const errors = [];
  if (m.initialGzip > jsBudget) errors.push('initial JS is over budget');
  if (m.staticBytes > staticBudget) errors.push('static assets are over budget');
  return { ...m, lines, errors };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = check(process.argv[2] ?? 'dist');
  console.log(result.lines.join('\n'));
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log('bundle budget ok');
}
