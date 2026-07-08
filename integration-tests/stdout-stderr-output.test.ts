/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { TestRig } from './test-helper.js';

describe('stdout-stderr-output', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should send model response to stdout and app messages to stderr', async ({
    signal,
  }) => {
    await rig.setup('prompt-output-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'stdout-stderr-output.responses',
      ),
    });

    const { stdout, exitCode } = await rig.runWithStreams(['-p', 'Say hello'], {
      signal,
    });

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('hello');
    expect(stdout).not.toMatch(/^\[ERROR\]/m);
    expect(stdout).not.toMatch(/^\[INFO\]/m);
  });

  it('should handle missing file with message to stdout and error to stderr', async ({
    signal,
  }) => {
    await rig.setup('error-output-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'stdout-stderr-output-error.responses',
      ),
    });

    const { stdout, exitCode } = await rig.runWithStreams(
      ['-p', '@nonexistent-file-that-does-not-exist.txt explain this'],
      { signal },
    );

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toMatch(
      /could not find|not exist|does not exist/,
    );
  });
});
