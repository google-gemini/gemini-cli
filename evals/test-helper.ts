/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { TestRig } from '@google/gemini-cli-test-utils';
import { createUnauthorizedToolError } from '@google/gemini-cli-core';

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
    try {
      rig.setup(evalCase.name, evalCase.params);

      const interactiveGitMarker = path.join(
        rig.testDir || '',
        'interactive_git_triggered',
      );

      const gitEditorCmd = evalCase.failOnInteractiveGit
        ? `sh -c 'echo "Auto-commit" > "$0" && touch "${interactiveGitMarker}"'`
        : `sh -c 'echo "Auto-commit" > "$0"'`;

      if (evalCase.files) {
        for (const [filePath, content] of Object.entries(evalCase.files)) {
          const fullPath = path.join(rig.testDir!, filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content);
        }

        const execOptions = { cwd: rig.testDir!, stdio: 'inherit' as const };
        execSync('git init', execOptions);
        execSync('git config user.email "test@example.com"', execOptions);
        execSync('git config user.name "Test User"', execOptions);

        // Temporarily disable the interactive editor and git pager
        // to avoid hanging the tests. It seems the the agent isn't
        // consistently honoring the instructions to avoid interactive
        // commands.
        // We use a shell command that writes to the file argument to ensure
        // git commits succeed without user interaction.
        const escapedGitEditor = gitEditorCmd.replace(/"/g, '\\"');
        execSync(`git config core.editor "${escapedGitEditor}"`, execOptions);
        execSync('git config core.pager cat', execOptions);
        execSync('git config commit.gpgsign false', execOptions);
        execSync('git config tag.gpgsign false', execOptions);
        execSync('git config core.hooksPath /dev/null', execOptions);
        execSync('git add .', execOptions);
        execSync('git commit --allow-empty -m "Initial commit"', execOptions);
      }

      const result = await rig.run({
        args: evalCase.prompt,
        env: {
          // Force non-interactive git behavior
          GIT_EDITOR: gitEditorCmd,
          GIT_PAGER: 'cat',
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      if (
        evalCase.failOnInteractiveGit &&
        fs.existsSync(interactiveGitMarker)
      ) {
        throw new Error(
          'Test failed: Interactive git editor was triggered. The agent should use "git commit -m" or similar to avoid opening an editor.',
        );
      }

      const unauthorizedErrorPrefix =
        createUnauthorizedToolError('').split("'")[0];
      if (result.includes(unauthorizedErrorPrefix)) {
        throw new Error(
          'Test failed due to unauthorized tool call in output: ' + result,
        );
      }

      await evalCase.assert(rig, result);
    } finally {
      await logToFile(
        evalCase.name,
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

export interface EvalCase {
  name: string;
  params?: Record<string, any>;
  prompt: string;
  failOnInteractiveGit?: boolean;
  files?: Record<string, string>;
  assert: (rig: TestRig, result: string) => Promise<void>;
}

async function logToFile(name: string, content: string) {
  const logDir = 'evals/logs';
  await fs.promises.mkdir(logDir, { recursive: true });
  const sanitizedName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const logFile = `${logDir}/${sanitizedName}.log`;
  await fs.promises.writeFile(logFile, content);
}
