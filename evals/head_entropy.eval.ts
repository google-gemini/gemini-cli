/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe('Head Entropy Behavioral Evals', () => {
  appEvalTest('ALWAYS_PASSES', {
    name: 'Head Entropy: Model distills a high-noise tool output',
    configOverrides: {
      modelSteering: true,
      continuousSession: true,
    },
    files: {
      'src/big-file.ts': '// NOISE\n'.repeat(100) + 'const SECRET = "SIGNAL";\n' + '// NOISE\n'.repeat(100),
    },
    prompt:
      'Grep for SECRET in src/. If the result is very noisy, use distill_result to replace it with just the signal you found before continuing.',
    setup: async (rig) => {
      // Pause on our new tools to observe the workflow
      rig.setBreakpoint(['grep_search', 'distill_result']);
    },
    assert: async (rig) => {
      // 1. Wait for Grep
      await rig.waitForPendingConfirmation('grep_search', 45000);
      await rig.resolveAwaitedTool();

      // 2. Wait for Distillation
      await rig.waitForPendingConfirmation('distill_result', 45000);
      await rig.resolveAwaitedTool();

      // 3. Final Verification
      await rig.waitForOutput(/SIGNAL/i, 60000);
      await rig.waitForIdle(30000);

      const output = rig.getStaticOutput();
      expect(output).toContain('SIGNAL');
      expect(output).not.toContain('NOISE'); // Should be elided/replaced
    },
  });
});
