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
  Storage,
  getProjectHash,
  SESSION_FILE_PREFIX,
  PREVIEW_GEMINI_FLASH_MODEL,
  getErrorMessage,
} from '@google/gemini-cli-core';

export * from '@google/gemini-cli-test-utils';

/**
 * The default model used for all evaluations.
 * Can be overridden by setting the GEMINI_MODEL environment variable.
 */
export const EVAL_MODEL =
  process.env['GEMINI_MODEL'] || PREVIEW_GEMINI_FLASH_MODEL;

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
  runEval(policy, evalCase, () => internalEvalTest(evalCase));
}

export async function withEvalRetries(
  name: string,
  attemptFn: (attempt: number) => Promise<void>,
) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      await attemptFn(attempt);
      return; // Success! Exit the retry loop.
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorCode = getApiErrorCode(errorMessage);

      if (errorCode) {
        const status = attempt < maxRetries ? 'RETRY' : 'SKIP';
        logReliabilityEvent(name, attempt, status, errorCode, errorMessage);

        if (attempt < maxRetries) {
          attempt++;
          console.warn(
            `[Eval] Attempt ${attempt} failed with ${errorCode} Error. Retrying...`,
          );
          continue; // Retry
        }

        console.warn(
          `[Eval] '${name}' failed after ${maxRetries} retries due to persistent API errors. Skipping failure to avoid blocking PR.`,
        );
        return; // Gracefully exit without failing the test
      }

      throw error; // Real failure
    }
  }
}

export async function internalEvalTest(evalCase: EvalCase) {
  await withEvalRetries(evalCase.name, async () => {
    const rig = new TestRig();
    const { logDir, sanitizedName } = await prepareLogDir(evalCase.name);
    const activityLogFile = path.join(logDir, `${sanitizedName}.jsonl`);
    const logFile = path.join(logDir, `${sanitizedName}.log`);
    let isSuccess = false;

    try {
      const setupOptions = {
        ...evalCase.params,
        settings: {
          model: { name: EVAL_MODEL },
          ...evalCase.params?.settings,
        },
      };
      rig.setup(evalCase.name, setupOptions);

      if (evalCase.setup) {
        await evalCase.setup(rig);
      }

      if (evalCase.files) {
        await prepareWorkspace(rig.testDir!, rig.homeDir!, evalCase.files);
      }

      symlinkNodeModules(rig.testDir || '');

      // If messages are provided, write a session file so --resume can load it.
      let sessionId: string | undefined;
      if (evalCase.messages) {
        sessionId =
          evalCase.sessionId ||
          `test-session-${crypto.randomUUID().slice(0, 8)}`;

        // Temporarily set GEMINI_CLI_HOME so Storage writes to the same
        // directory the CLI subprocess will use (rig.homeDir).
        const originalGeminiHome = process.env['GEMINI_CLI_HOME'];
        process.env['GEMINI_CLI_HOME'] = rig.homeDir!;
        try {
          const storage = new Storage(fs.realpathSync(rig.testDir!));
          await storage.initialize();
          const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
          fs.mkdirSync(chatsDir, { recursive: true });

          const conversation = {
            sessionId,
            projectHash: getProjectHash(fs.realpathSync(rig.testDir!)),
            startTime: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            messages: evalCase.messages,
          };

          const timestamp = new Date()
            .toISOString()
            .slice(0, 16)
            .replace(/:/g, '-');
          const filename = `${SESSION_FILE_PREFIX}${timestamp}-${sessionId.slice(0, 8)}.json`;
          fs.writeFileSync(
            path.join(chatsDir, filename),
            JSON.stringify(conversation, null, 2),
          );
        } catch (e) {
          // Storage initialization may fail in some environments; log and continue.
          console.warn('Failed to write session history:', e);
        } finally {
          // Restore original GEMINI_CLI_HOME.
          if (originalGeminiHome === undefined) {
            delete process.env['GEMINI_CLI_HOME'];
          } else {
            process.env['GEMINI_CLI_HOME'] = originalGeminiHome;
          }
        }
      }

      const result = await rig.run({
        args: sessionId
          ? ['--resume', sessionId, evalCase.prompt]
          : evalCase.prompt,
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
  });
}

function getApiErrorCode(message: string): '500' | '503' | undefined {
  if (
    message.includes('status: UNAVAILABLE') ||
    message.includes('code: 503') ||
    message.includes('Service Unavailable')
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
    model: process.env['GEMINI_MODEL'] || 'unknown',
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
export async function prepareWorkspace(
  testDir: string,
  homeDir: string,
  files: Record<string, string>,
) {
  const acknowledgedAgents: Record<string, Record<string, string>> = {};
  const projectRoot = fs.realpathSync(testDir);

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
      homeDir,
      '.gemini',
      'acknowledgments',
      'agents.json',
    );
    fs.mkdirSync(path.dirname(ackPath), { recursive: true });
    fs.writeFileSync(ackPath, JSON.stringify(acknowledgedAgents, null, 2));
  }

  const execOptions = { cwd: testDir, stdio: 'ignore' as const };
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
  evalCase: BaseEvalCase,
  fn: () => Promise<void>,
  timeoutOverride?: number,
) {
  const { name, timeout, suiteName, suiteType } = evalCase;
  const targetSuiteType = process.env['EVAL_SUITE_TYPE'];
  const targetSuiteName = process.env['EVAL_SUITE_NAME'];

  const meta = { suiteType, suiteName };

  const skipBySuiteType =
    targetSuiteType && suiteType && suiteType !== targetSuiteType;
  const skipBySuiteName =
    targetSuiteName && suiteName && suiteName !== targetSuiteName;

  const options = { timeout: timeoutOverride ?? timeout, meta };
  if (
    (policy === 'USUALLY_PASSES' && !process.env['RUN_EVALS']) ||
    skipBySuiteType ||
    skipBySuiteName
  ) {
    it.skip(name, options, fn);
  } else {
    it(name, options, fn);
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

/**
 * Settings that are forbidden in evals. Evals should never restrict which
 * tools are available — they must test against the full, default tool set
 * to ensure realistic behavior.
 */
interface ForbiddenToolSettings {
  tools?: {
    /** Restricting core tools in evals is forbidden. */
    core?: never;
    [key: string]: unknown;
  };
}

export interface BaseEvalCase {
  suiteName: string;
  suiteType: 'behavioral' | 'component-level' | 'hero-scenario';
  name: string;
  timeout?: number;
  files?: Record<string, string>;
}

export interface EvalCase extends BaseEvalCase {
  params?: {
    settings?: ForbiddenToolSettings & Record<string, unknown>;
    [key: string]: unknown;
  };
  prompt: string;
  setup?: (rig: TestRig) => Promise<void> | void;
  /** Conversation history to pre-load via --resume. Each entry is a message object with type, content, etc. */
  messages?: Record<string, unknown>[];
  /** Session ID for the resumed session. Auto-generated if not provided. */
  sessionId?: string;
  approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  assert: (rig: TestRig, result: string) => Promise<void>;
}
