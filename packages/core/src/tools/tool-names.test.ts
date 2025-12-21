/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isValidToolName,
  ALL_BUILTIN_TOOL_NAMES,
  DISCOVERED_TOOL_PREFIX,
  LS_TOOL_NAME,
} from './tool-names.js';

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

    it('should validate MCP tool names (server__tool)', () => {
      expect(isValidToolName('server__tool')).toBe(true);
      expect(isValidToolName('my-server__my-tool')).toBe(true);
    });

    it('should reject invalid tool names', () => {
      expect(isValidToolName('')).toBe(false);
      expect(isValidToolName('invalid-name')).toBe(false);
      expect(isValidToolName('server__')).toBe(false);
      expect(isValidToolName('__tool')).toBe(false);
      expect(isValidToolName('server__tool__extra')).toBe(false);
    });

    it('should handle wildcards when allowed', () => {
      // Default: not allowed
      expect(isValidToolName('*')).toBe(false);
      expect(isValidToolName('server__*')).toBe(false);

      // Explicitly allowed
      expect(isValidToolName('*', { allowWildcards: true })).toBe(true);
      expect(isValidToolName('server__*', { allowWildcards: true })).toBe(true);

      // Invalid wildcards
      expect(isValidToolName('__*', { allowWildcards: true })).toBe(false);
      expect(isValidToolName('server__tool*', { allowWildcards: true })).toBe(
        false,
      );
    });
  });
});
