/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file markdownParser.ts
 * @brief A lightweight markdown parser for GEMINI.md import processing.
 */

export interface AstNode {
  type: 'text' | 'code_block' | 'code_span';
  content: string;
}

/**
 * @brief Parses a markdown string into a simple Abstract Syntax Tree (AST).
 * @param content The markdown content to parse.
 * @returns An array of AstNode objects.
 */
export function parseMarkdown(content: string): AstNode[] {
  const ast: AstNode[] = [];
  let currentIndex = 0;

  while (currentIndex < content.length) {
    const remainingContent = content.slice(currentIndex);

    // Match fenced code blocks (including language identifiers)
    const codeBlockMatch = remainingContent.match(
      /^```[^\n]*\n[\s\S]*?\n?```/,
    );
    if (codeBlockMatch) {
      ast.push({ type: 'code_block', content: codeBlockMatch[0] });
      currentIndex += codeBlockMatch[0].length;
      continue;
    }

    // Match inline code spans
    const codeSpanMatch = remainingContent.match(/^`[^`]*`/);
    if (codeSpanMatch) {
      ast.push({ type: 'code_span', content: codeSpanMatch[0] });
      currentIndex += codeSpanMatch[0].length;
      continue;
    }

    // Find the next occurrence of a code delimiter
    const nextCodeMatch = remainingContent.match(/`{1,3}/);
    const textEndIndex = nextCodeMatch
      ? currentIndex + nextCodeMatch.index!
      : content.length;

    if (textEndIndex > currentIndex) {
      ast.push({
        type: 'text',
        content: content.slice(currentIndex, textEndIndex),
      });
    }
    currentIndex = textEndIndex;
  }

  return ast;
}
