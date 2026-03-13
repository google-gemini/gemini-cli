/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/unhandled-promise-rejection', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should add error handling to an async function missing catch',
    category: 'debugging',
    tags: ['async', 'error-handling', 'typescript'],
    files: {
      'src/fetcher.ts': `// BUG: no error handling — network failure causes unhandled rejection
export async function fetchUser(id: number): Promise<{ name: string }> {
  const response = await fetch(\`https://api.example.com/users/\${id}\`);
  const data = await response.json();
  return data as { name: string };
}
`,
    },
    prompt:
      'src/fetcher.ts has no error handling. If the fetch fails or the server returns a non-OK status, the promise rejects silently or the caller gets unexpected data. Add proper error handling: check response.ok and wrap in try/catch, throwing a descriptive error on failure.',
    assert: async (rig) => {
      const content = rig.readFile('src/fetcher.ts');
      const hasErrorHandling =
        content.includes('try') ||
        content.includes('.catch') ||
        content.includes('response.ok') ||
        content.includes('!response.ok') ||
        content.includes('throw');
      expect(
        hasErrorHandling,
        'Expected error handling (try/catch or response.ok check)',
      ).toBe(true);
    },
  });
});
