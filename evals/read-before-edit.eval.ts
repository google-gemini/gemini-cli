/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  GREP_TOOL_NAME,
  EDIT_TOOL_NAMES,
} from '@google/gemini-cli-core';

const READ_TOOL_NAMES = new Set([
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  GREP_TOOL_NAME,
]);

const TARGET_FILE = 'userService.ts';

function targetsFile(toolName: string, argsJson: string): boolean {
  try {
    const args = JSON.parse(argsJson);
    if (toolName === GREP_TOOL_NAME) {
      const include = args.include_pattern ?? '';
      return (
        !include || include.includes('*.ts') || include.includes(TARGET_FILE)
      );
    }
    const filePath: string = args.file_path ?? '';
    if (filePath.includes(TARGET_FILE)) return true;
    const include = args.include;
    return Array.isArray(include)
      ? include.some((p: string) => p.includes(TARGET_FILE) || p.includes('*.ts'))
      : false;
  } catch {
    return false;
  }
}

describe('read_before_edit', () => {
  /**
   * Ensures the agent reads a file before editing it. The bug requires
   * reading the file to understand the context — the agent can't guess
   * which field is wrong without seeing the interface and surrounding code.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read a file before editing it',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'user-service',
          version: '1.0.0',
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
        },
        null,
        2,
      ),
      'src/userService.ts': `export interface User {
  id: string;
  name: string;
  email: string;
  loyaltyPoints: number;
  orderCount: number;
  isActive: boolean;
}

export function formatUserDisplay(user: User): string {
  return \`\${user.name} <\${user.email}> (\${user.loyaltyPoints} pts)\`;
}

export function calculateDiscount(user: User): number {
  if (!user.isActive) return 0;
  if (user.loyaltyPoints >= 1000) return 20;
  if (user.loyaltyPoints >= 500) return 10;
  return 0;
}

// BUG: This should check loyaltyPoints >= 100, not orderCount >= 100
export function isEligibleForDiscount(user: User): boolean {
  return user.isActive && user.orderCount >= 100;
}
`,
      'src/userService.test.ts': `import { expect, test } from 'vitest';
import { isEligibleForDiscount, User } from './userService';

test('active user with enough loyalty points is eligible for discount', () => {
  const user: User = {
    id: '1', name: 'Alice', email: 'alice@example.com',
    loyaltyPoints: 150, orderCount: 3, isActive: true,
  };
  expect(isEligibleForDiscount(user)).toBe(true);
});

test('inactive user is not eligible', () => {
  const user: User = {
    id: '2', name: 'Bob', email: 'bob@example.com',
    loyaltyPoints: 500, orderCount: 10, isActive: false,
  };
  expect(isEligibleForDiscount(user)).toBe(false);
});
`,
    },
    prompt:
      'Fix the bug in src/userService.ts. The isEligibleForDiscount function is not working correctly. Do not run the code.',
    timeout: 180000,
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const firstEditIndex = toolLogs.findIndex(
        (log) =>
          EDIT_TOOL_NAMES.has(log.toolRequest.name) &&
          targetsFile(log.toolRequest.name, log.toolRequest.args),
      );

      expect(
        firstEditIndex,
        'Expected the agent to edit src/userService.ts',
      ).toBeGreaterThanOrEqual(0);

      const firstReadIndex = toolLogs.findIndex(
        (log) =>
          READ_TOOL_NAMES.has(log.toolRequest.name) &&
          targetsFile(log.toolRequest.name, log.toolRequest.args),
      );

      expect(
        firstReadIndex,
        'Expected the agent to read src/userService.ts before editing it',
      ).toBeGreaterThanOrEqual(0);

      expect(
        firstReadIndex,
        `Read (index ${firstReadIndex}) should occur before edit (index ${firstEditIndex})`,
      ).toBeLessThan(firstEditIndex);

      const content = rig.readFile('src/userService.ts');
      expect(content).toMatch(/loyaltyPoints\s*>=\s*100/);
    },
  });
});
