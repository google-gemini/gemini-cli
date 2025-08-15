/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Paste Safety Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should calculate paste safety delay correctly', () => {
    const now = Date.now();
    const recentPasteTime = now - 100; // 100ms ago
    const timeSinceLastPaste = now - recentPasteTime;
    const hasMultipleLines = true;
    const shouldDelay = hasMultipleLines && timeSinceLastPaste < 2000;

    expect(shouldDelay).toBe(true);
  });

  it('should not delay for single-line content', () => {
    const now = Date.now();
    const recentPasteTime = now - 100; // 100ms ago
    const timeSinceLastPaste = now - recentPasteTime;
    const hasMultipleLines = false;
    const shouldDelay = hasMultipleLines && timeSinceLastPaste < 2000;

    expect(shouldDelay).toBe(false);
  });

  it('should not delay for old paste operations', () => {
    const now = Date.now();
    const oldPasteTime = now - 3000; // 3 seconds ago
    const timeSinceLastPaste = now - oldPasteTime;
    const hasMultipleLines = true;
    const shouldDelay = hasMultipleLines && timeSinceLastPaste < 2000;

    expect(shouldDelay).toBe(false);
  });

  it('should detect fast input as potential paste', () => {
    const fastInput = 'function test() {\n  console.log("hello");\n}';
    const isSubstantial = fastInput.length > 10;
    const hasNewlines = fastInput.includes('\n');
    const wouldDetectAsPaste = isSubstantial && hasNewlines;

    expect(wouldDetectAsPaste).toBe(true);
  });

  it('should not detect short input as paste', () => {
    const shortInput = 'test';
    const isSubstantial = shortInput.length > 10;
    const hasNewlines = shortInput.includes('\n');
    const wouldDetectAsPaste = isSubstantial && hasNewlines;

    expect(wouldDetectAsPaste).toBe(false);
  });

  it('should clean control characters correctly', () => {
    const dirtyText = 'hello\u0008world\u001Ftest\u007F';
    const cleanedText = dirtyText.replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
      '',
    );

    expect(cleanedText).toBe('helloworldtest');
  });

  it('should parse bracketed paste sequences', () => {
    const PASTE_PREFIX = '\u001B[200~';
    const PASTE_SUFFIX = '\u001B[201~';
    const testData = PASTE_PREFIX + 'test content' + PASTE_SUFFIX;
    const prefixPos = testData.indexOf(PASTE_PREFIX);
    const suffixPos = testData.indexOf(PASTE_SUFFIX);

    expect(prefixPos).toBe(0);
    expect(suffixPos).toBeGreaterThan(prefixPos);

    const extractedContent = testData.slice(
      prefixPos + PASTE_PREFIX.length,
      suffixPos,
    );
    expect(extractedContent).toBe('test content');
  });

  it('should handle failed paste detection timing', () => {
    const recentPasteTime = Date.now() - 200; // 200ms ago
    const currentTime = Date.now();
    const timeSinceLastPaste = currentTime - recentPasteTime;
    const hasMultipleLines = true;
    const isWithinFailedPasteWindow = timeSinceLastPaste < 500;

    const shouldAddNewlineInsteadOfSubmit =
      hasMultipleLines && isWithinFailedPasteWindow;

    expect(shouldAddNewlineInsteadOfSubmit).toBe(true);
  });

  it('should normalize newlines in paste content', () => {
    const pasteContent = 'line1\nline2\r\nline3\r';
    const normalizedContent = pasteContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const expectedLines = ['line1', 'line2', 'line3', ''];
    const actualLines = normalizedContent.split('\n');

    expect(actualLines).toEqual(expectedLines);
  });

  it('should handle timeout cleanup properly', () => {
    const mockTimeout = vi.fn();
    const timeoutId = setTimeout(mockTimeout, 1000);

    // Simulate cleanup
    clearTimeout(timeoutId);
    vi.advanceTimersByTime(1500);

    expect(mockTimeout).not.toHaveBeenCalled();
  });
});
