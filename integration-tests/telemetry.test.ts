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

describe.concurrent('telemetry', () => {
  beforeEach<LocalTestContext>(setupTestRig);
  afterEach<LocalTestContext>(cleanupTestRig);

  it<LocalTestContext>('should emit a metric and a log event', async ({
    rig,
  }) => {
    rig.setup('should emit a metric and a log event');

    // Run a simple command that should trigger telemetry
    await rig.run({ args: 'just saying hi' });

    // Verify that a user_prompt event was logged
    const hasUserPromptEvent = await rig.waitForTelemetryEvent('user_prompt');
    expect(hasUserPromptEvent).toBe(true);

    // Verify that a cli_command_count metric was emitted
    const cliCommandCountMetric = rig.readMetric('session.count');
    expect(cliCommandCountMetric).not.toBeNull();
  });
});
