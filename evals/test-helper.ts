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
  const fn = async () => {
    const rig = new TestRig();
    const { logDir, sanitizedName } = await prepareLogDir(evalCase.name);
    const activityLogFile = path.join(logDir, `${sanitizedName}.jsonl`);
    const logFile = path.join(logDir, `${sanitizedName}.log`);
    let isSuccess = false;
    try {
      rig.setup(evalCase.name, evalCase.params);

      // Symlink node modules to reduce the amount of time needed to
      // bootstrap test projects.
      const rootNodeModules = path.join(process.cwd(), 'node_modules');
      const testNodeModules = path.join(rig.testDir || '', 'node_modules');
      if (fs.existsSync(rootNodeModules)) {
        fs.symlinkSync(rootNodeModules, testNodeModules, 'dir');
      }

      if (evalCase.files) {
        const acknowledgedAgents: Record<string, Record<string, string>> = {};
        const projectRoot = fs.realpathSync(rig.testDir!);

        for (const [filePath, content] of Object.entries(evalCase.files)) {
          const fullPath = path.join(rig.testDir!, filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content);

          // If it's an agent file, calculate hash for acknowledgement
          if (
            filePath.startsWith('.gemini/agents/') &&
            filePath.endsWith('.md')
          ) {
            const hash = crypto
              .createHash('sha256')
              .update(content)
              .digest('hex');

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

        // Write acknowledged_agents.json to the home directory
        if (Object.keys(acknowledgedAgents).length > 0) {
          const ackPath = path.join(
            rig.homeDir!,
            '.gemini',
            'acknowledgments',
            'agents.json',
          );
          fs.mkdirSync(path.dirname(ackPath), { recursive: true });
          fs.writeFileSync(
            ackPath,
            JSON.stringify(acknowledgedAgents, null, 2),
          );
        }

        const execOptions = { cwd: rig.testDir!, stdio: 'inherit' as const };
        execSync('git init', execOptions);
        execSync('git config user.email "test@example.com"', execOptions);
        execSync('git config user.name "Test User"', execOptions);

        // Temporarily disable the interactive editor and git pager
        // to avoid hanging the tests. It seems the the agent isn't
        // consistently honoring the instructions to avoid interactive
        // commands.
        execSync('git config core.editor "true"', execOptions);
        execSync('git config core.pager "cat"', execOptions);
        execSync('git add .', execOptions);
        execSync('git commit --allow-empty -m "Initial commit"', execOptions);
      }

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
  };

  if (policy === 'USUALLY_PASSES' && !process.env['RUN_EVALS']) {
    it.skip(evalCase.name, fn);
  } else {
    it(evalCase.name, fn);
  }
}

async function prepareLogDir(name: string) {
  const logDir = path.resolve(process.cwd(), 'evals/logs');
  await fs.promises.mkdir(logDir, { recursive: true });
  const sanitizedName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return { logDir, sanitizedName };
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
