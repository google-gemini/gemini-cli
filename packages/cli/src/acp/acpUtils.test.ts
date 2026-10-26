/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { AnsiOutput, ToolResult } from '@google/gemini-cli-core';
import { toToolCallContent } from './acpUtils.js';

function resultWith(returnDisplay: ToolResult['returnDisplay']): ToolResult {
  return { llmContent: '', returnDisplay };
}

describe('toToolCallContent', () => {
  it('should return text content for string display', () => {
    expect(toToolCallContent(resultWith('Command output'))).toEqual({
      type: 'content',
      content: { type: 'text', text: 'Command output' },
    });
  });

  it('should preserve AnsiOutput as plain text', () => {
    const ansiOutput = [
      [{ text: 'hello ' }, { text: 'world' }],
      [{ text: 'second line' }],
    ] as AnsiOutput;

    expect(toToolCallContent(resultWith(ansiOutput))).toEqual({
      type: 'content',
      content: { type: 'text', text: 'hello world\nsecond line' },
    });
  });

  it('should ignore empty AnsiOutput', () => {
    expect(toToolCallContent(resultWith([] as AnsiOutput))).toBeNull();
  });
});
