/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/incorrect-regex', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should fix an incorrect regex that fails to validate email addresses',
    category: 'debugging',
    tags: ['regex', 'validation', 'typescript'],
    files: {
      'src/validate.ts': `// BUG: regex is too simple — accepts "a@b" (no TLD) and rejects valid emails with subdomains
export function isValidEmail(email: string): boolean {
  return /^[a-z]+@[a-z]+$/.test(email);
}
`,
    },
    prompt:
      'src/validate.ts has an email validation regex that is far too restrictive: it only accepts lowercase letters, rejects dots, hyphens, digits, and multi-part domains. Fix the regex to correctly validate common email formats like user@example.com, first.last@sub.domain.org.',
    assert: async (rig) => {
      const content = rig.readFile('src/validate.ts');
      // The broken regex was /^[a-z]+@[a-z]+$/ — fix should contain dots or more character classes
      const hasImprovedRegex =
        content.includes('\\.') ||
        content.includes('[a-zA-Z0-9') ||
        content.includes('[\\w') ||
        content.includes('\\w') ||
        content.includes('+\\.') ||
        content.includes('[^@]');
      expect(hasImprovedRegex, 'Expected improved email regex').toBe(true);
    },
  });
});
