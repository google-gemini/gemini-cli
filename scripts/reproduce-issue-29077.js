/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { FileDiscoveryService } from '../packages/core/dist/src/services/fileDiscoveryService.js';

async function runReproduction() {
  console.log('=== Reproducing Issue #29077 ===\n');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-repro-29077-'));
  let hasFailure = false;

  try {
    execSync('git init -q', { cwd: tmpDir });

    // 1. Populate realistic .gitignore and .geminiignore rules
    const gitignoreRules = [
      'node_modules/**',
      'dist/',
      'build/**',
      'coverage/',
      '.cache/**',
    ];
    for (let i = 0; i < 95; i++) {
      gitignoreRules.push(`temp_dir_${i}/**`);
      gitignoreRules.push(`*.ext_${i}`);
    }
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      gitignoreRules.join('\n'),
    );

    const geminiRules = ['secret_files/**', 'internal_docs/'];
    for (let i = 0; i < 20; i++) {
      geminiRules.push(`gemini_rule_${i}/**`);
    }
    fs.writeFileSync(
      path.join(tmpDir, '.geminiignore'),
      geminiRules.join('\n'),
    );

    const service = new FileDiscoveryService(tmpDir);

    // Test 1: Wildcard directory subtree pruning
    console.log(
      'Test 1: Subtree pruning on wildcard directory pattern (node_modules/**)',
    );
    const nodeModulesDir = path.join(tmpDir, 'node_modules');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(nodeModulesDir, 'dummy.js'),
      'module.exports = {};',
    );

    const isNodeModulesIgnored = service.shouldIgnoreDirectory(nodeModulesDir);
    console.log(
      `  shouldIgnoreDirectory('node_modules'): ${isNodeModulesIgnored}`,
    );
    if (!isNodeModulesIgnored) {
      console.log(
        '  ❌ FAIL: shouldIgnoreDirectory returned false for "node_modules" with "node_modules/**" rule.',
      );
      console.log(
        '          Subtree pruning fails, causing getIgnoredPaths to walk the entire directory tree.',
      );
      hasFailure = true;
    } else {
      console.log('  ✓ PASS: Directory is correctly identified as ignored.');
    }

    // Test 2: In-memory ignore filtering performance budget
    console.log(
      '\nTest 2: Performance budget for filterFilesWithReport (10,000 files, depth 6, 120 rules)',
    );
    const files = [];
    for (let d = 0; d < 50; d++) {
      const relDir = path.join(
        'packages',
        `pkg_${d}`,
        'src',
        'components',
        'sub',
      );
      for (let f = 0; f < 200; f++) {
        files.push(path.join(relDir, `file_${f}.ts`));
      }
    }

    const start = performance.now();
    service.filterFilesWithReport(files);
    const durationMs = performance.now() - start;
    console.log(
      `  Filtered ${files.length} paths in ${durationMs.toFixed(1)}ms (${(durationMs / 1000).toFixed(2)}s)`,
    );

    const TARGET_BUDGET_MS = 500;
    if (durationMs > TARGET_BUDGET_MS) {
      console.log(
        `  ❌ FAIL: Filtering exceeded budget of ${TARGET_BUDGET_MS}ms (took ${durationMs.toFixed(1)}ms).`,
      );
      console.log(
        '          Root cause: O(Depth * N) pattern recompilation without directory memoization.',
      );
      hasFailure = true;
    } else {
      console.log(
        `  ✓ PASS: Completed within performance budget of ${TARGET_BUDGET_MS}ms.`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n=== Reproduction Summary ===');
  if (hasFailure) {
    console.log(
      'Issue #29077 reproduced successfully: The unfixed code failed the expected checks.',
    );
    process.exit(1);
  } else {
    console.log('All checks passed.');
    process.exit(0);
  }
}

runReproduction().catch((err) => {
  console.error(err);
  process.exit(1);
});
