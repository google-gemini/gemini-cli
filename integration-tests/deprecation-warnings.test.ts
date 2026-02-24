/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

/**
 * integration test to ensure no node.js deprecation warnings are emitted.
 * must run for all supported node versions as warnings may vary by version.
 */
describe('deprecation-warnings', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should not emit any deprecation warnings when running --version', async () => {
    await rig.setup(
      'should not emit any deprecation warnings when running --version',
    );

    const { stderr, exitCode } = await rig.runWithStreams(['--version']);

    // node.js deprecation warnings: (node:12345) [DEP0040] DeprecationWarning: ...
    const deprecationWarningPattern = /\[DEP\d+\].*DeprecationWarning/i;
    const hasDeprecationWarning = deprecationWarningPattern.test(stderr);

    if (hasDeprecationWarning) {
      const deprecationMatches = stderr.match(
        /\[DEP\d+\].*DeprecationWarning:.*/gi,
      );
      const warnings = deprecationMatches
        ? deprecationMatches.map((m) => m.trim()).join('\n')
        : 'Unknown deprecation warning format';

      throw new Error(
        `Deprecation warnings detected in CLI output:\n${warnings}\n\n` +
          `Full stderr:\n${stderr}\n\n` +
          `This test ensures no deprecated Node.js modules are used. ` +
          `Please update dependencies to use non-deprecated alternatives.`,
      );
    }

    // only check exit code if no deprecation warnings found
    if (exitCode !== 0) {
      throw new Error(
        `CLI exited with code ${exitCode} (expected 0). This may indicate a setup issue.\n` +
          `Stderr: ${stderr}`,
      );
    }
  });

  it('should not emit any deprecation warnings when running with --help', async () => {
    await rig.setup(
      'should not emit any deprecation warnings when running with --help',
    );

    const { stderr, exitCode } = await rig.runWithStreams(['--help']);

    const deprecationWarningPattern = /\[DEP\d+\].*DeprecationWarning/i;
    const hasDeprecationWarning = deprecationWarningPattern.test(stderr);

    if (hasDeprecationWarning) {
      const deprecationMatches = stderr.match(
        /\[DEP\d+\].*DeprecationWarning:.*/gi,
      );
      const warnings = deprecationMatches
        ? deprecationMatches.map((m) => m.trim()).join('\n')
        : 'Unknown deprecation warning format';

      throw new Error(
        `Deprecation warnings detected in CLI output:\n${warnings}\n\n` +
          `Full stderr:\n${stderr}\n\n` +
          `This test ensures no deprecated Node.js modules are used. ` +
          `Please update dependencies to use non-deprecated alternatives.`,
      );
    }

    // only check exit code if no deprecation warnings found
    if (exitCode !== 0) {
      throw new Error(
        `CLI exited with code ${exitCode} (expected 0). This may indicate a setup issue.\n` +
          `Stderr: ${stderr}`,
      );
    }
  });
});
