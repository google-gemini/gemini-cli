/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/json-parse-error', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should wrap JSON.parse in try/catch to handle malformed input',
    category: 'debugging',
    tags: ['json', 'error-handling', 'typescript'],
    files: {
      'src/config.ts': `// BUG: JSON.parse throws SyntaxError on malformed input, crashing the app
export function loadConfig(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}
`,
    },
    prompt:
      'src/config.ts calls JSON.parse without any error handling. If the input is malformed JSON, the app crashes with an unhandled SyntaxError. Also, the direct type assertion is unsafe. Fix it: wrap JSON.parse in try/catch and return a safe fallback (empty object) on parse failure.',
    assert: async (rig) => {
      const content = rig.readFile('src/config.ts');
      expect(content).toContain('try');
      expect(content).toContain('catch');
    },
  });
});
