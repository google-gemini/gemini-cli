/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/env-variable-missing', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should add a fallback or validation for a missing environment variable',
    category: 'debugging',
    tags: ['environment', 'config', 'typescript'],
    files: {
      'src/db.ts': `// BUG: process.env.DATABASE_URL is used directly without a fallback or check.
// If the variable is not set, the driver will receive undefined and throw an
// unhelpful error at connection time.
export function getDatabaseUrl(): string {
  return process.env['DATABASE_URL'] as string;
}
`,
    },
    prompt:
      "src/db.ts returns process.env['DATABASE_URL'] cast to string without validating that it's actually set. If the env var is missing, the caller gets undefined masquerading as a string. Add a validation check that throws a descriptive error when DATABASE_URL is not set, or add a sensible fallback.",
    assert: async (rig) => {
      const content = rig.readFile('src/db.ts');
      const hasValidation =
        content.includes('throw') ||
        content.includes('??') ||
        content.includes('|| ') ||
        content.includes('if (') ||
        content.includes('!process.env');
      expect(
        hasValidation,
        'Expected validation or fallback for missing env variable',
      ).toBe(true);
    },
  });
});
