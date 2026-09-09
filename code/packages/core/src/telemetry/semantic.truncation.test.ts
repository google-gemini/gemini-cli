/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { toInputMessages } from './semantic.js';
import { type Content } from '@google/genai';

// 160KB limit for the total size of string content in a log entry.
const GLOBAL_TEXT_LIMIT = 160 * 1024;
const SUFFIX = '...[TRUNCATED]';

describe('Semantic Telemetry Truncation', () => {
  it('should not truncate a single part if it is within global limit', () => {
    // 150KB part -> Should fit in 160KB limit
    const textLen = 150 * 1024;
    const longText = 'a'.repeat(textLen);
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: longText }],
      },
    ];
    const result = toInputMessages(contents);
    // @ts-expect-error - testing internal state
    expect(result[0].parts[0].content.length).toBe(textLen);
    // @ts-expect-error - testing internal state
    expect(result[0].parts[0].content.endsWith(SUFFIX)).toBe(false);
  });

  it('should truncate a single part if it exceeds global limit', () => {
    // 170KB part -> Should get truncated to ~160KB
    const textLen = 170 * 1024;
    const longText = 'a'.repeat(textLen);
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: longText }],
      },
    ];
    const result = toInputMessages(contents);
    // @ts-expect-error - testing internal state
    const content = result[0].parts[0].content;
    expect(content.length).toBeLessThan(textLen);
    // Because it's the only part, it gets the full budget of 160KB
    expect(content.length).toBe(GLOBAL_TEXT_LIMIT + SUFFIX.length);
    expect(content.endsWith(SUFFIX)).toBe(true);
  });

  it('should fairly distribute budget among multiple large parts', () => {
    // Two 100KB parts (Total 200KB) -> Budget 160KB
    // Each should get roughly 80KB
    const partLen = 100 * 1024;
    const part1 = 'a'.repeat(partLen);
    const part2 = 'b'.repeat(partLen);
    const contents: Content[] = [
      { role: 'user', parts: [{ text: part1 }] },
      { role: 'model', parts: [{ text: part2 }] },
    ];

    const result = toInputMessages(contents);

    // @ts-expect-error - testing internal state
    const c1 = result[0].parts[0].content;
    // @ts-expect-error - testing internal state
    const c2 = result[1].parts[0].content;

    expect(c1.length).toBeLessThan(partLen);
    expect(c2.length).toBeLessThan(partLen);

    // Budget is split evenly
    const expectedLen = Math.floor(GLOBAL_TEXT_LIMIT / 2) + SUFFIX.length;
    expect(c1.length).toBe(expectedLen);
    expect(c2.length).toBe(expectedLen);
  });

  it('should not truncate small parts while truncating large ones', () => {
    // One 200KB part, one 1KB part.
    // 1KB part is small (below average), so it keeps its size.
    // 200KB part gets the remaining budget (128KB - 1KB = 127KB).
    const bigLen = 200 * 1024;
    const smallLen = 1 * 1024;
    const bigText = 'a'.repeat(bigLen);
    const smallText = 'b'.repeat(smallLen);

    const contents: Content[] = [
      { role: 'user', parts: [{ text: bigText }] },
      { role: 'model', parts: [{ text: smallText }] },
    ];

    const result = toInputMessages(contents);
    // @ts-expect-error - testing internal state
    const cBig = result[0].parts[0].content;
    // @ts-expect-error - testing internal state
    const cSmall = result[1].parts[0].content;

    expect(cSmall.length).toBe(smallLen); // Untouched
    expect(cBig.length).toBeLessThan(bigLen);

    const expectedBigLen = GLOBAL_TEXT_LIMIT - smallLen + SUFFIX.length;
    expect(cBig.length).toBe(expectedBigLen);
  });
});
