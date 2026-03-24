/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('redundant_casts', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should not add redundant or unsafe casts when modifying typescript code',
    files: {
      'src/cast_example.ts': `
export interface User {
  id: string;
  name: string;
}

export function processUser(user: User) {
  // Narrowed check
  console.log("Processing user: " + user.name);
}

export function handleUnknown(data: unknown) {
  // Goal: log data.id if it exists
  console.log("Handling data");
}

export function handleError() {
  try {
    throw new Error("fail");
  } catch (err) {
    // Goal: log err.message
    console.error("Error happened");
  }
}
`,
    },
    prompt: `
1. In src/cast_example.ts, update processUser to return the name in uppercase.
2. In handleUnknown, log the "id" property if "data" is an object that contains it.
3. In handleError, log the error message from "err".
`,
    assert: async (rig) => {
      const filePath = path.join(rig.testDir!, 'src/cast_example.ts');
      const content = await fs.readFile(filePath, 'utf-8');

      // 1. Redundant Cast Check (Same type)
      // Bad: (user.name as string).toUpperCase()
      expect(content, 'Should not cast a known string to string').not.toContain(
        'as string',
      );

      // 2. Unsafe Cast Check (Unknown object)
      // Bad: (data as any).id or (data as {id: string}).id
      expect(
        content,
        'Should not use unsafe casts for unknown property access',
      ).not.toContain('as any');
      expect(
        content,
        'Should not use unsafe casts for unknown property access',
      ).not.toContain('as {');

      // 3. Unsafe Cast Check (Error handling)
      // Bad: (err as Error).message
      // Good: if (err instanceof Error) { ... }
      expect(
        content,
        'Should prefer instanceof over casting for errors',
      ).not.toContain('as Error');

      // Verify implementation
      expect(content).toContain('toUpperCase()');
      expect(content).toContain('message');
      expect(content).toContain('id');
    },
  });
});
