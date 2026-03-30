/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isValidToolName,
  getToolAliases,
  ALL_BUILTIN_TOOL_NAMES,
  DISCOVERED_TOOL_PREFIX,
  LS_TOOL_NAME,
} from './tool-names.js';

// Mock tool-names to provide a consistent alias for testing
vi.mock('./tool-names.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tool-names.js')>();
  const mockedAliases: Record<string, string> = {
    ...actual.TOOL_LEGACY_ALIASES,
    legacy_test_tool: 'current_test_tool',
    another_legacy_test_tool: 'current_test_tool',
  };
  return {
    ...actual,
    TOOL_LEGACY_ALIASES: mockedAliases,
    isValidToolName: vi.fn().mockImplementation((name: string, options) => {
      if (Object.prototype.hasOwnProperty.call(mockedAliases, name))
        return true;
      return actual.isValidToolName(name, options);
    }),
    getToolAliases: vi.fn().mockImplementation((name: string) => {
      const aliases = new Set<string>([name]);
      const canonicalName = mockedAliases[name] ?? name;
      aliases.add(canonicalName);
      for (const [legacyName, currentName] of Object.entries(mockedAliases)) {
        if (currentName === canonicalName) {
          aliases.add(legacyName);
        }
      }
      return Array.from(aliases);
    }),
  };
});

describe('tool-names', () => {
  describe('isValidToolName', () => {
    it('should validate built-in tool names', () => {
      expect(isValidToolName(LS_TOOL_NAME)).toBe(true);
      for (const name of ALL_BUILTIN_TOOL_NAMES) {
        expect(isValidToolName(name)).toBe(true);
      }
    });

    it('should validate discovered tool names', () => {
      expect(isValidToolName(`${DISCOVERED_TOOL_PREFIX}my_tool`)).toBe(true);
    });

    it('should validate modern MCP FQNs (mcp_server_tool)', () => {
      expect(isValidToolName('mcp_server_tool')).toBe(true);
      expect(isValidToolName('mcp_my-server_my-tool')).toBe(true);
    });

    it('should validate legacy tool aliases', async () => {
      const { TOOL_LEGACY_ALIASES } = await import('./tool-names.js');
      for (const legacyName of Object.keys(TOOL_LEGACY_ALIASES)) {
        expect(isValidToolName(legacyName)).toBe(true);
      }
    });

    it('should return false for invalid tool names', () => {
      expect(isValidToolName('invalid-tool-name')).toBe(false);
      expect(isValidToolName('mcp_server')).toBe(false);
      expect(isValidToolName('mcp__tool')).toBe(false);
      expect(isValidToolName('mcp_invalid server_tool')).toBe(false);
      expect(isValidToolName('mcp_server_invalid tool')).toBe(false);
      expect(isValidToolName('mcp_server_')).toBe(false);
    });

    it('should handle wildcards when allowed', () => {
      // Default: not allowed
      expect(isValidToolName('*')).toBe(false);
      expect(isValidToolName('mcp_*')).toBe(false);
      expect(isValidToolName('mcp_server_*')).toBe(false);

      // Explicitly allowed
      expect(isValidToolName('*', { allowWildcards: true })).toBe(true);
      expect(isValidToolName('mcp_*', { allowWildcards: true })).toBe(true);
      expect(isValidToolName('mcp_server_*', { allowWildcards: true })).toBe(
        true,
      );

      // Invalid wildcards
      expect(isValidToolName('mcp__*', { allowWildcards: true })).toBe(false);
      expect(
        isValidToolName('mcp_server_tool*', { allowWildcards: true }),
      ).toBe(false);
    });
  });

  describe('getToolAliases', () => {
    it('should return all associated names for a current tool', () => {
      const aliases = getToolAliases('current_test_tool');
      expect(aliases).toContain('current_test_tool');
      expect(aliases).toContain('legacy_test_tool');
      expect(aliases).toContain('another_legacy_test_tool');
    });

    it('should return all associated names for a legacy tool', () => {
      const aliases = getToolAliases('legacy_test_tool');
      expect(aliases).toContain('current_test_tool');
      expect(aliases).toContain('legacy_test_tool');
      expect(aliases).toContain('another_legacy_test_tool');
    });

    it('should return only the name itself if no aliases exist', () => {
      const aliases = getToolAliases('unknown_tool');
      expect(aliases).toEqual(['unknown_tool']);
    });
  });
});
