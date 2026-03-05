/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/test-false-positive', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should fix a test that always passes due to a bad mock returning wrong value',
    category: 'debugging',
    tags: ['testing', 'mocks', 'typescript', 'vitest'],
    files: {
      'src/emailService.ts': `export async function sendEmail(to: string, subject: string): Promise<boolean> {
  // Real implementation would call an SMTP server
  throw new Error('Not implemented in tests');
}
`,
      'src/notifier.ts': `import { sendEmail } from './emailService.js';

export async function notifyUser(email: string): Promise<string> {
  const sent = await sendEmail(email, 'Welcome!');
  if (sent) {
    return 'Email sent successfully';
  }
  return 'Email failed';
}
`,
      'src/notifier.test.ts': `import { describe, it, expect, vi } from 'vitest';
import { notifyUser } from './notifier.js';

// BUG: the mock always returns true regardless of the argument,
// so the test never actually validates the failure path.
vi.mock('./emailService.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true), // always succeeds — failure branch never tested
}));

describe('notifyUser', () => {
  it('returns success message when email is sent', async () => {
    const result = await notifyUser('user@example.com');
    expect(result).toBe('Email sent successfully');
  });

  it('returns failure message when email fails', async () => {
    // BUG: mock still returns true here, so this test is a false positive
    const result = await notifyUser('bad@example.com');
    expect(result).toBe('Email sent successfully'); // wrong expectation!
  });
});
`,
    },
    prompt:
      "src/notifier.test.ts has a false-positive test: the failure case test expects 'Email sent successfully' because the mock always returns true and the expectation was never updated to test the actual failure path. Fix the test so it correctly mocks sendEmail returning false for the failure case and asserts 'Email failed'.",
    assert: async (rig) => {
      const content = rig.readFile('src/notifier.test.ts');
      expect(content).toContain('Email failed');
      const hasFalseMock =
        content.includes('mockResolvedValue(false)') ||
        content.includes('mockReturnValue(false)') ||
        content.includes('mockResolvedValueOnce(false)');
      expect(
        hasFalseMock,
        'Expected mock to return false for failure test case',
      ).toBe(true);
    },
  });
});
