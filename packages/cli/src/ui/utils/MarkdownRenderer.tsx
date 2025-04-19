/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';

/**
 * A utility class to render a subset of Markdown into Ink components.
 * Handles H1-H4, Lists (ul/ol, no nesting), Code Blocks,
 * and inline styles (bold, italic, strikethrough, code, links).
 */
export class MarkdownRenderer {
  /**
   * Renders INLINE markdown elements using an iterative approach.
   * Supports: **bold**, *italic*, _italic_, ~~strike~~, [link](url), `code`, ``code``, <u>underline</u>
   * @param text The string segment to parse for inline styles.
   * @returns An array of React nodes (Text components or strings).
   */
  private static _renderInline(text: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    // UPDATED Regex: Added <u>.*?<\/u> pattern
    const inlineRegex =
      /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>)/g;
    let match;

    while ((match = inlineRegex.exec(text)) !== null) {
      // 1. Add plain text before the match
      if (match.index > lastIndex) {
        nodes.push(
          <Text key={`t-${lastIndex}`}>
            {text.slice(lastIndex, match.index)}
          </Text>,
        );
      }

      const fullMatch = match[0];
      let renderedNode: React.ReactNode = null;
      const key = `m-${match.index}`; // Base key for matched part

      // 2. Determine type of match and render accordingly
      try {
        if (
          fullMatch.startsWith('**') &&
          fullMatch.endsWith('**') &&
          fullMatch.length > 4
        ) {
          renderedNode = (
            <Text key={key} bold>
              {fullMatch.slice(2, -2)}
            </Text>
          );
        } else if (
          ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
            (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
          fullMatch.length > 2
        ) {
          renderedNode = (
            <Text key={key} italic>
              {fullMatch.slice(1, -1)}
            </Text>
          );
        } else if (
          fullMatch.startsWith('~~') &&
          fullMatch.endsWith('~~') &&
          fullMatch.length > 4
        ) {
          // Strikethrough as gray text
          renderedNode = (
            <Text key={key} strikethrough>
              {fullMatch.slice(2, -2)}
            </Text>
          );
        } else if (
          fullMatch.startsWith('`') &&
          fullMatch.endsWith('`') &&
          fullMatch.length > 1
        ) {
          // Code: Try to match varying numbers of backticks
          const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
          if (codeMatch && codeMatch[2]) {
            renderedNode = (
              <Text key={key} color={Colors.AccentPurple}>
                {codeMatch[2]}
              </Text>
            );
          } else {
            // Fallback for simple or non-matching cases
            renderedNode = (
              <Text key={key} color={Colors.AccentPurple}>
                {fullMatch.slice(1, -1)}
              </Text>
            );
          }
        } else if (
          fullMatch.startsWith('[') &&
          fullMatch.includes('](') &&
          fullMatch.endsWith(')')
        ) {
          // Link: Extract text and URL
          const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
          if (linkMatch) {
            const linkText = linkMatch[1];
            const url = linkMatch[2];
            // Render link text then URL slightly dimmed/colored
            renderedNode = (
              <Text key={key}>
                {linkText}
                <Text color={Colors.AccentBlue}> ({url})</Text>
              </Text>
            );
          }
        } else if (
          fullMatch.startsWith('<u>') &&
          fullMatch.endsWith('</u>') &&
          fullMatch.length > 6
        ) {
          // ***** NEW: Handle underline tag *****
          // Use slice(3, -4) to remove <u> and </u>
          renderedNode = (
            <Text key={key} underline>
              {fullMatch.slice(3, -4)}
            </Text>
          );
        }
      } catch (e) {
        // In case of regex or slicing errors, fallback to literal rendering
        console.error('Error parsing inline markdown part:', fullMatch, e);
        renderedNode = null; // Ensure fallback below is used
      }

      // 3. Add the rendered node or the literal text if parsing failed
      nodes.push(renderedNode ?? <Text key={key}>{fullMatch}</Text>);
      lastIndex = inlineRegex.lastIndex; // Move index past the current match
    }

    // 4. Add any remaining plain text after the last match
    if (lastIndex < text.length) {
      nodes.push(<Text key={`t-${lastIndex}`}>{text.slice(lastIndex)}</Text>);
    }

    // Filter out potential nulls if any error occurred without fallback
    return nodes.filter((node) => node !== null);
  }

  /**
   * Helper to render a code block.
   */
  private static _renderCodeBlock(
    key: string,
    content: string[],
    lang: string | null,
  ): React.ReactNode {
    // Basic styling for code block
    return (
      <Box
        key={key}
        borderStyle="round"
        paddingX={1}
        borderColor={Colors.SubtleComment}
        flexDirection="column"
      >
        {lang && <Text dimColor> {lang}</Text>}
        {/* Render each line preserving whitespace (within Text component) */}
        {content.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
      </Box>
    );
  }

  /**
   * Helper to render a list item (ordered or unordered).
   */
  private static _renderListItem(
    key: string,
    text: string,
    type: 'ul' | 'ol',
    marker: string,
  ): React.ReactNode {
    const renderedText = MarkdownRenderer._renderInline(text); // Allow inline styles in list items
    const prefix = type === 'ol' ? `${marker} ` : `${marker} `; // e.g., "1. " or "* "
    const prefixWidth = prefix.length;

    return (
      <Box key={key} paddingLeft={1} flexDirection="row">
        <Box width={prefixWidth}>
          <Text>{prefix}</Text>
        </Box>
        <Box flexGrow={1}>
          <Text wrap="wrap">{renderedText}</Text>
        </Box>
      </Box>
    );
  }

  /**
   * Renders a full markdown string, handling block elements (headers, lists, code blocks)
   * and applying inline styles. This is the main public static method.
   * @param text The full markdown string to render.
   * @returns An array of React nodes representing markdown blocks.
   */
  static render(text: string): React.ReactNode[] {
    if (!text) return [];

    const lines = text.split('\n');
    // Regexes for block elements
    const headerRegex = /^ *(#{1,4}) +(.*)/;
    const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\S*?) *$/; // ```lang or ``` or ~~~
    const ulItemRegex = /^ *([-*+]) +(.*)/; // Unordered list item, captures bullet and text
    const olItemRegex = /^ *(\d+)\. +(.*)/; // Ordered list item, captures number and text
    const hrRegex = /^ *([-*_] *){3,} *$/; // Horizontal rule

    const contentBlocks: React.ReactNode[] = [];
    // State for parsing across lines
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLang: string | null = null;
    let codeBlockFence = ''; // Store the type of fence used (``` or ~~~)

    lines.forEach((line, index) => {
      const key = `line-${index}`;

      // --- State 1: Inside a Code Block ---
      if (inCodeBlock) {
        const fenceMatch = line.match(codeFenceRegex);
        // Check for closing fence, matching the opening one and length
        if (
          fenceMatch &&
          fenceMatch[1].startsWith(codeBlockFence[0]) &&
          fenceMatch[1].length >= codeBlockFence.length
        ) {
          // End of code block - render it
          contentBlocks.push(
            MarkdownRenderer._renderCodeBlock(
              key,
              codeBlockContent,
              codeBlockLang,
            ),
          );
          // Reset state
          inCodeBlock = false;
          codeBlockContent = [];
          codeBlockLang = null;
          codeBlockFence = '';
        } else {
          // Add line to current code block content
          codeBlockContent.push(line);
        }
        return; // Process next line
      }

      // --- State 2: Not Inside a Code Block ---
      // Check for block element starts in rough order of precedence/commonness
      const codeFenceMatch = line.match(codeFenceRegex);
      const headerMatch = line.match(headerRegex);
      const ulMatch = line.match(ulItemRegex);
      const olMatch = line.match(olItemRegex);
      const hrMatch = line.match(hrRegex);

      if (codeFenceMatch) {
        inCodeBlock = true;
        codeBlockFence = codeFenceMatch[1];
        codeBlockLang = codeFenceMatch[2] || null;
      } else if (hrMatch) {
        // Render Horizontal Rule (simple dashed line)
        // Use box with height and border character, or just Text with dashes
        contentBlocks.push(
          <Box key={key}>
            <Text dimColor>---</Text>
          </Box>,
        );
      } else if (headerMatch) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2];
        const renderedHeaderText = MarkdownRenderer._renderInline(headerText);
        let headerNode: React.ReactNode = null;
        switch (level /* ... (header styling as before) ... */) {
          case 1:
            headerNode = (
              <Text bold color={Colors.AccentCyan}>
                {renderedHeaderText}
              </Text>
            );
            break;
          case 2:
            headerNode = (
              <Text bold color={Colors.AccentBlue}>
                {renderedHeaderText}
              </Text>
            );
            break;
          case 3:
            headerNode = <Text bold>{renderedHeaderText}</Text>;
            break;
          case 4:
            headerNode = (
              <Text italic color={Colors.SubtleComment}>
                {renderedHeaderText}
              </Text>
            );
            break;
          default:
            headerNode = <Text>{renderedHeaderText}</Text>;
            break;
        }
        if (headerNode) contentBlocks.push(<Box key={key}>{headerNode}</Box>);
      } else if (ulMatch) {
        const marker = ulMatch[1]; // *, -, or +
        const itemText = ulMatch[2];
        // If previous line was not UL, maybe add spacing? For now, just render item.
        contentBlocks.push(
          MarkdownRenderer._renderListItem(key, itemText, 'ul', marker),
        );
      } else if (olMatch) {
        const marker = olMatch[1]; // The number
        const itemText = olMatch[2];
        contentBlocks.push(
          MarkdownRenderer._renderListItem(key, itemText, 'ol', marker),
        );
      } else {
        // --- Regular line (Paragraph or Empty line) ---
        // Render line content if it's not blank, applying inline styles
        const renderedLine = MarkdownRenderer._renderInline(line);
        if (renderedLine.length > 0 || line.length > 0) {
          // Render lines with content or only whitespace
          contentBlocks.push(
            <Box key={key}>
              <Text wrap="wrap">{renderedLine}</Text>
            </Box>,
          );
        } else if (line.trim().length === 0) {
          // Handle specifically empty lines
          // Add minimal space for blank lines between paragraphs/blocks
          if (contentBlocks.length > 0 && !inCodeBlock) {
            // Avoid adding multiple blank lines consecutively easily - check if previous was also blank?
            // For now, add a minimal spacer for any blank line outside code blocks.
            contentBlocks.push(<Box key={key} height={1} />);
          }
        }
      }
    });

    // Handle unclosed code block at the end of the input
    if (inCodeBlock) {
      contentBlocks.push(
        MarkdownRenderer._renderCodeBlock(
          `line-eof`,
          codeBlockContent,
          codeBlockLang,
        ),
      );
    }

    return contentBlocks;
  }
}
