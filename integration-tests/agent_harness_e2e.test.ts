/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('Agent Harness E2E', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should execute a simple prompt using the agent harness', async () => {
    await rig.setup('agent-harness-simple');

    // Run with the harness enabled via env var
    // Turn 1
    const result1 = await rig.run({
      args: ['chat', 'My name is GeminiUser'],
      env: {
        ...process.env,
        GEMINI_ENABLE_AGENT_HARNESS: 'true',
      },
    });
    expect(result1).toBeDefined();

    // Turn 2
    const result2 = await rig.run({
      args: ['chat', 'What is my name?', '--resume', 'latest'],
      env: {
        ...process.env,
        GEMINI_ENABLE_AGENT_HARNESS: 'true',
      },
    });

    expect(result2).toContain('GeminiUser');
  }, 30000);
});
