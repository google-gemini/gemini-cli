/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Usage Discovery', () => {
  /**
   * Verifies that the agent mandates usage discovery (searching for call sites)
   * before modifying an exported symbol.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should search for usages before renaming an exported function',
    files: {
      'src/math.ts': 'export const add = (a: number, b: number) => a + b;',
      'src/app.ts': 'import { add } from "./math"; console.log(add(1, 2));',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
      }),
    },
    prompt:
      'Rename the "add" function in src/math.ts to "sum". Ensure the refactor is complete.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // 1. Usage Discovery: Check if it ran grep_search for "add"
      const ranUsageDiscovery = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'grep_search' &&
          log.toolRequest.args.includes('add'),
      );
      expect(
        ranUsageDiscovery,
        'Agent should have searched for "add" to find usages before renaming',
      ).toBe(true);

      // 2. Complete Refactor: Check if it edited both files
      const editedMath = toolLogs.some(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/math.ts') &&
          log.toolRequest.args.includes('sum'),
      );
      const editedApp = toolLogs.some(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/app.ts') &&
          log.toolRequest.args.includes('sum'),
      );

      expect(editedMath, 'Agent should have edited src/math.ts').toBe(true);
      expect(
        editedApp,
        'Agent should have edited src/app.ts to update the usage',
      ).toBe(true);
    },
  });
});
