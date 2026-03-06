/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('deprecated-spew', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  const forbiddenPatterns = [
    'DeprecationWarning',
    'ExperimentalWarning',
    'punycode',
    'The `punycode` module is deprecated',
  ];

  it('should not contain any deprecated package spew in stderr when running --version', async () => {
    rig.setup('deprecated-spew-version-test');

    const { stderr, exitCode } = await rig.runWithStreams(['--version']);

    expect(exitCode).toBe(0);

    for (const pattern of forbiddenPatterns) {
      expect(stderr).not.toContain(pattern);
    }
  });

  it('should not contain any deprecated package spew in stderr when running a prompt', async () => {
    rig.setup('deprecated-spew-prompt-test');

    // Use a command that doesn't require API key if possible, or just ignore exit code
    const output = await rig
      .run({
        args: ['-p', '/about'],
      })
      .catch((err) => err.message);

    for (const pattern of forbiddenPatterns) {
      expect(output).not.toContain(pattern);
    }
  });
});
