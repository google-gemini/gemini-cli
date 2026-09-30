/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { FileDiscoveryService } from './fileDiscoveryService.js';
import { GEMINI_IGNORE_FILE_NAME } from '../config/constants.js';

describe('Issue #29077: Subtree pruning and filtering performance', () => {
  let testRootDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-issue-29077-'),
    );
    projectRoot = path.join(testRootDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should prune directory subtrees matching wildcard patterns in shouldIgnoreDirectory', async () => {
    // When ignore pattern is node_modules/**, the directory itself should be ignored
    // to prevent walking and traversing its thousands of subdirectories.
    await fs.writeFile(
      path.join(projectRoot, '.gitignore'),
      'node_modules/**\nbuild/**\n',
    );

    const nodeModulesDir = path.join(projectRoot, 'node_modules');
    await fs.mkdir(nodeModulesDir, { recursive: true });

    const service = new FileDiscoveryService(projectRoot);

    expect(service.shouldIgnoreDirectory(nodeModulesDir)).toBe(true);
  });

  it('should filter 5,000 files across nested directories within performance budget (< 1000ms)', async () => {
    // Generate 120 ignore patterns across .gitignore and .geminiignore
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
    await fs.writeFile(
      path.join(projectRoot, '.gitignore'),
      gitignoreRules.join('\n'),
    );

    const geminiRules = ['secret_files/**', 'internal_docs/'];
    for (let i = 0; i < 20; i++) {
      geminiRules.push(`gemini_rule_${i}/**`);
    }
    await fs.writeFile(
      path.join(projectRoot, GEMINI_IGNORE_FILE_NAME),
      geminiRules.join('\n'),
    );

    // 5,000 files at depth 6 across 50 sibling directories
    const files: string[] = [];
    for (let d = 0; d < 50; d++) {
      const relDir = path.join(
        'packages',
        `pkg_${d}`,
        'src',
        'components',
        'sub',
      );
      for (let f = 0; f < 100; f++) {
        files.push(path.join(relDir, `file_${f}.ts`));
      }
    }

    const service = new FileDiscoveryService(projectRoot);

    const start = performance.now();
    service.filterFilesWithReport(files);
    const durationMs = performance.now() - start;

    // Without memoization, this took ~2,000ms under vitest and multiple seconds for large trees.
    // With directory-level memoization, this finishes in ~100-200ms (or < 600ms under full v8 coverage).
    expect(durationMs).toBeLessThan(1000);
  });
});
