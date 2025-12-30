/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupTestRig,
  cleanupTestRig,
  type LocalTestContext,
} from './test-helper.js';
import { join } from 'node:path';

describe.concurrent('Flicker Detector', () => {
  beforeEach<LocalTestContext>(setupTestRig);
  afterEach<LocalTestContext>(cleanupTestRig);

  it<LocalTestContext>('should not detect a flicker under the max height budget', async ({
    rig,
  }) => {
    rig.setup('flicker-detector-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'flicker-detector.max-height.responses',
      ),
    });
    const run = await rig.runInteractive();
    const prompt = 'Tell me a fun fact.';
    await run.type(prompt);
    await run.type('\r');

    const hasUserPromptEvent = await rig.waitForTelemetryEvent('user_prompt');
    expect(hasUserPromptEvent).toBe(true);

    const hasSessionCountMetric = await rig.waitForMetric('session.count');
    expect(hasSessionCountMetric).toBe(true);

    // We expect NO flicker event to be found.
    const flickerMetric = rig.readMetric('ui.flicker.count');
    expect(flickerMetric).toBeNull();
  });
});
