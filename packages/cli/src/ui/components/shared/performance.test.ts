/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../../test-utils/render.js';
import { useTextBuffer } from './text-buffer.js';
import { parseInputForHighlighting } from '../../utils/highlight.js';

describe('text-buffer performance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle pasting large amounts of text efficiently', () => {
    const viewport = { width: 80, height: 24 };
    const { result } = renderHook(() =>
      useTextBuffer({
        viewport,
      }),
    );

    const lines = 5000;
    const largeText = Array.from(
      { length: lines },
      (_, i) =>
        `Line ${i}: some sample text with many @path/to/image${i}.png and maybe some more @path/to/another/image.png references to trigger regex. This line is much longer than the previous one to test wrapping.`,
    ).join('\n');

    const start = Date.now();
    act(() => {
      result.current.insert(largeText, { paste: true });
    });
    const end = Date.now();

    const duration = end - start;
    expect(duration).toBeLessThan(5000);
  });

  it('should handle character-by-character insertion in a large buffer efficiently', () => {
    const lines = 5000;
    const initialText = Array.from(
      { length: lines },
      (_, i) => `Line ${i}: some sample text with @path/to/image.png`,
    ).join('\n');
    const viewport = { width: 80, height: 24 };

    const { result } = renderHook(() =>
      useTextBuffer({
        initialText,
        viewport,
      }),
    );

    const start = Date.now();
    const charsToInsert = 100;
    for (let i = 0; i < charsToInsert; i++) {
      act(() => {
        result.current.insert('a');
      });
    }
    const end = Date.now();

    const duration = end - start;
    expect(duration).toBeLessThan(5000);
  });

  it('should highlight many lines efficiently', () => {
    const lines = 5000;
    const sampleLines = Array.from(
      { length: lines },
      (_, i) =>
        `Line ${i}: some sample text with @path/to/image${i}.png /command and more @file.txt`,
    );

    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      // Simulate 100 renders
      for (const line of sampleLines.slice(0, 20)) {
        // 20 visible lines
        parseInputForHighlighting(line, 1, []);
      }
    }
    const end = Date.now();

    const duration = end - start;
    expect(duration).toBeLessThan(500);
  });
});
