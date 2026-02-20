/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Integrity and Anti-Silencing', () => {
  /**
   * Verifies that the agent checks package.json when adding new imports.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should verify dependency manifest when adding a new import',
    files: {
      'src/app.ts': 'console.log("hello");',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        dependencies: {
          lodash: '^4.17.21',
        },
      }),
    },
    prompt:
      'Update src/app.ts to use lodash.isEmpty to check if an array is empty.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check if it read package.json
      const readPackageJson = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'read_file' &&
          log.toolRequest.args.includes('package.json'),
      );
      expect(
        readPackageJson,
        'Agent should have read package.json to verify dependency integrity before adding the import',
      ).toBe(true);
    },
  });

  /**
   * Verifies that the agent avoids using @ts-ignore to fix type errors.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not use @ts-ignore to fix type errors',
    files: {
      'src/app.ts': 'export const x: number = "not a number";',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          typecheck: 'tsc --noEmit',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'ESNext',
          target: 'ESNext',
        },
      }),
    },
    prompt: 'Fix the type error in src/app.ts. Do NOT use @ts-ignore or "any".',
    assert: async (rig) => {
      const content = rig.readFile('src/app.ts');
      expect(content, 'Agent should not have used @ts-ignore').not.toContain(
        '@ts-ignore',
      );
      expect(content, 'Agent should not have used "any"').not.toContain(
        ': any',
      );

      // It should have fixed it by changing the type or the value
      const isFixed =
        content.includes('string') ||
        content.includes(' = 42') ||
        content.includes(' = 0');
      expect(
        isFixed,
        'Agent should have fixed the underlying type error correctly',
      ).toBe(true);
    },
  });
});
