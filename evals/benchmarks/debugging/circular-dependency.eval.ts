/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/circular-dependency', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should break a circular import between two modules',
    category: 'debugging',
    tags: ['typescript', 'modules', 'architecture'],
    files: {
      'src/a.ts': `import { greetB } from './b.js';

export function greetA(): string {
  return 'Hello from A, ' + greetB();
}
`,
      'src/b.ts': `import { greetA } from './a.js'; // BUG: circular — a imports b, b imports a

export function greetB(): string {
  return 'Hello from B';
}

export function combined(): string {
  return greetA() + ' and B';
}
`,
      'src/index.ts': `export { greetA } from './a.js';
export { greetB, combined } from './b.js';
`,
    },
    prompt:
      'src/a.ts and src/b.ts have a circular dependency: a imports greetB from b, and b imports greetA from a. This causes initialization issues. Break the cycle by introducing a shared src/shared.ts module or by restructuring the imports so neither module depends on the other.',
    assert: async (rig) => {
      const aContent = rig.readFile('src/a.ts');
      const bContent = rig.readFile('src/b.ts');
      // After fix, b.ts should not import from a.ts
      const bStillCircular =
        bContent.includes("from './a.js'") ||
        bContent.includes('from "./a.js"');
      expect(bStillCircular, 'b.ts should no longer import from a.ts').toBe(
        false,
      );
      // And a.ts should still be valid (has some export or content)
      expect(aContent.length).toBeGreaterThan(10);
    },
  });
});
