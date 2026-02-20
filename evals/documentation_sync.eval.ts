/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Documentation Sync', () => {
  /**
   * Verifies that the agent searches for documentation references when changing a CLI interface.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should search for documentation references after changing a CLI flag',
    files: {
      'src/cli.ts': 'program.option("--old-flag", "Old description");',
      'README.md': 'Use --old-flag to perform the operation.',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
      }),
    },
    prompt:
      'Rename the CLI flag "--old-flag" to "--new-flag" in src/cli.ts. Ensure the documentation is also updated.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check if it searched for the flag in the whole workspace (including README.md)
      const ranSearch = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'grep_search' &&
          (log.toolRequest.args.includes('--old-flag') ||
            log.toolRequest.args.includes('old-flag')),
      );
      expect(
        ranSearch,
        'Agent should have searched for the flag to find documentation references',
      ).toBe(true);

      // Check if README.md was edited
      const editedDoc = toolLogs.some(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('README.md') &&
          log.toolRequest.args.includes('--new-flag'),
      );
      expect(
        editedDoc,
        'Agent should have updated the documentation in README.md',
      ).toBe(true);
    },
  });
});
