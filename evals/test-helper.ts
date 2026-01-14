/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { it } from 'vitest';
import fs from 'node:fs';
import { TestRig } from '@google/gemini-cli-test-utils';

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
      await rig.setup(evalCase.name, evalCase.params);
      const result = await rig.run({ args: evalCase.prompt });
      await evalCase.assert(rig, result);
    } finally {
      await logToFile(
        evalCase.name,
        JSON.stringify(rig.readToolLogs(), null, 2),
      );
      await rig.cleanup();
    }
  };

  if (policy === 'USUALLY_PASSES' && !process.env.RUN_EVALS) {
    it.skip(evalCase.name, fn);
  } else {
    it(evalCase.name, fn);
  }
}

export interface EvalCase {
  name: string;
  params?: Record<string, any>;
  prompt: string;
  assert: (rig: TestRig, result: string) => Promise<void>;
}

async function logToFile(name: string, content: string) {
  const logDir = 'evals/logs';
  await fs.promises.mkdir(logDir, { recursive: true });
  const sanitizedName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const logFile = `${logDir}/${sanitizedName}.log`;
  await fs.promises.writeFile(logFile, content);
}
