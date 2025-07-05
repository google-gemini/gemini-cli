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

4.  **Fallback to `idealMaxLength`:**
    * If no "safer" split point (respecting code blocks or finding suitable newlines) is identified before or at `idealMaxLength`, and `idealMaxLength` itself is not determined to be an unsafe split point (e.g., inside a code block), the function may return a length larger than `idealMaxLength`, again it CANNOT break markdown formatting. This could happen with very long lines of text without Markdown block structures or newlines.

**In essence, `findSafeSplitPoint` tries to be a good Markdown citizen when forced to divide content, preferring structural boundaries over arbitrary character limits, with a strong emphasis on not corrupting code blocks.**
*/

/**
 * Represents a parsed code block fence in the Markdown content.
 */
interface Fence {
  startIndex: number;
  endIndex: number; // The index right after the last character of the fence.
  fence: string;
}

/**
 * Represents a full, matched code block with start and end positions.
 */
interface CodeBlock {
  blockStart: number;
  blockEnd: number; // The index right after the closing fence.
}

/**
 * Finds all potential code block fences (3+ backticks or tildes) in the content.
 * This version robustly finds fences anywhere, not just at the start of lines.
 * @param content The markdown content.
 * @returns An array of Fence objects.
 */
const findAllFences = (content: string): Fence[] => {
  const fences: Fence[] = [];
  // Regex to find any sequence of 3+ backticks or tildes, anywhere in the string.
  // The 'g' flag is for a global search to find all occurrences.
  const fenceRegex = /`{3,}|~{3,}/g;
  let match;
  while ((match = fenceRegex.exec(content)) !== null) {
    fences.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      fence: match[0],
    });
  }
  return fences;
};

/**
 * Pairs up opening and closing fences to identify complete code blocks.
 * @param fences A sorted array of fences found in the content.
 * @param content The full content string, used to determine the end boundary for unclosed blocks.
 * @returns An array of CodeBlock objects.
 */
const getCodeBlocks = (fences: Fence[], content: string): CodeBlock[] => {
  const blocks: CodeBlock[] = [];
  const openFences: Fence[] = [];

  for (const currentFence of fences) {
    const lastOpenFence = openFences.length > 0
      ? openFences[openFences.length - 1]
      : null;

    if (
      lastOpenFence &&
      currentFence.fence.length === lastOpenFence.fence.length &&
      currentFence.fence[0] === lastOpenFence.fence[0]
    ) {
      // This is a valid closing fence. Pop the stack and create the block.
      const openingFence = openFences.pop()!;
      blocks.push({
        blockStart: openingFence.startIndex,
        blockEnd: currentFence.endIndex,
      });
    } else {
      // This is a new opening fence.
      openFences.push(currentFence);
    }
  }

  // After processing all fences, any remaining fences indicate an unclosed structure.
  if (openFences.length > 0) {
    // The true boundary is the start of the OUTERMOST
    // unclosed fence, which is the FIRST element remaining in the stack.
    const outermostUnclosedFence = openFences[0];
    blocks.push({
      blockStart: outermostUnclosedFence.startIndex,
      // The block extends to the very end of the content.
      blockEnd: content.length,
    });
  }

  return blocks;
};

// This now correctly passes the `content` string into the fixed getCodeBlocks.
const memoizedGetCodeBlocks = (function () {
  let lastContent: string;
  let lastResult: CodeBlock[];

  return function (content: string): CodeBlock[] {
    if (lastContent === content) {
      return lastResult;
    }
    const fences = findAllFences(content);
    const result = getCodeBlocks(fences, content);
    lastContent = content;
    lastResult = result;
    return result;
  };
})();

/**
 * Checks if a given character index within a string is inside a fenced code block.
 * This version correctly handles dynamic fence lengths.
 * @param content The full string content.
 * @param indexToTest The character index to test.
 * @returns True if the index is inside a code block's content, false otherwise.
 */
const isIndexInsideCodeBlock = (
  content: string,
  indexToTest: number,
): boolean => {
  const blocks = memoizedGetCodeBlocks(content);
  for (const block of blocks) {
    if (indexToTest > block.blockStart && indexToTest < block.blockEnd) {
      return true;
    }
  }
  return false;
};

/**
 * Finds the starting index of the code block that encloses the given index.
 * Returns -1 if the index is not inside a code block.
 * This version correctly handles dynamic fence lengths.
 * @param content The markdown content.
 * @param index The index to check.
 * @returns Start index of the enclosing code block or -1.
 */
const findEnclosingCodeBlockStart = (
  content: string,
  index: number,
): number => {
  const blocks = memoizedGetCodeBlocks(content);
  for (const block of blocks) {
    // Check if the index is within the bounds of this block
    if (index >= block.blockStart && index <= block.blockEnd) {
      return block.blockStart;
    }
  }
  return -1;
};

/**
 * Finds the last "safe" point to split markdown content, prioritizing paragraph
 * breaks while respecting code block boundaries.
 * @param content The markdown content string.
 * @returns The character index of the last safe split point.
 */
export const findLastSafeSplitPoint = (content: string): number => {
  const enclosingBlockStart = findEnclosingCodeBlockStart(
    content,
    content.length,
  );

  if (enclosingBlockStart !== -1) {
    // An enclosing block was found at the end of the content.

    // Check if this block constitutes the *entire* string. If the block
    // starts at index 0, then the whole content is one unbreakable unit.
    // In this case, we should not split it at all.
    if (enclosingBlockStart === 0) {
      return content.length;
    }

    // Otherwise, the content ends with a code block but doesn't start with it.
    // The only safe split is right before this final block begins.
    return enclosingBlockStart;
  }

  // Search for the last double newline (\n\n) not in a code block.
  let searchStartIndex = content.length;
  while (searchStartIndex > 0) {
    const dnlIndex = content.lastIndexOf('\n\n', searchStartIndex);
    if (dnlIndex === -1) {
      // No more double newlines found.
      break;
    }

    const potentialSplitPoint = dnlIndex + 2;
    if (!isIndexInsideCodeBlock(content, potentialSplitPoint)) {
      return potentialSplitPoint;
    }

    // If potentialSplitPoint was inside a code block,
    // the next search should start *before* the \n\n we just found to ensure progress.
    searchStartIndex = dnlIndex - 1;
  }

  // If no safe double newline is found, return content.length
  // to keep the entire content as one piece.
  return content.length;
};
