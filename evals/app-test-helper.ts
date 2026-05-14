/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRig } from '../packages/cli/src/test-utils/AppRig.js';
import {
  type EvalPolicy,
  runEval,
  prepareLogDir,
  symlinkNodeModules,
  withEvalRetries,
  prepareWorkspace,
  type BaseEvalCase,
  EVAL_MODEL,
} from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Config overrides for evals, with tool-restriction fields explicitly
 * forbidden. Evals must test against the full, default tool set to ensure
 * realistic behavior.
 */
interface EvalConfigOverrides {
  /** Restricting tools via excludeTools in evals is forbidden. */
  excludeTools?: never;
  /** Restricting tools via coreTools in evals is forbidden. */
  coreTools?: never;
  /** Restricting tools via allowedTools in evals is forbidden. */
  allowedTools?: never;
  /** Restricting tools via mainAgentTools in evals is forbidden. */
  mainAgentTools?: never;

  [key: string]: unknown;
}

export interface AppEvalCase extends BaseEvalCase {
  configOverrides?: EvalConfigOverrides;
  prompt: string;
  setup?: (rig: AppRig) => Promise<void>;
  assert: (rig: AppRig, output: string) => Promise<void>;
}

/**
 * A helper for running behavioral evaluations using the in-process AppRig.
 * This matches the API of evalTest in test-helper.ts as closely as possible.
 */
export function appEvalTest(policy: EvalPolicy, evalCase: AppEvalCase) {
  const fn = async () => {
    await withEvalRetries(evalCase.name, async () => {
      const rig = new AppRig({
        configOverrides: {
          model: EVAL_MODEL,
          ...evalCase.configOverrides,
        },
      });

      const { logDir, sanitizedName } = await prepareLogDir(evalCase.name);
      const logFile = path.join(logDir, `${sanitizedName}.log`);

      try {
        await rig.initialize();

        const testDir = rig.getTestDir();
        symlinkNodeModules(testDir);

        // Setup initial files
        if (evalCase.files) {
          // Note: AppRig does not use a separate homeDir, so we use testDir twice
          await prepareWorkspace(testDir, testDir, evalCase.files);
        }

        // Run custom setup if provided (e.g. for breakpoints)
        if (evalCase.setup) {
          await evalCase.setup(rig);
        }

        // Render the app!
        await rig.render();

        // Wait for initial ready state
        await rig.waitForIdle();

        // Send the initial prompt
        await rig.sendMessage(evalCase.prompt);

        // Run assertion. Interaction-heavy tests can do their own waiting/steering here.
        const output = rig.getStaticOutput();
        await evalCase.assert(rig, output);
      } finally {
        const output = rig.getStaticOutput();
        if (output) {
          await fs.promises.writeFile(logFile, output);
        }
        await rig.unmount();
      }
    });
  };

  runEval(policy, evalCase, fn, (evalCase.timeout ?? 60000) + 10000);
}
