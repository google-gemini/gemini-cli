/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/missing-import', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should restore a missing import that causes a ReferenceError',
    category: 'debugging',
    tags: ['typescript', 'imports', 'modules'],
    files: {
      'src/utils.ts': `export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
`,
      'src/report.ts': `// BUG: formatDate is used but never imported
export function generateReport(date: Date): string {
  return \`Report generated on: \${formatDate(date)}\`;
}
`,
    },
    prompt:
      "src/report.ts calls formatDate but the import from './utils.js' is missing, which will cause a ReferenceError at runtime. Add the correct import statement.",
    assert: async (rig) => {
      const content = rig.readFile('src/report.ts');
      expect(content).toMatch(/import.*formatDate.*from/);
    },
  });
});
