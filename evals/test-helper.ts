/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { TestRig } from '@google/gemini-cli-test-utils';
import {
  createUnauthorizedToolError,
  parseAgentMarkdown,
} from '@google/gemini-cli-core';

export * from '@google/gemini-cli-test-utils';

// Indicates the consistency expectation for this test.
// - ALWAYS_PASSES - Means that the test is expected to pass 100% of the time. These
//   These tests are typically trivial and test basic functionality with unambiguous
//   prompts. For example: "call save_memory to remember foo" should be fairly reliable.
//   These are the first line of defense against regressions in key behaviors and run in
//   every CI. You can run these locally with 'npm run test:always_passing_evals'.
//
// - USUALLY_PASSES - Means that the test is expected to pass most of the time but
//   may have some flakiness as a result of relying on non-deterministic prompted
//   behaviors and/or ambiguous prompts or complex tasks.
//   For example: "Please do build changes until the very end" --> ambiguous whether
//   the agent should add to memory without more explicit system prompt or user
//   instructions. There are many more of these tests and they may pass less consistently.
//   The pass/fail trendline of this set of tests can be used as a general measure
//   of product quality. You can run these locally with 'npm run test:all_evals'.
//   This may take a really long time and is not recommended.
export type EvalPolicy = 'ALWAYS_PASSES' | 'USUALLY_PASSES';

export function evalTest(policy: EvalPolicy, evalCase: EvalCase) {
  runEval(
    policy,
    evalCase.name,
    () => internalEvalTest(evalCase),
    evalCase.timeout,
  );
}

export async function internalEvalTest(evalCase: EvalCase) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const rig = new TestRig();
    const { logDir, sanitizedName } = await prepareLogDir(evalCase.name);
    const activityLogFile = path.join(logDir, `${sanitizedName}.jsonl`);
    const logFile = path.join(logDir, `${sanitizedName}.log`);
    let isSuccess = false;

    try {
      rig.setup(evalCase.name, evalCase.params);

      if (evalCase.files) {
        await setupTestFiles(rig, evalCase.files);
      }

      symlinkNodeModules(rig.testDir || '');

      const result = await rig.run({
        args: evalCase.prompt,
        approvalMode: evalCase.approvalMode ?? 'yolo',
        timeout: evalCase.timeout,
        env: {
          GEMINI_CLI_ACTIVITY_LOG_TARGET: activityLogFile,
        },
      });

      const unauthorizedErrorPrefix =
        createUnauthorizedToolError('').split("'")[0];
      if (result.includes(unauthorizedErrorPrefix)) {
        throw new Error(
          'Test failed due to unauthorized tool call in output: ' + result,
        );
      }

      await evalCase.assert(rig, result);
      isSuccess = true;
      return; // Success! Exit the retry loop.
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = getApiErrorCode(errorMessage);

      if (errorCode) {
        const status = attempt < maxRetries ? 'RETRY' : 'SKIP';
        logReliabilityEvent(
          evalCase.name,
          attempt,
          status,
          errorCode,
          errorMessage,
        );

        if (attempt < maxRetries) {
          attempt++;
          console.warn(
            `[Eval] Attempt ${attempt} failed with ${errorCode} Error. Retrying...`,
          );
          await rig.cleanup();
          continue; // Retry
        }

        console.warn(
          `[Eval] '${evalCase.name}' failed after ${maxRetries} retries due to persistent API errors. Skipping failure to avoid blocking PR.`,
        );
        return; // Gracefully exit without failing the test
      }

      throw error; // Real failure
    } finally {
      if (isSuccess) {
        await fs.promises.unlink(activityLogFile).catch((err) => {
          if (err.code !== 'ENOENT') throw err;
        });
      }

      if (rig._lastRunStderr) {
        const stderrFile = path.join(logDir, `${sanitizedName}.stderr.log`);
        await fs.promises.writeFile(stderrFile, rig._lastRunStderr);
      }

      await fs.promises.writeFile(
        logFile,
        JSON.stringify(rig.readToolLogs(), null, 2),
      );
      await rig.cleanup();
    }
  }
}

function getApiErrorCode(message: string): '500' | '503' | undefined {
  if (
    message.includes('status: UNAVAILABLE') ||
    message.includes('code: 503') ||
    message.includes('Service Unavailable') ||
    message.includes('Simulated 503 error')
  ) {
    return '503';
  }
  if (
    message.includes('status: INTERNAL') ||
    message.includes('code: 500') ||
    message.includes('Internal error encountered')
  ) {
    return '500';
  }
  return undefined;
}

/**
 * Log reliability event for later harvesting.
 *
 * Note: Uses synchronous file I/O to ensure the log is persisted even if the
 * test process is abruptly terminated by a timeout or CI crash. Performance
 * impact is negligible compared to long-running evaluation tests.
 */
function logReliabilityEvent(
  testName: string,
  attempt: number,
  status: 'RETRY' | 'SKIP',
  errorCode: '500' | '503',
  errorMessage: string,
) {
  const reliabilityLog = {
    timestamp: new Date().toISOString(),
    testName,
    model: process.env.GEMINI_MODEL || 'unknown',
    attempt,
    status,
    errorCode,
    error: errorMessage,
  };

  try {
    const relDir = path.resolve(process.cwd(), 'evals/logs');
    fs.mkdirSync(relDir, { recursive: true });
    fs.appendFileSync(
      path.join(relDir, 'api-reliability.jsonl'),
      JSON.stringify(reliabilityLog) + '\n',
    );
  } catch (logError) {
    console.error('Failed to write reliability log:', logError);
  }
}

/**
 * Helper to setup test files and git repository.
 *
 * Note: While this is an async function (due to parseAgentMarkdown), it
 * intentionally uses synchronous filesystem and child_process operations
 * for simplicity and to ensure sequential environment preparation.
 */
async function setupTestFiles(rig: TestRig, files: Record<string, string>) {
  const acknowledgedAgents: Record<string, Record<string, string>> = {};
  const projectRoot = fs.realpathSync(rig.testDir!);

  for (const [filePath, content] of Object.entries(files)) {
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      throw new Error(`Invalid file path in test case: ${filePath}`);
    }
    const fullPath = path.join(projectRoot, filePath);
    if (!fullPath.startsWith(projectRoot)) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);

    if (filePath.startsWith('.gemini/agents/') && filePath.endsWith('.md')) {
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      try {
        const agentDefs = await parseAgentMarkdown(fullPath, content);
        if (agentDefs.length > 0) {
          const agentName = agentDefs[0].name;
          if (!acknowledgedAgents[projectRoot]) {
            acknowledgedAgents[projectRoot] = {};
          }
          acknowledgedAgents[projectRoot][agentName] = hash;
        }
      } catch (error) {
        console.warn(
          `Failed to parse agent for test acknowledgement: ${filePath}`,
          error,
        );
      }
    }
  }

  if (Object.keys(acknowledgedAgents).length > 0) {
    const ackPath = path.join(
      rig.homeDir!,
      '.gemini',
      'acknowledgments',
      'agents.json',
    );
    fs.mkdirSync(path.dirname(ackPath), { recursive: true });
    fs.writeFileSync(ackPath, JSON.stringify(acknowledgedAgents, null, 2));
  }

  const execOptions = { cwd: rig.testDir!, stdio: 'inherit' as const };
  execSync('git init --initial-branch=main', execOptions);
  execSync('git config user.email "test@example.com"', execOptions);
  execSync('git config user.name "Test User"', execOptions);

  // Temporarily disable the interactive editor and git pager
  // to avoid hanging the tests. It seems the the agent isn't
  // consistently honoring the instructions to avoid interactive
  // commands.
  execSync('git config core.editor "true"', execOptions);
  execSync('git config core.pager "cat"', execOptions);
  execSync('git config commit.gpgsign false', execOptions);
  execSync('git add .', execOptions);
  execSync('git commit --allow-empty -m "Initial commit"', execOptions);
}

/**
 * Wraps a test function with the appropriate Vitest 'it' or 'it.skip' based on policy.
 */
export function runEval(
  policy: EvalPolicy,
  name: string,
  fn: () => Promise<void>,
  timeout?: number,
) {
  if (policy === 'USUALLY_PASSES' && !process.env['RUN_EVALS']) {
    it.skip(name, fn);
  } else {
    it(name, fn, timeout);
  }
}

export async function prepareLogDir(name: string) {
  const logDir = path.resolve(process.cwd(), 'evals/logs');
  await fs.promises.mkdir(logDir, { recursive: true });
  const sanitizedName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return { logDir, sanitizedName };
}

/**
 * Symlinks node_modules to the test directory to speed up tests that need to run tools.
 */
export function symlinkNodeModules(testDir: string) {
  const rootNodeModules = path.join(process.cwd(), 'node_modules');
  const testNodeModules = path.join(testDir, 'node_modules');
  if (
    testDir &&
    fs.existsSync(rootNodeModules) &&
    !fs.existsSync(testNodeModules)
  ) {
    fs.symlinkSync(rootNodeModules, testNodeModules, 'dir');
  }
}

export interface EvalCase {
  name: string;
  params?: Record<string, any>;
  prompt: string;
  timeout?: number;
  files?: Record<string, string>;
  approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  assert: (rig: TestRig, result: string) => Promise<void>;
}
