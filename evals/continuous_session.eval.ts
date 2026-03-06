/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe('Continuous Session Behavioral Evals', () => {
  appEvalTest('ALWAYS_PASSES', {
    name: 'Continuous Session: Model preserves technical state across manual compression',
    configOverrides: {
      excludeTools: ['run_shell_command', 'write_file'],
      modelSteering: true,
    },
    files: {
      'src/offender.ts': `// Line 1
// Line 2
const x = process.env.SECRET_KEY; // Line 3
// Line 4`,
    },
    prompt:
      'Audit src/ for process.env usage. When you find one, checkpoint your state with the line number and then manually compress the context to clear your history before giving me the final report.',
    setup: async (rig) => {
      // Pause on our new tools to observe the workflow
      rig.setBreakpoint(['checkpoint_state', 'compress']);
    },
    assert: async (rig) => {
      // 1. Wait for Checkpoint
      await rig.waitForPendingConfirmation('checkpoint_state', 45000);
      await rig.resolveAwaitedTool();

      // 2. Wait for Compression
      await rig.waitForPendingConfirmation('compress', 45000);
      await rig.resolveAwaitedTool();

      // 3. Final Verification
      // The model should report the finding even though the initial read_file 
      // is gone from history due to compression.
      await rig.waitForOutput(/process\.env\.SECRET_KEY/i, 60000);
      //await rig.waitForOutput(/Line 3/i, 60000); 
      await rig.waitForIdle(30000);

      const output = rig.getStaticOutput();
      expect(output).toContain('SECRET_KEY');
    },
  });
});
