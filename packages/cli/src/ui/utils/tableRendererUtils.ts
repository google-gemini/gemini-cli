/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlainTextLength } from './InlineMarkdownRenderer.js';

export const MAX_LINES_IN_A_ROW = 10;

export function extractPrefixByDisplayWidth(
  content: string,
  displayWidth: number,
) {
  let left = 0;
  let right = content.length;
  let bestTruncated = '';

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = content.substring(0, mid);
    const candidateWidth = getPlainTextLength(candidate);

    if (candidateWidth <= displayWidth) {
      bestTruncated = candidate;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return {
    prefix: bestTruncated,
    remainingPart: content.slice(bestTruncated.length, content.length),
  };
}

export function splitContentIntoEqualWidthLines(
  content: string,
  displayWidth: number,
  totalLines: number,
) {
  const contentWidth = Math.max(0, displayWidth); // padding
  function appendEmptySpaces(str: string, width: number) {
    return str + ' '.repeat(width - getPlainTextLength(str));
  }

  const lines = [];
  for (let i = 0; i < totalLines; i++) {
    const isLastLine = i === totalLines - 1;
    if (!content.length || contentWidth < 1) {
      lines.push(appendEmptySpaces('', contentWidth));
      continue;
    }
    const contentWillOverflow =
      isLastLine && getPlainTextLength(content) > contentWidth;
    const hasSpaceForDots = contentWidth > 3;
    const { prefix, remainingPart } = extractPrefixByDisplayWidth(
      content,
      contentWillOverflow && hasSpaceForDots ? contentWidth - 3 : contentWidth,
    );
    if (contentWillOverflow) {
      lines.push(hasSpaceForDots ? prefix + '...' : prefix);
    } else {
      lines.push(appendEmptySpaces(prefix, contentWidth));
    }
    content = remainingPart;
  }
  return lines;
}
