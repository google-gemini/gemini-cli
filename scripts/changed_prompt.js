/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Intelligence layer for detecting steering and behavior changes.
 *
 * This script identifies if code changes affect model steering (system prompts,
 * tool definitions, agent instructions) and maps them to relevant evaluation
 * suites. It supports both CI (GitHub Actions) and local development workflows.
 *
 * Detection Methods:
 * 1. Path-based: Monitors critical steering and tool directories.
 * 2. Signature-based: Scans diff content for core steering primitives
 *    (e.g., ToolDefinition, inputSchema).
 * 3. Suite-aware: Uses evals/suites.json to identify related tests for surgical runs.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { minimatch } from 'minimatch';

const CORE_STEERING_PATHS = [
  'packages/core/src/prompts/',
  'packages/core/src/tools/',
];

const TEST_PATHS = ['evals/'];

const STEERING_SIGNATURES = [
  'LocalAgentDefinition',
  'LocalInvocation',
  'ToolDefinition',
  'inputSchema',
  "kind: 'local'",
];

function main() {
  const targetBranch = process.env.GITHUB_BASE_REF || 'main';
  const verbose = process.argv.includes('--verbose');
  const steeringOnly = process.argv.includes('--steering-only');
  const isRelatedMode = process.argv.includes('--related');
  const isJsonMode = process.argv.includes('--json');

  try {
    const remoteUrl = process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}.git`
      : 'origin';

    let changedFiles = [];
    const isCi = !!process.env.GITHUB_ACTIONS;

    if (isCi) {
      try {
        // 1. Try fetching from remote (CI environment)
        execSync(`git fetch ${remoteUrl} ${targetBranch}`, {
          stdio: 'ignore',
        });

        // Get changed files using the triple-dot syntax which correctly handles merge commits
        const head = process.env.PR_HEAD_SHA || 'HEAD';
        changedFiles = execSync(`git diff --name-only FETCH_HEAD...${head}`, {
          encoding: 'utf-8',
        })
          .split('\n')
          .filter(Boolean);
      } catch (e) {
        if (verbose)
          process.stderr.write(
            `Warning: git fetch failed in CI: ${e.message}\n`,
          );
      }
    }

    // 2. Local fallback or if CI fetch failed: Try diffing against target branch
    if (changedFiles.length === 0) {
      try {
        changedFiles = execSync(`git diff --name-only ${targetBranch}`, {
          encoding: 'utf-8',
        })
          .split('\n')
          .filter(Boolean);
      } catch {
        // 3. Last resort: Just diff against HEAD (uncommitted changes only)
        changedFiles = execSync('git diff --name-only HEAD', {
          encoding: 'utf-8',
        })
          .split('\n')
          .filter(Boolean);
      }

      // Also include untracked files in local mode
      const untracked = execSync('git ls-files --others --exclude-standard', {
        encoding: 'utf-8',
      })
        .split('\n')
        .filter(Boolean);
      changedFiles = [...new Set([...changedFiles, ...untracked])];
    }

    let detected = false;
    const reasons = [];
    const affectedSuites = new Set();
    const rationales = [];
    const modifiedTestFiles = [];

    // Load suites for --related mode
    let suitesConfig = null;
    if (isRelatedMode) {
      try {
        suitesConfig = JSON.parse(
          fs.readFileSync('evals/suites.json', 'utf-8'),
        );
      } catch {
        process.stderr.write(`Warning: Could not load evals/suites.json\n`);
      }
    }

    // 1. Path-based detection
    for (const file of changedFiles) {
      if (CORE_STEERING_PATHS.some((prefix) => file.startsWith(prefix))) {
        detected = true;
        reasons.push(`Matched core steering path: ${file}`);
      }
      if (
        !steeringOnly &&
        TEST_PATHS.some((prefix) => file.startsWith(prefix)) &&
        file.endsWith('.eval.ts')
      ) {
        detected = true;
        reasons.push(`Matched test file: ${file}`);
        modifiedTestFiles.push(file);
      }

      // Related suite detection
      if (suitesConfig) {
        for (const [suiteName, suite] of Object.entries(suitesConfig)) {
          if (suiteName === 'allowedOverlaps' || !suite.patterns) continue;

          if (suite.patterns.some((pattern) => minimatch(file, pattern))) {
            affectedSuites.add(suiteName);
            const isTestFile = file.endsWith('.eval.ts');
            const rationale = isTestFile
              ? `Force-testing all tests in **${file}** (part of **${suiteName}** suite) because the file was modified.`
              : `Testing **${suiteName}** because **${file}** was modified.`;
            rationales.push(rationale);
          }
        }
      }
    }

    // 2. Signature-based detection (only in packages/core/src/ and only if not already detected or if verbose)
    if (!detected || verbose) {
      const coreChanges = changedFiles.filter((f) =>
        f.startsWith('packages/core/src/'),
      );
      if (coreChanges.length > 0) {
        // Get the actual diff content for core files
        // We need to be careful with the diff command depending on if we have FETCH_HEAD
        let diffCmd = '';
        try {
          const head = process.env.PR_HEAD_SHA || 'HEAD';
          diffCmd = `git diff -U0 FETCH_HEAD...${head} -- packages/core/src/`;
          execSync('git rev-parse FETCH_HEAD', { stdio: 'ignore' });
        } catch {
          diffCmd = `git diff -U0 ${targetBranch} -- packages/core/src/`;
        }

        const diff = execSync(diffCmd, { encoding: 'utf-8' });
        for (const sig of STEERING_SIGNATURES) {
          if (diff.includes(sig)) {
            detected = true;
            reasons.push(`Matched steering signature in core: ${sig}`);

            // If we detected a steering signature, mark core_steering suite
            if (isRelatedMode) {
              affectedSuites.add('core_steering');
              rationales.push(
                `Testing **core_steering** because matched signature '${sig}' in core files.`,
              );
            }
            if (!verbose && !isRelatedMode) break;
          }
        }
      }
    }

    if (verbose && reasons.length > 0) {
      process.stderr.write('Detection reasons:\n');
      reasons.forEach((r) => process.stderr.write(` - ${r}\n`));
    }

    if (isJsonMode) {
      process.stdout.write(
        JSON.stringify(
          {
            detected,
            reasons,
            affectedSuites: Array.from(affectedSuites),
            rationales,
            modifiedTestFiles,
          },
          null,
          2,
        ),
      );
    } else {
      process.stdout.write(detected ? 'true' : 'false');
    }
  } catch (error) {
    if (isJsonMode) {
      process.stdout.write(
        JSON.stringify({
          detected: true,
          reasons: [`Error during detection: ${error.message}`],
          affectedSuites: ['core_steering'],
          rationales: [
            'Error during detection: running all stable evals for safety.',
          ],
        }),
      );
    } else {
      process.stdout.write('true');
    }
    process.stderr.write(String(error) + '\n');
  }
}

main();
