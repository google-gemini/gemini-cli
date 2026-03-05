/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/wrong-http-method', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should fix a POST request that should be a GET',
    category: 'debugging',
    tags: ['http', 'api', 'typescript'],
    files: {
      'src/api.ts': `// BUG: fetching a resource with POST instead of GET
export async function getUser(id: number): Promise<unknown> {
  const response = await fetch(\`/api/users/\${id}\`, {
    method: 'POST', // BUG: should be GET for a read-only fetch
  });
  return response.json();
}
`,
    },
    prompt:
      "src/api.ts uses method: 'POST' in getUser, but this is a read operation that should use GET. Some servers reject POST for pure read endpoints. Fix the HTTP method.",
    assert: async (rig) => {
      const content = rig.readFile('src/api.ts');
      expect(content).not.toContain("method: 'POST'");
      expect(content).not.toContain('method: "POST"');
      const hasGet =
        content.includes("method: 'GET'") ||
        content.includes('method: "GET"') ||
        // simplest fix: remove the method entirely (defaults to GET)
        !content.includes('method:');
      expect(
        hasGet,
        'Expected GET method or no method property (defaults to GET)',
      ).toBe(true);
    },
  });
});
