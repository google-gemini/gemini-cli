/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import crypto from 'crypto';

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'other';
  oldLine?: number;
  newLine?: number;
  content: string;
}

function parseDiffWithLineNumbers(diffContent: string): DiffLine[] {
  const lines = diffContent.split('\n');
  const result: DiffLine[] = [];
  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;
  const hunkHeaderRegex = /^@@ -(\d+),?\d* \+(\d+),?\d* @@/;

  for (const line of lines) {
    const hunkMatch = line.match(hunkHeaderRegex);
    if (hunkMatch) {
      currentOldLine = parseInt(hunkMatch[1], 10);
      currentNewLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      result.push({ type: 'hunk', content: line });
      // We need to adjust the starting point because the first line number applies to the *first* actual line change/context,
      // but we increment *before* pushing that line. So decrement here.
      currentOldLine--;
      currentNewLine--;
      continue;
    }
    if (!inHunk) {
      // Skip standard Git header lines more robustly
      if (
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('similarity index') ||
        line.startsWith('rename from') ||
        line.startsWith('rename to') ||
        line.startsWith('new file mode') ||
        line.startsWith('deleted file mode')
      )
        continue;
      // If it's not a hunk or header, skip (or handle as 'other' if needed)
      continue;
    }
    if (line.startsWith('+')) {
      currentNewLine++; // Increment before pushing
      result.push({
        type: 'add',
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('-')) {
      currentOldLine++; // Increment before pushing
      result.push({
        type: 'del',
        oldLine: currentOldLine,
        content: line.substring(1),
      });
    } else if (line.startsWith(' ')) {
      currentOldLine++; // Increment before pushing
      currentNewLine++;
      result.push({
        type: 'context',
        oldLine: currentOldLine,
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('\\')) {
      // Handle "\ No newline at end of file"
      result.push({ type: 'other', content: line });
    }
  }
  return result;
}

interface DiffRendererProps {
  diffContent: string;
  filename?: string;
  tabWidth?: number;
}

const DEFAULT_TAB_WIDTH = 4; // Spaces per tab for normalization

export const DiffRenderer: React.FC<DiffRendererProps> = ({
  diffContent,
  filename,
  tabWidth = DEFAULT_TAB_WIDTH,
}) => {
  if (!diffContent || typeof diffContent !== 'string') {
    return <Text color={Colors.AccentYellow}>No diff content.</Text>;
  }

  const parsedLines = parseDiffWithLineNumbers(diffContent);

  // 1. Normalize whitespace (replace tabs with spaces) *before* further processing
  const normalizedLines = parsedLines.map((line) => ({
    ...line,
    content: line.content.replace(/\t/g, ' '.repeat(tabWidth)),
  }));

  // Filter out non-displayable lines (hunks, potentially 'other') using the normalized list
  const displayableLines = normalizedLines.filter(
    (l) => l.type !== 'hunk' && l.type !== 'other',
  );

  if (displayableLines.length === 0) {
    return (
      <Box borderStyle="round" borderColor={Colors.SubtleComment} padding={1}>
        <Text dimColor>No changes detected.</Text>
      </Box>
    );
  }

  // Calculate the minimum indentation across all displayable lines
  let baseIndentation = Infinity; // Start high to find the minimum
  for (const line of displayableLines) {
    // Only consider lines with actual content for indentation calculation
    if (line.content.trim() === '') continue;

    const firstCharIndex = line.content.search(/\S/); // Find index of first non-whitespace char
    const currentIndent = firstCharIndex === -1 ? 0 : firstCharIndex; // Indent is 0 if no non-whitespace found
    baseIndentation = Math.min(baseIndentation, currentIndent);
  }
  // If baseIndentation remained Infinity (e.g., no displayable lines with content), default to 0
  if (!isFinite(baseIndentation)) {
    baseIndentation = 0;
  }
  // --- End Modification ---

  const key = filename
    ? `diff-box-${filename}`
    : `diff-box-${crypto.createHash('sha1').update(diffContent).digest('hex')}`;
  return (
    <Box flexDirection="column" key={key}>
      {/* Iterate over the lines that should be displayed (already normalized) */}
      {displayableLines.map((line, index) => {
        const key = `diff-line-${index}`;
        let gutterNumStr = '';
        let color: string | undefined = undefined;
        let prefixSymbol = ' ';
        let dim = false;

        switch (line.type) {
          case 'add':
            gutterNumStr = (line.newLine ?? '').toString();
            color = 'green';
            prefixSymbol = '+';
            break;
          case 'del':
            gutterNumStr = (line.oldLine ?? '').toString();
            color = 'red';
            prefixSymbol = '-';
            break;
          case 'context':
            // Show new line number for context lines in gutter
            gutterNumStr = (line.newLine ?? '').toString();
            dim = true;
            prefixSymbol = ' ';
            break;
          default:
            throw new Error(`Unknown line type: ${line.type}`);
        }

        // Render the line content *after* stripping the calculated *minimum* baseIndentation.
        // The line.content here is already the tab-normalized version.
        const displayContent = line.content.substring(baseIndentation);

        return (
          // Using your original rendering structure
          <Box key={key} flexDirection="row">
            <Text color={Colors.Foreground}>{gutterNumStr} </Text>
            <Text color={color} dimColor={dim}>
              {prefixSymbol}{' '}
            </Text>
            <Text color={color} dimColor={dim} wrap="wrap">
              {displayContent}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
