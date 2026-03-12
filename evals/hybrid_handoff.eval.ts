import { describe, expect } from 'vitest';
import {
  appEvalTest,
} from './app-test-helper.js';
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
    prompt: 'What is 2 + 2? Please answer with exactly the number "4".',
    assert: async (rig) => {
      // The Mock User has automatically driven the script before sending the final prompt.
      // So the history now has the 2 fake turns in it, and the final prompt was just sent to the LIVE model.

      await rig.waitForIdle(60000);

      const liveOutput = rig.getStaticOutput();

      // Ensure the handoff was successful
      expect(liveOutput).toContain('4');

      await rig.drainBreakpointsUntilIdle(undefined, 10000);
    },
  });
});