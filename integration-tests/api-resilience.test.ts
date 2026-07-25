/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('API Resilience E2E', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should not crash when receiving metadata-only chunks in a stream', async () => {
    await rig.setup('api-resilience-metadata-only', {
      fakeResponsesPath: join(
        dirname(fileURLToPath(import.meta.url)),
        'api-resilience.responses',
      ),
      settings: {
        planSettings: { modelRouting: false },
      },
    });

    // Run the CLI with a simple prompt.
    // The fake responses will provide a stream with a metadata-only chunk in the middle.
    // We use gemini-3-pro-preview to minimize internal service calls.
    const result = await rig.run({
      args: ['hi', '--model', 'gemini-3-pro-preview'],
    });

    // Verify the output contains text from the normal chunks.
    // If the CLI crashed on the metadata chunk, rig.run would throw.
    expect(result).toContain('Part 1.');
    expect(result).toContain('Part 2.');

    // Verify telemetry event for the prompt was still generated
    const hasUserPromptEvent = await rig.waitForTelemetryEvent('user_prompt');
    expect(hasUserPromptEvent).toBe(true);
  });
});
