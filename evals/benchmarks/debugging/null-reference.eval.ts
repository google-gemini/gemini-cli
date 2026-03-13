/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/null-reference', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should identify and fix a null reference error in TypeScript',
    category: 'debugging',
    tags: ['typescript', 'null-safety'],
    files: {
      'src/user.ts': `export interface User { name: string; address?: { city: string } }
export function getCity(user: User): string {
  return user.address.city; // BUG: address may be undefined
}
`,
      'src/user.test.ts': `import { getCity } from './user.js';
import { describe, it, expect } from 'vitest';
describe('getCity', () => {
  it('returns city when address exists', () => {
    expect(getCity({ name: 'Alice', address: { city: 'NYC' } })).toBe('NYC');
  });
  it('handles missing address gracefully', () => {
    expect(getCity({ name: 'Bob' })).toBe('');
  });
});
`,
    },
    prompt:
      'There is a bug in src/user.ts. The getCity function crashes when address is undefined. Fix it so getCity returns an empty string when address is missing.',
    assert: async (rig) => {
      const content = rig.readFile('src/user.ts');
      const hasGuard =
        content.includes('?.') ||
        content.includes('address &&') ||
        content.includes('?? ') ||
        content.includes('=== undefined') ||
        content.includes('!address');
      expect(hasGuard, 'Expected a null/undefined guard in fixed code').toBe(
        true,
      );
    },
  });
});
