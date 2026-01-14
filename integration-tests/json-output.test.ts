/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { ExitCodes } from '@google/gemini-cli-core/src/index.js';

describe('JSON output', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should return a valid JSON with response and stats', async () => {
    await rig.setup('json-output-france', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'json-output.france.responses',
      ),
    });
    const result = await rig.run({
      args: ['What is the capital of France?', '--output-format', 'json'],
    });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('response');
    expect(typeof parsed.response).toBe('string');
    expect(parsed.response.toLowerCase()).toContain('paris');

    expect(parsed).toHaveProperty('stats');
    expect(typeof parsed.stats).toBe('object');
  });

  it('should return a valid JSON with a session ID', async () => {
    await rig.setup('json-output-session-id', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'json-output.session-id.responses',
      ),
    });
    const result = await rig.run({
      args: ['Hello', '--output-format', 'json'],
    });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('session_id');
    expect(typeof parsed.session_id).toBe('string');
    expect(parsed.session_id).not.toBe('');
  });

  it('should return a JSON error for sd auth mismatch before running', async () => {
    await rig.setup('json-output-auth-mismatch', {
      settings: {
        security: {
          auth: { enforcedType: 'gemini-api-key', selectedType: '' },
        },
      },
    });

    let thrown: Error | undefined;
    try {
      await rig.run({
        args: ['Hello', '--output-format', 'json'],
        env: { GOOGLE_GENAI_USE_GCA: 'true' },
      });
      expect.fail('Expected process to exit with error');
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeDefined();
    const message = (thrown as Error).message;

    // Use a regex to find the first complete JSON object in the string
    const jsonMatch = message.match(/{[\s\S]*}/);

    // Fail if no JSON-like text was found
    expect(
      jsonMatch,
      'Expected to find a JSON object in the error output',
    ).toBeTruthy();

    let payload;
    try {
      // Parse the matched JSON string
      payload = JSON.parse(jsonMatch![0]);
    } catch (parseError) {
      console.error('Failed to parse the following JSON:', jsonMatch![0]);
      throw new Error(
        `Test failed: Could not parse JSON from error message. Details: ${parseError}`,
      );
    }

    expect(payload.error).toBeDefined();
    expect(payload.error.type).toBe('Error');
    expect(payload.error.code).toBe(ExitCodes.FATAL_AUTHENTICATION_ERROR);
    expect(payload.error.message).toContain(
      "enforced authentication type is 'gemini-api-key'",
    );
    expect(payload.error.message).toContain("current type is 'oauth-personal'");
    expect(payload).toHaveProperty('session_id');
    expect(typeof payload.session_id).toBe('string');
    expect(payload.session_id).not.toBe('');
  });

  it('should not exit on tool errors and allow model to self-correct in JSON mode', async () => {
    await rig.setup('json-output-error', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'json-output.error.responses',
      ),
    });
    const result = await rig.run({
      args: [
        `Read the contents of ${rig.testDir}/path/to/nonexistent/file.txt and tell me what it says. ` +
          'On error, respond to the user with exactly the text "File not found".',
        '--output-format',
        'json',
      ],
    });

    const parsed = JSON.parse(result);

    // The response should contain an actual response from the model,
    // not a fatal error that caused the CLI to exit
    expect(parsed).toHaveProperty('response');
    expect(typeof parsed.response).toBe('string');

    // The model should acknowledge the error in its response with exactly the
    // text "File not found" based on the instruction above, but we also match
    // some other forms. If you get flakes for this test please file an issue to
    // come up with a more robust solution.
    expect(parsed.response.toLowerCase()).toMatch(
      /cannot|does not exist|doesn't exist|not found|unable to|error|couldn't/,
    );

    // Stats should be present, indicating the session completed normally.
    expect(parsed).toHaveProperty('stats');

    // Should see one failed tool call in the stats.
    expect(parsed.stats).toHaveProperty('tools');
    expect(parsed.stats.tools.totalCalls).toBe(1);
    expect(parsed.stats.tools.totalFail).toBe(1);
    expect(parsed.stats.tools.totalSuccess).toBe(0);

    // Should NOT have an error field at the top level
    expect(parsed.error).toBeUndefined();

    expect(parsed).toHaveProperty('session_id');
    expect(typeof parsed.session_id).toBe('string');
    expect(parsed.session_id).not.toBe('');
  });
});
