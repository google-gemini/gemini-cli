/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';

/**
 * Generates a snippet of the diff between two strings, including a few lines of context around the changes.
 */
export function getDiffContextSnippet(
  originalContent: string,
  newContent: string,
  contextLines = 5,
): string {
  if (!originalContent) {
    return newContent;
  }

  const changes = Diff.diffLines(originalContent, newContent);
  const newLines = newContent.split(/\r?\n/);
  const ranges: Array<{ start: number; end: number }> = [];
  let newLineIdx = 0;

  for (const change of changes) {
    if (change.added) {
      ranges.push({ start: newLineIdx, end: newLineIdx + (change.count ?? 0) });
      newLineIdx += change.count ?? 0;
    } else if (change.removed) {
      ranges.push({ start: newLineIdx, end: newLineIdx });
    } else {
      newLineIdx += change.count ?? 0;
    }
  }

  if (ranges.length === 0) {
    return newContent;
  }

  const expandedRanges = ranges.map((r) => ({
    start: Math.max(0, r.start - contextLines),
    end: Math.min(newLines.length, r.end + contextLines),
  }));
  expandedRanges.sort((a, b) => a.start - b.start);
  const mergedRanges: Array<{ start: number; end: number }> = [];

  if (expandedRanges.length > 0) {
    let current = expandedRanges[0];
    for (let i = 1; i < expandedRanges.length; i++) {
      const next = expandedRanges[i];
      if (next.start <= current.end) {
        current.end = Math.max(current.end, next.end);
      } else {
        mergedRanges.push(current);
        current = next;
      }
    }
    mergedRanges.push(current);
  }

  const outputParts: string[] = [];
  let lastEnd = 0;

  for (const range of mergedRanges) {
    if (range.start > lastEnd) outputParts.push('...');
    outputParts.push(newLines.slice(range.start, range.end).join('\n'));
    lastEnd = range.end;
  }

  if (lastEnd < newLines.length) {
    outputParts.push('...');
  }
  return outputParts.join('\n');
}
