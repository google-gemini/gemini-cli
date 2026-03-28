#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * audit-test-noise.mjs
 *
 * Measures how many lines each test file emits to stdout/stderr when passing.
 * Helps identify the noisiest tests in the suite (see issue #23328).
 *
 * Usage:
 *   node scripts/audit-test-noise.mjs
 *   node scripts/audit-test-noise.mjs --top 20
 *   node scripts/audit-test-noise.mjs --package core
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

// --- Argument parsing ---
const args = process.argv.slice(2);
const topN = parseInt(args[args.indexOf('--top') + 1] ?? '10', 10);
const filterPackage = args[args.indexOf('--package') + 1] ?? null;

// --- Discover test files ---
function findTestFiles(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      findTestFiles(fullPath, results);
    } else if (entry.isFile() && /\.test\.ts$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const packagesDir = join(ROOT, 'packages');
const packages = readdirSync(packagesDir).filter((p) => {
  if (filterPackage && p !== filterPackage) return false;
  return statSync(join(packagesDir, p)).isDirectory();
});

const testFiles = packages.flatMap((pkg) =>
  findTestFiles(join(packagesDir, pkg, 'src')),
);

console.log(`Found ${testFiles.length} test files. Running each individually...\n`);

// --- Run each test file and count its output lines ---
const results = [];

for (const testFile of testFiles) {
  const relPath = relative(ROOT, testFile);
  process.stdout.write(`  checking ${relPath}...`);

  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=verbose', testFile],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, FORCE_COLOR: '0' },
    },
  );

  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const lineCount = output.split('\n').filter(Boolean).length;
  const passed = result.status === 0;

  results.push({ file: relPath, lineCount, passed });
  process.stdout.write(` ${lineCount} lines ${passed ? '✓' : '✗'}\n`);
}

// --- Print ranked summary ---
const passing = results.filter((r) => r.passed);
const sorted = [...passing].sort((a, b) => b.lineCount - a.lineCount);
const top = sorted.slice(0, topN);

console.log(`\n${'─'.repeat(70)}`);
console.log(`TOP ${topN} NOISIEST PASSING TEST FILES (lines of output)`);
console.log(`${'─'.repeat(70)}`);
for (const { file, lineCount } of top) {
  console.log(`  ${String(lineCount).padStart(6)}  ${file}`);
}

const totalLines = passing.reduce((s, r) => s + r.lineCount, 0);
console.log(`${'─'.repeat(70)}`);
console.log(`Total lines from passing tests: ${totalLines}`);
console.log(
  `Goal: each file ≤ 1 line  |  Remaining work: ${passing.filter((r) => r.lineCount > 1).length} files\n`,
);
