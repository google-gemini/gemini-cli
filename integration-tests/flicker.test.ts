/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig } from './test-helper.js';

describe('Flicker Detector', () => {
  it('should not detect a flicker under the max height budget', async () => {
    const rig = new TestRig();
    await rig.setup('flicker-detector-test');

    const run = await rig.runInteractive();
    const prompt = 'Tell me a fun fact.';
    await run.type(prompt);
    await run.type('\r');

    const hasUserPromptEvent = await rig.waitForTelemetryEvent('user_prompt');
    expect(hasUserPromptEvent).toBe(true);

    const sessionCountMetric = rig.readMetric('session.count');
    expect(sessionCountMetric).not.toBeNull();

    // We expect NO flicker event to be found.
    const flickerMetric = rig.readMetric('ui.flicker.count');
    expect(flickerMetric).toBeNull();
  });
});
