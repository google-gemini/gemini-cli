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

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Node } from 'unist';

/**
 * Checks if a given character index within a string is inside a fenced code block.
 * Uses AST parsing to properly detect code blocks including those in lists with indentation.
 * @param content The full string content.
 * @param indexToTest The character index to test.
 * @returns True if the index is inside a code block's content, false otherwise.
 */
const isIndexInsideCodeBlock = (
  content: string,
  indexToTest: number,
): boolean => {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(content);

    // Walk the AST to find all code blocks and their positions
    const codeBlocks: Array<{ start: number; end: number }> = [];

    const walk = (node: Node) => {
      if (
        node.type === 'code' &&
        node.position &&
        node.position.start.offset !== undefined &&
        node.position.end.offset !== undefined
      ) {
        // Code node positions are in the AST
        codeBlocks.push({
          start: node.position.start.offset,
          end: node.position.end.offset,
        });
      }
      if ('children' in node && Array.isArray(node.children)) {
        (node.children as Node[]).forEach(walk);
      }
    };

    walk(tree);

    // Check if indexToTest falls within any code block
    return codeBlocks.some(
      (block) => indexToTest >= block.start && indexToTest < block.end,
    );
  } catch (error) {
    // Avoid falling back to a known buggy regex implementation.
    // It's safer to assume it's not a code block if parsing fails.
    console.error('Failed to parse markdown for code block detection:', error);
    return false;
  }
};

/**
 * Finds the starting index of the code block that encloses the given index.
 * Returns -1 if the index is not inside a code block.
 * Uses AST parsing to properly detect code blocks.
 * @param content The markdown content.
 * @param index The index to check.
 * @returns Start index of the enclosing code block or -1.
 */
const findEnclosingCodeBlockStart = (
  content: string,
  index: number,
): number => {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(content);

    // Walk the AST to find the code block containing the index
    let enclosingStart = -1;

    const walk = (node: Node) => {
      if (
        node.type === 'code' &&
        node.position &&
        node.position.start.offset !== undefined &&
        node.position.end.offset !== undefined
      ) {
        const start = node.position.start.offset;
        const end = node.position.end.offset;
        if (index >= start && index < end) {
          enclosingStart = start;
          return; // Found it, stop searching
        }
      }
      if ('children' in node && Array.isArray(node.children)) {
        (node.children as Node[]).forEach(walk);
      }
    };

    walk(tree);
    return enclosingStart;
  } catch (error) {
    // If parsing fails, we cannot reliably find the block.
    console.error('Failed to parse markdown for code block detection:', error);
    return -1;
  }
};

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
  while (searchStartIndex >= 0) {
    const dnlIndex = content.lastIndexOf('\n\n', searchStartIndex);
    if (dnlIndex === -1) {
      // No more double newlines found.
      break;
    }

    const potentialSplitPoint = dnlIndex;
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
