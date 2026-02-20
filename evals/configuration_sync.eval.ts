/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Configuration Sync', () => {
  /**
   * Verifies that the agent checks configuration files when adding a new entry point.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should verify tsconfig when adding a new source file',
    files: {
      'src/index.ts': 'console.log("main");',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true },
        include: ['src/index.ts'],
      }),
    },
    prompt:
      'Add a new utility file src/utils.ts and ensure it is included in the project configuration.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check if it read or edited tsconfig.json
      const touchedTsConfig = toolLogs.some(
        (log) =>
          (log.toolRequest.name === 'read_file' ||
            log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('tsconfig.json'),
      );

      expect(
        touchedTsConfig,
        'Agent should have verified or updated tsconfig.json when adding a new source file',
      ).toBe(true);
    },
  });
});
