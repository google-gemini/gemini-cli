/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('stdin context', () => {
  it('should be able to use stdin as context for a prompt', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to use stdin as context for a prompt');

    const randomString = Math.random().toString(36).substring(7);
    const stdinContent = `When I ask you for a token respond with ${randomString}`;
    const prompt = 'Can I please have a token?';

    const result = await rig.run({ prompt, stdin: stdinContent });

    await rig.waitForTelemetryEvent('api_request');
    const lastRequest = rig.readLastApiRequest();
    expect(lastRequest).not.toBeNull();

    const historyString = lastRequest.attributes.request_text;

    // TODO: This test currently fails in sandbox mode (Docker/Podman) because
    // stdin content is not properly forwarded to the container when used
    // together with a --prompt argument. The test passes in non-sandbox mode.

    expect(historyString).toContain(randomString);
    expect(historyString).toContain(prompt);

    // Check that stdin content appears before the prompt in the conversation history
    const stdinIndex = historyString.indexOf(randomString);
    const promptIndex = historyString.indexOf(prompt);

    expect(
      stdinIndex,
      `Expected stdin content to be present in conversation history`,
    ).toBeGreaterThan(-1);

    expect(
      promptIndex,
      `Expected prompt to be present in conversation history`,
    ).toBeGreaterThan(-1);

    expect(
      stdinIndex < promptIndex,
      `Expected stdin content (index ${stdinIndex}) to appear before prompt (index ${promptIndex}) in conversation history`,
    ).toBeTruthy();

    // Add debugging information
    if (!result.toLowerCase().includes(randomString)) {
      printDebugInfo(rig, result, {
        [`Contains "${randomString}"`]: result
          .toLowerCase()
          .includes(randomString),
      });
    }

    // Validate model output
    validateModelOutput(result, randomString, 'STDIN context test');

    expect(
      result.toLowerCase().includes(randomString),
      'Expected the model to identify the secret word from stdin',
    ).toBeTruthy();
  });
});
