/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { sanitizeMcpContent } from './mcp-sanitization.js';

describe('sanitizeMcpContent', () => {
  it('should wrap simple content with delimiters', () => {
    const input = 'Simple content';
    const expected =
      '--- Start of MCP Tool Response ---\nSimple content\n--- End of MCP Tool Response ---';
    expect(sanitizeMcpContent(input)).toBe(expected);
  });

  it('should preserve multiline content', () => {
    const input = 'Line 1\nLine 2';
    const expected =
      '--- Start of MCP Tool Response ---\nLine 1\nLine 2\n--- End of MCP Tool Response ---';
    expect(sanitizeMcpContent(input)).toBe(expected);
  });

  it('should handle empty strings', () => {
    const input = '';
    const expected =
      '--- Start of MCP Tool Response ---\n\n--- End of MCP Tool Response ---';
    expect(sanitizeMcpContent(input)).toBe(expected);
  });
});
