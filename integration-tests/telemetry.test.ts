/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

describe('telemetry', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should emit a metric and a log event', async () => {
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

  it('should not write telemetry when disabled', async () => {
    rig.setup('telemetry-disabled', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'hooks-system.session-startup.responses',
      ),
      settings: {
        telemetry: { enabled: false },
      },
    });

    // Run a simple command with telemetry disabled
    await rig.run({
      args: 'say hello',
      env: { GEMINI_API_KEY: 'fake-key' },
    });

    // Verify that no telemetry log file was created
    const telemetryLogPath = join(rig.homeDir!, 'telemetry.log');
    expect(existsSync(telemetryLogPath)).toBe(false);
  });
});
