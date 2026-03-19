/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';
import {
  userText,
  mockGenerateContentStreamText,
} from '@google/gemini-cli-core';

describe('Hybrid Handoff (Mock User to Live Model)', () => {
  appEvalTest('ALWAYS_PASSES', {
    name: 'Mock User successfully primes AppRig using a scripted history and hands off to live model',
    timeout: 120000,
    script: [
      userText('Start priming'),
      mockGenerateContentStreamText(
        "Hello! I am a fake response. Let's prime the pump.",
      ),
      userText('Continue priming'),
      mockGenerateContentStreamText(
        'Pump primed successfully. Ready for handoff.',
      ),
    ],
    prompt: 'What is 5 * 5? Please answer with just the final number.',
    assert: async (rig) => {
      await rig.drainBreakpointsUntilIdle(undefined, 30000);

      const liveOutput = rig.getStaticOutput();

      // Ensure the handoff was successful
      expect(liveOutput).toContain('25');
    },
  });
});
