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
} from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_GEMINI_MODEL,
  type ScriptItem,
  extractFakeResponses,
  extractUserPrompts,
} from '@google/gemini-cli-core';

export interface AppEvalCase {
  name: string;
  configOverrides?: any;
  prompt: string;
  timeout?: number;
  files?: Record<string, string>;
  setup?: (rig: AppRig) => Promise<void>;
  assert: (rig: AppRig, output: string) => Promise<void>;
  /**
   * Optional script to "prime the pump" before the main prompt.
   * A sequential array interleaving MockUserTurn (e.g., userText('hello'))
   * and FakeResponse (e.g., mockGenerateContentStreamText('hi')).
   */
  script?: ScriptItem[];
}

/**
 * A helper for running behavioral evaluations using the in-process AppRig.
 * This matches the API of evalTest in test-helper.ts as closely as possible.
 */
export function appEvalTest(policy: EvalPolicy, evalCase: AppEvalCase) {
  const fn = async () => {
    const configOverrides = {
      model: DEFAULT_GEMINI_MODEL,
      ...evalCase.configOverrides,
    };

    let userPrompts: string[] = [];

    if (evalCase.script) {
      // Extract fake model responses to inject into the ContentGenerator
      configOverrides.fakeResponses = extractFakeResponses(evalCase.script);

      // Extract the sequence of user prompts for the Mock User driver
      userPrompts = extractUserPrompts(evalCase.script);
    }

    const rig = new AppRig({
      configOverrides,
    });

    const { logDir, sanitizedName } = await prepareLogDir(evalCase.name);
    const logFile = path.join(logDir, `${sanitizedName}.log`);

    try {
      await rig.initialize();

      const testDir = rig.getTestDir();
      symlinkNodeModules(testDir);

      // Setup initial files
      if (evalCase.files) {
        for (const [filePath, content] of Object.entries(evalCase.files)) {
          const fullPath = path.join(testDir, filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content);
        }
      }

      // Run custom setup if provided (e.g. for breakpoints)
      if (evalCase.setup) {
        await evalCase.setup(rig);
      }

      // Render the app!
      rig.render();

      // Wait for initial ready state
      await rig.waitForIdle();

      // Execute priming script if requested
      if (userPrompts.length > 0) {
        await rig.driveMockUser(userPrompts, evalCase.timeout);
      }

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
  };

  runEval(policy, evalCase.name, fn, (evalCase.timeout ?? 60000) + 10000);
}
