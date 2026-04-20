/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestRig } from './test-helper.js';

describe('gemma4 routing', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('routes gemini-pro to gemma-4-31b-it when configured', async () => {
    await rig.setup('gemma4-routing', {
      fakeResponsesPath: join(
        dirname(fileURLToPath(import.meta.url)),
        'gemma4-routing.responses',
      ),
      settings: {
        model: {
          gemma4Variant: 'gemma-4-31b-it',
        },
      },
    });

    // We don't need real responses since we're just checking the routing/telemetry
    // But TestRig might require them if it actually tries to call the API.
    // Let's use a simple prompt.
    await rig.run({
      args: ['--model', 'gemini-2.5-pro', 'Hello!'],
    });

    const hasApiRequestEvent = await rig.waitForTelemetryEvent('api_request');
    expect(hasApiRequestEvent).toBe(true);

    const lastRequest = rig.readLastApiRequest();

    expect(lastRequest).not.toBeNull();
    // The telemetry logger records the final requested model ID in the 'model' attribute
    expect(lastRequest?.attributes?.model).toBe('gemma-4-31b-it');
  });
});
