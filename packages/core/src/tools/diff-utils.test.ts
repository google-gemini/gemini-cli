/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getDiffContextSnippet } from './diff-utils.js';

describe('getDiffContextSnippet', () => {
  it('should return the whole new content if originalContent is empty', () => {
    const original = '';
    const modified = 'line1\nline2\nline3';
    expect(getDiffContextSnippet(original, modified)).toBe(modified);
  });

  it('should return the whole content if there are no changes', () => {
    const content = 'line1\nline2\nline3';
    expect(getDiffContextSnippet(content, content)).toBe(content);
  });

  it('should show added lines with context', () => {
    const original = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
    const modified = '1\n2\n3\n4\n5\nadded\n6\n7\n8\n9\n10';
    // Default context is 5 lines.
    expect(getDiffContextSnippet(original, modified)).toBe(modified);
  });

  it('should use ellipses for changes far apart', () => {
    const original = Array.from({ length: 20 }, (_, i) => `${i + 1}`).join(
      '\n',
    );
    const modified = original
      .replace('2\n', '2\nadded1\n')
      .replace('19', '19\nadded2');
    const snippet = getDiffContextSnippet(original, modified, 2);

    expect(snippet).toContain('1\n2\nadded1\n3\n4');
    expect(snippet).toContain('...');
    expect(snippet).toContain('18\n19\nadded2\n20');
  });

  it('should respect custom contextLines', () => {
    const original = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
    const modified = '1\n2\n3\n4\n5\nadded\n6\n7\n8\n9\n10';
    const snippet = getDiffContextSnippet(original, modified, 1);

    expect(snippet).toBe('...\n5\nadded\n6\n...');
  });

  it('should handle multiple changes close together by merging ranges', () => {
    const original = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
    const modified = '1\nadded1\n2\nadded2\n3\n4\n5\n6\n7\n8\n9\n10';
    const snippet = getDiffContextSnippet(original, modified, 1);

    expect(snippet).toBe('1\nadded1\n2\nadded2\n3\n...');
  });

  it('should handle removals', () => {
    const original = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
    const modified = '1\n2\n3\n4\n6\n7\n8\n9\n10';
    const snippet = getDiffContextSnippet(original, modified, 1);

    expect(snippet).toBe('...\n4\n6\n...');
  });
});
