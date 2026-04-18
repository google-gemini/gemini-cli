/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { appEvalTest } from './app-test-helper.js';

describe('Model Steering Behavioral Evals', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Corrective Hint: Model switches task based on hint during tool turn',
    configOverrides: {
      modelSteering: true,
    },
    files: {
      'README.md':
        '# Gemini CLI\nThis is a tool for developers.\nLicense: Apache-2.0\nLine 4\nLine 5\nLine 6',
    },
    prompt: 'Find the first 5 lines of README.md',
    setup: async (rig) => {
      // Pause on any relevant tool to inject a corrective hint
      rig.setBreakpoint(['read_file', 'list_directory', 'glob']);
    },
    assert: async (rig) => {
      // Wait for the model to pause on any tool call
      await rig.waitForPendingConfirmation(
        /read_file|list_directory|glob/i,
        30000,
      );

      // Interrupt with a corrective hint
      await rig.addUserHint(
        'Actually, stop what you are doing. Just tell me a short knock-knock joke about a robot instead.',
      );

      // Resolve the tool to let the turn finish and the model see the hint
      await rig.resolveAwaitedTool();

      // Verify the model pivots to the new task
      await rig.waitForOutput(/Knock,? knock/i, 40000);
      await rig.waitForIdle(30000);

      const output = rig.getStaticOutput();
      expect(output).toMatch(/Knock,? knock/i);
      expect(output).not.toContain('Line 6');
    },
  });

  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Suggestive Hint: Model incorporates user guidance mid-stream',
    configOverrides: {
      modelSteering: true,
    },
    files: {},
    prompt: 'Create a file called "hw.js" with a JS hello world.',
    setup: async (rig) => {
      // Pause on write_file to inject a suggestive hint
      rig.setBreakpoint(['write_file']);
    },
    assert: async (rig) => {
      // Wait for the model to start creating the first file
      await rig.waitForPendingConfirmation('write_file', 30000);

      await rig.addUserHint(
        'Next, create a file called "hw.py" with a python hello world.',
      );

      // Resolve and wait for the model to complete both tasks
      await rig.resolveAwaitedTool();
      await rig.waitForPendingConfirmation('write_file', 30000);
      await rig.resolveAwaitedTool();
      await rig.waitForIdle(60000);

      const testDir = rig.getTestDir();
      const hwJs = path.join(testDir, 'hw.js');
      const hwPy = path.join(testDir, 'hw.py');

      expect(fs.existsSync(hwJs), 'hw.js should exist').toBe(true);
      expect(fs.existsSync(hwPy), 'hw.py should exist').toBe(true);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    name: 'Skip Step: Model omits a planned step when instructed via hint',
    configOverrides: {
      modelSteering: true,
    },
    files: {
      'src/math.ts':
        'export function multiply(a: number, b: number): number {\n  return a * b;\n}\n',
    },
    prompt:
      'Refactor the multiply function in src/math.ts to use arrow function syntax, then create a file called done.txt to confirm completion.',
    setup: async (rig) => {
      // Pause on the first write_file so we can inject a hint before done.txt is created
      rig.setBreakpoint(['write_file']);
    },
    assert: async (rig) => {
      // Wait for the model to write the refactored src/math.ts
      await rig.waitForPendingConfirmation('write_file', 30000);

      // Instruct the model to skip the done.txt step
      await rig.addUserHint(
        'Skip creating done.txt — the refactor is all I need.',
      );

      await rig.resolveAwaitedTool();
      await rig.waitForIdle(60000);

      const testDir = rig.getTestDir();
      const mathTs = path.join(testDir, 'src/math.ts');
      const doneTxt = path.join(testDir, 'done.txt');

      // The refactor should have happened
      expect(fs.existsSync(mathTs), 'src/math.ts should exist').toBe(true);
      expect(fs.readFileSync(mathTs, 'utf8')).toMatch(/=>/);

      // The skipped step should not have happened
      expect(fs.existsSync(doneTxt), 'done.txt should not exist').toBe(false);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    name: 'Path Correction: Model searches correct directory after hint',
    configOverrides: {
      modelSteering: true,
    },
    files: {
      'src/common/utils/helpers.ts':
        'export const DATABASE_URL = "postgres://localhost:5432/mydb";\n',
      'src/index.ts': '// Entry point — no constants here\n',
    },
    prompt: 'Find the DATABASE_URL constant and tell me its value.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_file', 'glob', 'grep', 'list_directory']);
    },
    assert: async (rig) => {
      // Wait for the model to start searching
      await rig.waitForPendingConfirmation(
        /read_file|glob|grep|list_directory/i,
        30000,
      );

      // Correct the search path
      await rig.addUserHint(
        'The constants are in src/common/utils/, not the root src/ directory.',
      );

      await rig.resolveAwaitedTool();
      await rig.waitForIdle(60000);

      // The model should have found and reported the value
      const output = rig.getStaticOutput();
      expect(output).toMatch(/postgres/i);
    },
  });
});
