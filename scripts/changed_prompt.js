/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { execSync } from 'node:child_process';

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

  try {
    const remoteUrl = process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}.git`
      : 'origin';

    // Fetch target branch from the remote.
    execSync(`git fetch ${remoteUrl} ${targetBranch}`, {
      stdio: 'ignore',
    });

    // Get changed files using the triple-dot syntax which correctly handles merge commits
    const changedFiles = execSync(`git diff --name-only FETCH_HEAD...HEAD`, {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    let detected = false;
    const reasons = [];

    // 1. Path-based detection
    for (const file of changedFiles) {
      if (CORE_STEERING_PATHS.some((prefix) => file.startsWith(prefix))) {
        detected = true;
        reasons.push(`Matched core steering path: ${file}`);
        if (!verbose) break;
      }
      if (
        !steeringOnly &&
        TEST_PATHS.some((prefix) => file.startsWith(prefix))
      ) {
        detected = true;
        reasons.push(`Matched test path: ${file}`);
        if (!verbose) break;
      }
    }

    // 2. Signature-based detection (only in packages/core/src/ and only if not already detected or if verbose)
    if (!detected || verbose) {
      const coreChanges = changedFiles.filter((f) =>
        f.startsWith('packages/core/src/'),
      );
      if (coreChanges.length > 0) {
        // Get the actual diff content for core files
        const diff = execSync(
          `git diff -U0 FETCH_HEAD...HEAD -- packages/core/src/`,
          { encoding: 'utf-8' },
        );
        for (const sig of STEERING_SIGNATURES) {
          if (diff.includes(sig)) {
            detected = true;
            reasons.push(`Matched steering signature in core: ${sig}`);
            if (!verbose) break;
          }
        }
      }
    }

    if (verbose && reasons.length > 0) {
      process.stderr.write('Detection reasons:\n');
      reasons.forEach((r) => process.stderr.write(` - ${r}\n`));
    }

    process.stdout.write(detected ? 'true' : 'false');
  } catch (error) {
    // If anything fails (e.g., no git history), run evals/guidance to be safe
    process.stderr.write(
      'Warning: Failed to determine if changes occurred. Defaulting to true.\n',
    );
    process.stderr.write(String(error) + '\n');
    process.stdout.write('true');
  }
}

main();
