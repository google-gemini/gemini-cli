/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('JSON output', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = new TestRig();
    await rig.setup('json-output-test');
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should return a valid JSON with response and stats', async () => {
    const result = await rig.run(
      'What is the capital of France?',
      '--output-format',
      'json',
    );
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('response');
    expect(typeof parsed.response).toBe('string');
    expect(parsed.response.toLowerCase()).toContain('paris');

    expect(parsed).toHaveProperty('stats');
    expect(typeof parsed.stats).toBe('object');
  });

  it('should return a JSON error for enforced auth mismatch before running', async () => {
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';
    await rig.setup('json-output-auth-mismatch', {
      settings: {
        security: { auth: { enforcedType: 'gemini-api-key' } },
      },
    });

    let thrown: Error | undefined;
    try {
      await rig.run('Hello', '--output-format', 'json');
      expect.fail('Expected process to exit with error');
    } catch (e) {
      thrown = e as Error;
    } finally {
      delete process.env['GOOGLE_GENAI_USE_GCA'];
    }

    expect(thrown).toBeDefined();
    const message = (thrown as Error).message;
    const jsonStart = message.indexOf('{');
    expect(jsonStart).toBeGreaterThan(-1);
    const payload = JSON.parse(message.slice(jsonStart));
    expect(payload.error).toBeDefined();
    expect(payload.error.type).toBe('Error');
    expect(payload.error.code).toBe(1);
    expect(payload.error.message).toContain(
      'configured auth type is gemini-api-key',
    );
    expect(payload.error.message).toContain(
      'current auth type is oauth-personal',
    );
  });
});
