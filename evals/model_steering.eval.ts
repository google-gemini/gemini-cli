/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { act } from 'react';
import path from 'node:path';
import fs from 'node:fs';
import { appEvalTest } from './app-test-helper.js';
import { PolicyDecision } from '@google/gemini-cli-core';

describe('Model Steering Behavioral Evals', () => {
  appEvalTest('ALWAYS_PASSES', {
    name: 'Corrective Hint: Model switches task based on hint during tool turn',
    configOverrides: {
      excludeTools: ['run_shell_command', 'ls', 'google_web_search'],
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

  appEvalTest('ALWAYS_PASSES', {
    name: 'Suggestive Hint: Model incorporates user guidance mid-stream',
    configOverrides: {
      excludeTools: ['run_shell_command', 'ls', 'google_web_search'],
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
});
