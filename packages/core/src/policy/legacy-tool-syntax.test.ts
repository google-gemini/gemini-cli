/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { PolicyDecision } from './types.js';
import {
  isLegacyCommandScopedToolRef,
  mapExcludeToolsToDenyRules,
  normalizeLegacyCommandPrefix,
} from './legacy-tool-syntax.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';

describe('legacy-tool-syntax', () => {
  describe('isLegacyCommandScopedToolRef', () => {
    it('detects parenthesized command restrictions', () => {
      expect(isLegacyCommandScopedToolRef('run_shell_command(rm -rf *)')).toBe(
        true,
      );
      expect(isLegacyCommandScopedToolRef('run_shell_command')).toBe(false);
    });
  });

  describe('normalizeLegacyCommandPrefix', () => {
    it('strips a trailing glob star', () => {
      expect(normalizeLegacyCommandPrefix('rm -rf *')).toBe('rm -rf');
      expect(normalizeLegacyCommandPrefix('rm')).toBe('rm');
      expect(normalizeLegacyCommandPrefix('*')).toBeUndefined();
    });
  });

  describe('mapExcludeToolsToDenyRules', () => {
    it('denies a whole tool for a bare name', () => {
      const rules = mapExcludeToolsToDenyRules(
        ['run_shell_command'],
        4.4,
        'Settings (Tools Excluded)',
      );
      expect(rules).toEqual([
        {
          toolName: SHELL_TOOL_NAME,
          decision: PolicyDecision.DENY,
          priority: 4.4,
          source: 'Settings (Tools Excluded)',
        },
      ]);
    });

    it('converts parenthesized shell excludes into command-prefix deny rules', () => {
      const warn = vi.fn();
      const rules = mapExcludeToolsToDenyRules(
        ['run_shell_command(rm -rf *)'],
        4.4,
        'Settings (Tools Excluded)',
        warn,
      );

      expect(warn).toHaveBeenCalledOnce();
      expect(rules).toHaveLength(1);
      expect(rules[0]?.toolName).toBe(SHELL_TOOL_NAME);
      expect(rules[0]?.decision).toBe(PolicyDecision.DENY);
      expect(rules[0]?.argsPattern).toBeInstanceOf(RegExp);

      const argsPattern = rules[0]?.argsPattern;
      expect(argsPattern?.test('{"command":"rm -rf /tmp/victim"}')).toBe(true);
      expect(argsPattern?.test('{"command":"ls -la"}')).toBe(false);
    });

    it('normalizes ShellTool aliases', () => {
      const rules = mapExcludeToolsToDenyRules(
        ['ShellTool(rm)'],
        4.4,
        'Settings (Tools Excluded)',
      );
      expect(rules[0]?.toolName).toBe(SHELL_TOOL_NAME);
      expect(rules[0]?.argsPattern?.test('{"command":"rm -rf /"}')).toBe(true);
    });
  });
});
