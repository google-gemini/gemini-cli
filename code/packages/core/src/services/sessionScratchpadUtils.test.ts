/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { SHELL_TOOL_NAME } from '../tools/definitions/base-declarations.js';
import {
  sanitizeWorkflowSummaryForScratchpad,
  summarizeShellCommandForScratchpad,
} from './sessionScratchpadUtils.js';

describe('sessionScratchpadUtils', () => {
  describe('summarizeShellCommandForScratchpad', () => {
    it('summarizes quoted and assignment-prefixed shell commands', () => {
      expect(summarizeShellCommandForScratchpad('"npm" run test')).toBe('npm');
      expect(
        summarizeShellCommandForScratchpad(
          'DATABASE_URL=postgres://user:password@example/db pnpm test',
        ),
      ).toBe('pnpm');
    });

    it('handles adversarial unterminated quoted input without exposing arguments', () => {
      const adversarialCommand = `"${'\\"!'.repeat(10_000)}`;

      expect(summarizeShellCommandForScratchpad(adversarialCommand)).toBe(
        'shell',
      );
    });
  });

  describe('sanitizeWorkflowSummaryForScratchpad', () => {
    it('sanitizes adversarial shell commands in workflow summaries', () => {
      const adversarialCommand = `"${'\\"!'.repeat(10_000)}`;

      expect(
        sanitizeWorkflowSummaryForScratchpad(
          `${SHELL_TOOL_NAME}: ${adversarialCommand} -> read_file`,
        ),
      ).toBe(`${SHELL_TOOL_NAME}: shell -> read_file`);
    });
  });
});
