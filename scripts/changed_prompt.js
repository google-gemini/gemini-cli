/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

/**
 * Matches test sources (`*.test.ts`, `*.test.tsx`, `*.test.js`, ...).
 *
 * Test files cannot change what the model is steered to do, but they routinely
 * contain steering signatures: stand-in MCP tools declared with `inputSchema`,
 * fixture `ToolDefinition`s, and so on. Scanning them produced false positives
 * that ran the required behavioral evals for PRs with no prompt or tool change.
 */
const TEST_FILE_PATTERN = /\.test\.[cm]?[jt]sx?$/;

/**
 * @param {string} file - Repository-relative path.
 * @returns {boolean} Whether `file` is a test source file.
 */
export function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

/**
 * Decides whether a change set can affect model steering (prompts, tool
 * definitions) and therefore whether behavioral evals should run.
 *
 * Detection runs in two stages:
 * 1. Path-based: any change under the core prompt/tool directories, or (unless
 *    `steeringOnly`) under the evals directory. This is deliberately broad and
 *    includes test files, so that a change next to a tool is never missed.
 * 2. Signature-based: steering markers in the diff of other core source files.
 *    Test files are excluded here because they are pure noise for this check.
 *
 * @param {string[]} changedFiles - Files changed relative to the target branch.
 * @param {(files: string[]) => string} getDiff - Returns the unified diff of
 *   the given files relative to the target branch.
 * @param {{ steeringOnly?: boolean, verbose?: boolean }} [options]
 *   `steeringOnly` ignores the evals directory; `verbose` collects every reason
 *   instead of stopping at the first match.
 * @returns {{ detected: boolean, reasons: string[] }}
 */
export function detectSteeringChanges(changedFiles, getDiff, options = {}) {
  const { steeringOnly = false, verbose = false } = options;
  let detected = false;
  const reasons = [];

  // 1. Path-based detection
  for (const file of changedFiles) {
    if (CORE_STEERING_PATHS.some((prefix) => file.startsWith(prefix))) {
      detected = true;
      reasons.push(`Matched core steering path: ${file}`);
      if (!verbose) break;
    }
    if (!steeringOnly && TEST_PATHS.some((prefix) => file.startsWith(prefix))) {
      detected = true;
      reasons.push(`Matched test path: ${file}`);
      if (!verbose) break;
    }
  }

  // 2. Signature-based detection (only in non-test files under
  // packages/core/src/, and only if not already detected or if verbose)
  if (!detected || verbose) {
    const coreChanges = changedFiles.filter(
      (f) => f.startsWith('packages/core/src/') && !isTestFile(f),
    );
    if (coreChanges.length > 0) {
      // Get the actual diff content for core files
      const diff = getDiff(coreChanges);
      for (const sig of STEERING_SIGNATURES) {
        if (diff.includes(sig)) {
          detected = true;
          reasons.push(`Matched steering signature in core: ${sig}`);
          if (!verbose) break;
        }
      }
    }
  }

  return { detected, reasons };
}

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
    const head = process.env.PR_HEAD_SHA || 'HEAD';
    const changedFiles = execSync(`git diff --name-only FETCH_HEAD...${head}`, {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    const getDiff = (files) =>
      execFileSync(
        'git',
        ['diff', '-U0', `FETCH_HEAD...${head}`, '--', ...files],
        {
          encoding: 'utf-8',
        },
      );

    const { detected, reasons } = detectSteeringChanges(changedFiles, getDiff, {
      steeringOnly,
      verbose,
    });

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
