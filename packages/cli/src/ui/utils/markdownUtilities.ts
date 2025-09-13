/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/*
**Background & Purpose:**

The `findSafeSplitPoint` function is designed to address the challenge of displaying or processing large, potentially streaming, pieces of Markdown text. When content (e.g., from an LLM like Gemini) arrives in chunks or grows too large for a single display unit (like a message bubble), it needs to be split. A naive split (e.g., just at a character limit) can break Markdown formatting, especially critical for multi-line elements like code blocks, lists, or blockquotes, leading to incorrect rendering.

This function aims to find an *intelligent* or "safe" index within the provided `content` string at which to make such a split, prioritizing the preservation of Markdown integrity.

**Key Expectations & Behavior (Prioritized):**

1.  **No Split if Short Enough:**
    * If `content.length` is less than or equal to `idealMaxLength`, the function should return `content.length` (indicating no split is necessary for length reasons).

2.  **Code Block Integrity (Highest Priority for Safety):**
    * The function must try to avoid splitting *inside* a fenced code block (i.e., between ` ``` ` and ` ``` `).
    * If `idealMaxLength` falls within a code block:
        * The function will attempt to return an index that splits the content *before* the start of that code block.
        * If a code block starts at the very beginning of the `content` and `idealMaxLength` falls within it (meaning the block itself is too long for the first chunk), the function might return `0`. This effectively makes the first chunk empty, pushing the entire oversized code block to the second part of the split.
    * When considering splits near code blocks, the function prefers to keep the entire code block intact in one of the resulting chunks.

3.  **Markdown-Aware Newline Splitting (If Not Governed by Code Block Logic):**
    * If `idealMaxLength` does not fall within a code block (or after code block considerations have been made), the function will look for natural break points by scanning backwards from `idealMaxLength`:
        * **Paragraph Breaks:** It prioritizes splitting after a double newline (`\n\n`), as this typically signifies the end of a paragraph or a block-level element.
        * **Single Line Breaks:** If no double newline is found in a suitable range, it will look for a single newline (`\n`).
    * Any newline chosen as a split point must also not be inside a code block.

4.  **Fall back to `idealMaxLength`:**
    * If no "safer" split point (respecting code blocks or finding suitable newlines) is identified before or at `idealMaxLength`, and `idealMaxLength` itself is not determined to be an unsafe split point (e.g., inside a code block), the function may return a length larger than `idealMaxLength`, again it CANNOT break markdown formatting. This could happen with very long lines of text without Markdown block structures or newlines.

**In essence, `findSafeSplitPoint` tries to be a good Markdown citizen when forced to divide content, preferring structural boundaries over arbitrary character limits, with a strong emphasis on not corrupting code blocks.**
*/

/**
 * Checks if a given character index within a string is inside a fenced (```) code block.
 * @param content The full string content.
 * @param indexToTest The character index to test.
 * @returns True if the index is inside a code block's content, false otherwise.
 */
const isIndexInsideCodeBlock = (
  content: string,
  indexToTest: number,
): boolean => {
  let fenceCount = 0;
  let searchPos = 0;
  while (searchPos < content.length) {
    const nextFence = content.indexOf('```', searchPos);
    if (nextFence === -1 || nextFence >= indexToTest) {
      break;
    }
    fenceCount++;
    searchPos = nextFence + 3;
  }
  return fenceCount % 2 === 1;
};

/**
 * Finds the starting index of the code block that encloses the given index.
 * Returns -1 if the index is not inside a code block.
 * @param content The markdown content.
 * @param index The index to check.
 * @returns Start index of the enclosing code block or -1.
 */
const findEnclosingCodeBlockStart = (
  content: string,
  index: number,
): number => {
  if (!isIndexInsideCodeBlock(content, index)) {
    return -1;
  }
  let currentSearchPos = 0;
  while (currentSearchPos < index) {
    const blockStartIndex = content.indexOf('```', currentSearchPos);
    if (blockStartIndex === -1 || blockStartIndex >= index) {
      break;
    }
    const blockEndIndex = content.indexOf('```', blockStartIndex + 3);
    if (blockStartIndex < index) {
      if (blockEndIndex === -1 || index < blockEndIndex + 3) {
        return blockStartIndex;
      }
    }
    if (blockEndIndex === -1) break;
    currentSearchPos = blockEndIndex + 3;
  }
  return -1;
};

/**
 * Checks if a position is likely within a markdown list structure
 * Enhanced to handle edge cases and unusual spacing
 * LIMITATION: Regex-based detection may have false positives with file paths or timestamps
 * FUTURE: Consider using an AST-based approach for more accurate list detection
 */
const isWithinList = (content: string, index: number): boolean => {
  // Check a more generous range of lines to handle unusual spacing
  const nextContent = content.substring(
    index,
    Math.min(index + 200, content.length),
  );
  const nextLines = nextContent.split('\n').slice(0, 6); // Check more lines

  // Enhanced list patterns including task lists and varied spacing
  const listPattern = /^[\s]*([*\-+]|\d+\.|[a-zA-Z]\.|[ivxlcdm]+\.)\s+/;
  const taskListPattern = /^[\s]*[-*+]\s*\[[ xX]\]\s+/; // Task lists: - [ ] or - [x]

  return nextLines.some(
    (line) => listPattern.test(line) || taskListPattern.test(line),
  );
};

/**
 * Checks if the content before a position ends with a header
 */
const endsWithHeader = (content: string, index: number): boolean => {
  const beforeContent = content
    .substring(Math.max(0, index - 100), index)
    .trim();
  const lines = beforeContent.split('\n');
  const lastLine = lines[lines.length - 1];
  return /^#{1,6}\s+/.test(lastLine);
};

/**
 * Checks if a position would split within a blockquote structure
 */
const isWithinBlockquote = (content: string, index: number): boolean => {
  // Check if we're in the middle of a blockquote
  const nextContent = content.substring(
    index,
    Math.min(index + 150, content.length),
  );
  const nextLines = nextContent.split('\n').slice(0, 4);

  // Check if next lines continue the blockquote pattern
  const blockquotePattern = /^[\s]*>\s*/;
  return nextLines.some((line) => blockquotePattern.test(line));
};

/**
 * Checks if a position would split within a table structure
 * LIMITATION: Uses basic heuristics that may miss complex table formats
 * FUTURE: Consider using a dedicated markdown parser for robust table detection
 */
const isWithinTable = (content: string, index: number): boolean => {
  // Check the lines around the split point for table patterns
  const beforeContent = content.substring(Math.max(0, index - 100), index);
  const afterContent = content.substring(
    index,
    Math.min(index + 100, content.length),
  );

  const beforeLines = beforeContent.split('\n').slice(-2);
  const afterLines = afterContent.split('\n').slice(0, 2);

  const tableRowPattern = /^\s*\|.*\|\s*$/;
  const tableSeparatorPattern = /^\s*\|?\s*(:?-+:?\s*\|?\s*)+\s*$/;

  // Check if we have table-like content before and after
  const hasTableBefore = beforeLines.some(
    (line) => tableRowPattern.test(line) || tableSeparatorPattern.test(line),
  );
  const hasTableAfter = afterLines.some(
    (line) => tableRowPattern.test(line) || tableSeparatorPattern.test(line),
  );

  return hasTableBefore && hasTableAfter;
};

/**
 * Finds the last safe split point in markdown content to preserve structure integrity.
 * LIMITATION: Heuristic-based detection may have edge cases with complex nested structures or false positives.
 * FUTURE: Consider migrating to a dedicated markdown parser (e.g., unified/remark) for AST-based structure detection.
 */
export const findLastSafeSplitPoint = (content: string) => {
  const enclosingBlockStart = findEnclosingCodeBlockStart(
    content,
    content.length,
  );
  if (enclosingBlockStart !== -1) {
    // The end of the content is contained in a code block. Split right before.
    return enclosingBlockStart;
  }

  // Search for the last double newline (\n\n) not in a code block.
  let searchStartIndex = content.length;
  let lastValidSplitPoint = content.length;

  while (searchStartIndex >= 0) {
    const dnlIndex = content.lastIndexOf('\n\n', searchStartIndex);
    if (dnlIndex === -1) {
      // No more double newlines found.
      break;
    }

    const potentialSplitPoint = dnlIndex + 2;
    if (!isIndexInsideCodeBlock(content, potentialSplitPoint)) {
      // Check if this split would break any markdown structure
      const wouldBreakStructure =
        isWithinList(content, potentialSplitPoint) ||
        endsWithHeader(content, dnlIndex) ||
        isWithinBlockquote(content, potentialSplitPoint) ||
        isWithinTable(content, potentialSplitPoint);

      if (!wouldBreakStructure) {
        return potentialSplitPoint;
      }
      // Remember this as a fallback option if we don't find a better split
      lastValidSplitPoint = potentialSplitPoint;
    }

    // If potentialSplitPoint was inside a code block or list,
    // the next search should start *before* the \n\n we just found to ensure progress.
    searchStartIndex = dnlIndex - 1;
  }

  // If we only found splits that would break lists, use the last one as a fallback
  // This is better than not splitting at all for very long content
  return lastValidSplitPoint;
};
