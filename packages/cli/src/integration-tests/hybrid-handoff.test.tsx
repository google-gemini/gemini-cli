/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AppRig } from '../test-utils/AppRig.js';
import {
  FakeContentGenerator,
  FallbackContentGenerator,
  userText,
  mockGenerateContentStreamText,
  extractUserPrompts,
  extractFakeResponses,
  type ScriptItem,
} from '@google/gemini-cli-core';

describe('Hybrid Handoff (Mock User to Synthetic Live Model)', () => {
  it('successfully transitions from mock responses to live responses', async () => {
    // 1. Define the conversational script for the priming phase
    const primingScript: ScriptItem[] = [
      userText('Start priming'),
      mockGenerateContentStreamText('Hello! I am a fake response.'),
      userText('Continue priming'),
      mockGenerateContentStreamText(
        'Pump primed successfully. Ready for handoff.',
      ),
    ];

    // 2. Setup the primary fake generator that runs through the priming script
    const fakeGenerator = new FakeContentGenerator(
      extractFakeResponses(primingScript),
    );

    // 3. Setup a "live" fallback generator (it's synthetic so we don't need API keys)
    const mockLiveFallback = new FakeContentGenerator([
      mockGenerateContentStreamText('The answer is 4.'),
    ]);

    // We need countTokens so AppRig doesn't hang checking size during truncation
    mockLiveFallback.countTokens = async () => ({ totalTokens: 10 });

    // 4. Compose them using FallbackContentGenerator
    const composedGenerator = new FallbackContentGenerator(
      fakeGenerator,
      mockLiveFallback,
    );

    // 5. Mount the AppRig natively supporting custom content generators
    const rig = new AppRig({
      contentGenerator: composedGenerator,
      configOverrides: {
        fakeResponses: [], // ensure it avoids disk IO attempts internally
      },
    });
    await rig.initialize();

    await rig.render();
    await rig.waitForIdle();

    // 6. Drive the Mock User sequence using the extracted prompts from the script
    await rig.driveMockUser(extractUserPrompts(primingScript), 10000);

    // 7. Send the final prompt that should exhaust the primary generator and trigger the fallback
    await rig.sendMessage('What is 2 + 2?');

    // 8. Wait for the fallback response to render
    await rig.waitForOutput('The answer is 4.', 10000);

    const output = rig.getStaticOutput();
    expect(output).toContain('The answer is 4.');

    // Wait for everything to settle so React act() warnings don't fire during unmount
    await rig.drainBreakpointsUntilIdle(undefined, 10000);
    await rig.unmount();
  });
});
