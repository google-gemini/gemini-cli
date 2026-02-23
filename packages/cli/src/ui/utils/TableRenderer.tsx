/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import chalk from 'chalk';
import { styledCharsToString } from '@alcalzone/ansi-tokenize';
import {
  Text,
  Box,
  type StyledChar,
  toStyledCharacters,
  styledCharsWidth,
  wordBreakStyledChars,
  wrapStyledChars,
  widestLineFromStyledChars,
} from 'ink';
import { theme } from '../semantic-colors.js';
import {
  resolveColor,
  INK_SUPPORTED_NAMES,
  INK_NAME_TO_HEX_MAP,
} from '../themes/color-utils.js';

interface TableRendererProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const MIN_COLUMN_WIDTH = 5;
const COLUMN_PADDING = 2;
const TABLE_MARGIN = 2;

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~")
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

/**
 * Helper to apply color to a string using ANSI escape codes,
 * consistent with how Ink's colorize works.
 */
const ansiColorize = (str: string, color: string | undefined): string => {
  if (!color) return str;
  const resolved = resolveColor(color);
  if (!resolved) return str;

  if (resolved.startsWith('#')) {
    return chalk.hex(resolved)(str);
  }

  const mappedHex = INK_NAME_TO_HEX_MAP[resolved];
  if (mappedHex) {
    return chalk.hex(mappedHex)(str);
  }

  if (INK_SUPPORTED_NAMES.has(resolved)) {
    switch (resolved) {
      case 'black':
        return chalk.black(str);
      case 'red':
        return chalk.red(str);
      case 'green':
        return chalk.green(str);
      case 'yellow':
        return chalk.yellow(str);
      case 'blue':
        return chalk.blue(str);
      case 'magenta':
        return chalk.magenta(str);
      case 'cyan':
        return chalk.cyan(str);
      case 'white':
        return chalk.white(str);
      case 'gray':
      case 'grey':
        return chalk.gray(str);
      default:
        return str;
    }
  }

  return str;
};

/**
 * Converts markdown text into a string with ANSI escape codes.
 * This mirrors the parsing logic in InlineMarkdownRenderer.tsx
 */
const parseMarkdownToANSI = (text: string, defaultColor?: string): string => {
  const baseColor = defaultColor ?? theme.text.primary;
  // Early return for plain text without markdown or URLs
  if (!/[*_~`<[https?:]/.test(text)) {
    return ansiColorize(text, baseColor);
  }

  let result = '';
  const inlineRegex =
    // /(\*\*\*.*?\*\*\*|___.*?___|\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
    /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += ansiColorize(text.slice(lastIndex, match.index), baseColor);
    }

    const fullMatch = match[0];
    let styledPart = '';
    if (
      fullMatch.endsWith('***') &&
      fullMatch.startsWith('***') &&
      fullMatch.length > (BOLD_MARKER_LENGTH + ITALIC_MARKER_LENGTH) * 2
    ) {
      styledPart = chalk.bold(
        chalk.italic(parseMarkdownToANSI(fullMatch.slice(3, -3), baseColor)),
      );
    } else if (
      fullMatch.endsWith('**') &&
      fullMatch.startsWith('**') &&
      fullMatch.length > BOLD_MARKER_LENGTH * 2
    ) {
      styledPart = chalk.bold(
        parseMarkdownToANSI(fullMatch.slice(2, -2), baseColor),
      );
    } else if (
      fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
      ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
        (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
      !/\w/.test(text.substring(match.index - 1, match.index)) &&
      !/\w/.test(
        text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 1),
      ) &&
      !/\S[./\\]/.test(text.substring(match.index - 2, match.index)) &&
      !/[./\\]\S/.test(
        text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 2),
      )
    ) {
      styledPart = chalk.italic(
        parseMarkdownToANSI(fullMatch.slice(1, -1), baseColor),
      );
    } else if (
      fullMatch.startsWith('~~') &&
      fullMatch.endsWith('~~') &&
      fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2
    ) {
      styledPart = chalk.strikethrough(
        parseMarkdownToANSI(fullMatch.slice(2, -2), baseColor),
      );
    } else if (
      fullMatch.startsWith('`') &&
      fullMatch.endsWith('`') &&
      fullMatch.length > INLINE_CODE_MARKER_LENGTH
    ) {
      const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
      if (codeMatch && codeMatch[2]) {
        styledPart = ansiColorize(codeMatch[2], theme.text.accent);
      }
    } else if (
      fullMatch.startsWith('[') &&
      fullMatch.includes('](') &&
      fullMatch.endsWith(')')
    ) {
      const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const url = linkMatch[2];
        styledPart =
          parseMarkdownToANSI(linkText, baseColor) +
          ' (' +
          ansiColorize(url, theme.text.link) +
          ')';
      }
    } else if (
      fullMatch.startsWith('<u>') &&
      fullMatch.endsWith('</u>') &&
      fullMatch.length >
        UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1
    ) {
      styledPart = chalk.underline(
        parseMarkdownToANSI(fullMatch.slice(3, -4), baseColor),
      );
    } else if (fullMatch.match(/^https?:\/\//)) {
      styledPart = ansiColorize(fullMatch, theme.text.link);
    }

    result += styledPart || ansiColorize(fullMatch, baseColor);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result += ansiColorize(text.slice(lastIndex), baseColor);
  }

  return result;
};

/**
 * Parses markdown to StyledChar array by first converting to ANSI.
 * This ensures character counts are accurate (markdown markers are removed
 * and styles are applied to the character's internal style object).
 */
const parseMarkdownToStyledChars = (
  text: string,
  defaultColor?: string,
): StyledChar[] => {
  const ansi = parseMarkdownToANSI(text, defaultColor);
  return toStyledCharacters(ansi);
};

const calculateWidths = (styledChars: StyledChar[]) => {
  const contentWidth = styledCharsWidth(styledChars);

  const words: StyledChar[][] = wordBreakStyledChars(styledChars);
  const maxWordWidth = widestLineFromStyledChars(words);

  return { contentWidth, maxWordWidth };
};

// Used to reduce redundant parsing and cache the widths for each line
interface ProcessedLine {
  text: string;
  width: number;
}

/**
 * Custom table renderer for markdown tables
 * We implement our own instead of using ink-table due to module compatibility issues
 */
export const TableRenderer: React.FC<TableRendererProps> = ({
  headers,
  rows,
  terminalWidth,
}) => {
  const styledHeaders = useMemo(
    () =>
      headers.map((header) =>
        parseMarkdownToStyledChars(header, theme.text.link),
      ),
    [headers],
  );

  const styledRows = useMemo(
    () =>
      rows.map((row) =>
        row.map((cell) => parseMarkdownToStyledChars(cell, theme.text.primary)),
      ),
    [rows],
  );

  const { wrappedHeaders, wrappedRows, adjustedWidths } = useMemo(() => {
    const numColumns = styledRows.reduce(
      (max, row) => Math.max(max, row.length),
      styledHeaders.length,
    );

    // --- Define Constraints per Column ---
    const constraints = Array.from({ length: numColumns }).map(
      (_, colIndex) => {
        const headerStyledChars = styledHeaders[colIndex] || [];
        let { contentWidth: maxContentWidth, maxWordWidth } =
          calculateWidths(headerStyledChars);

        styledRows.forEach((row) => {
          const cellStyledChars = row[colIndex] || [];
          const { contentWidth: cellWidth, maxWordWidth: cellWordWidth } =
            calculateWidths(cellStyledChars);

          maxContentWidth = Math.max(maxContentWidth, cellWidth);
          maxWordWidth = Math.max(maxWordWidth, cellWordWidth);
        });

        const minWidth = maxWordWidth;
        const maxWidth = Math.max(minWidth, maxContentWidth);

        return { minWidth, maxWidth };
      },
    );

    // --- Calculate Available Space ---
    // Fixed overhead: borders (n+1) + padding (2n)
    const fixedOverhead = numColumns + 1 + numColumns * COLUMN_PADDING;
    const availableWidth = Math.max(
      0,
      terminalWidth - fixedOverhead - TABLE_MARGIN,
    );

    // --- Allocation Algorithm ---
    const totalMinWidth = constraints.reduce((sum, c) => sum + c.minWidth, 0);
    let finalContentWidths: number[];

    if (totalMinWidth > availableWidth) {
      // We must scale all the columns except the ones that are very short(<=5 characters)
      const shortColumns = constraints.filter(
        (c) => c.maxWidth <= MIN_COLUMN_WIDTH,
      );
      const totalShortColumnWidth = shortColumns.reduce(
        (sum, c) => sum + c.minWidth,
        0,
      );

      const finalTotalShortColumnWidth =
        totalShortColumnWidth >= availableWidth ? 0 : totalShortColumnWidth;

      const scale =
        (availableWidth - finalTotalShortColumnWidth) /
          (totalMinWidth - finalTotalShortColumnWidth) || 0;
      finalContentWidths = constraints.map((c) => {
        if (c.maxWidth <= MIN_COLUMN_WIDTH && finalTotalShortColumnWidth > 0) {
          return c.minWidth;
        }
        return Math.floor(c.minWidth * scale);
      });
    } else {
      const surplus = availableWidth - totalMinWidth;
      const totalGrowthNeed = constraints.reduce(
        (sum, c) => sum + (c.maxWidth - c.minWidth),
        0,
      );

      if (totalGrowthNeed === 0) {
        finalContentWidths = constraints.map((c) => c.minWidth);
      } else {
        finalContentWidths = constraints.map((c) => {
          const growthNeed = c.maxWidth - c.minWidth;
          const share = growthNeed / totalGrowthNeed;
          const extra = Math.floor(surplus * share);
          return Math.min(c.maxWidth, c.minWidth + extra);
        });
      }
    }

    // --- Pre-wrap and Optimize Widths ---
    const actualColumnWidths = new Array(numColumns).fill(0);

    const wrapAndProcessRow = (row: StyledChar[][]) => {
      const rowResult: ProcessedLine[][] = [];
      // Ensure we iterate up to numColumns, filling with empty cells if needed
      for (let colIndex = 0; colIndex < numColumns; colIndex++) {
        const cellStyledChars = row[colIndex] || [];
        const allocatedWidth = finalContentWidths[colIndex];
        const contentWidth = Math.max(1, allocatedWidth);

        const wrappedStyledLines = wrapStyledChars(
          cellStyledChars,
          contentWidth,
        );

        const maxLineWidth = widestLineFromStyledChars(wrappedStyledLines);
        actualColumnWidths[colIndex] = Math.max(
          actualColumnWidths[colIndex],
          maxLineWidth,
        );

        const lines = wrappedStyledLines.map((line) => ({
          text: styledCharsToString(line),
          width: styledCharsWidth(line),
        }));
        rowResult.push(lines);
      }
      return rowResult;
    };

    const wrappedHeaders = wrapAndProcessRow(styledHeaders);
    const wrappedRows = styledRows.map((row) => wrapAndProcessRow(row));

    // Use the TIGHTEST widths that fit the wrapped content + padding
    const adjustedWidths = actualColumnWidths.map((w) => w + COLUMN_PADDING);

    return { wrappedHeaders, wrappedRows, adjustedWidths };
  }, [styledHeaders, styledRows, terminalWidth]);

  // Helper function to render a cell with proper width
  const renderCell = (
    content: ProcessedLine,
    width: number,
    isHeader = false,
  ): React.ReactNode => {
    const contentWidth = Math.max(0, width - COLUMN_PADDING);
    // Use pre-calculated width to avoid re-parsing
    const displayWidth = content.width;
    const paddingNeeded = Math.max(0, contentWidth - displayWidth);

    return (
      <Text>
        {isHeader ? (
          <Text bold color={theme.text.link}>
            {content.text}
          </Text>
        ) : (
          <Text>{content.text}</Text>
        )}
        {' '.repeat(paddingNeeded)}
      </Text>
    );
  };

  // Helper function to render border
  const renderBorder = (type: 'top' | 'middle' | 'bottom'): React.ReactNode => {
    const chars = {
      top: { left: '┌', middle: '┬', right: '┐', horizontal: '─' },
      middle: { left: '├', middle: '┼', right: '┤', horizontal: '─' },
      bottom: { left: '└', middle: '┴', right: '┘', horizontal: '─' },
    };

    const char = chars[type];
    const borderParts = adjustedWidths.map((w) => char.horizontal.repeat(w));
    const border = char.left + borderParts.join(char.middle) + char.right;

    return <Text color={theme.border.default}>{border}</Text>;
  };

  // Helper function to render a single visual line of a row
  const renderVisualRow = (
    cells: ProcessedLine[],
    isHeader = false,
  ): React.ReactNode => {
    const renderedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 0;
      return renderCell(cell, width, isHeader);
    });

    return (
      <Box flexDirection="row">
        <Text color={theme.border.default}>│</Text>
        {renderedCells.map((cell, index) => (
          <React.Fragment key={index}>
            <Box paddingX={1}>{cell}</Box>
            {index < renderedCells.length - 1 && (
              <Text color={theme.border.default}>│</Text>
            )}
          </React.Fragment>
        ))}
        <Text color={theme.border.default}>│</Text>
      </Box>
    );
  };

  // Handles the wrapping logic for a logical data row
  const renderDataRow = (
    wrappedCells: ProcessedLine[][],
    rowIndex?: number,
    isHeader = false,
  ): React.ReactNode => {
    const key = rowIndex === -1 ? 'header' : `${rowIndex}`;
    const maxHeight = Math.max(...wrappedCells.map((lines) => lines.length), 1);

    const visualRows: React.ReactNode[] = [];
    for (let i = 0; i < maxHeight; i++) {
      const visualRowCells = wrappedCells.map(
        (lines) => lines[i] || { text: '', width: 0 },
      );
      visualRows.push(
        <React.Fragment key={`${key}-${i}`}>
          {renderVisualRow(visualRowCells, isHeader)}
        </React.Fragment>,
      );
    }

    return <React.Fragment key={rowIndex}>{visualRows}</React.Fragment>;
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Top border */}
      {renderBorder('top')}

      {/* 
      Header row
      Keep the rowIndex as -1 to differentiate from data rows
      */}
      {renderDataRow(wrappedHeaders, -1, true)}

      {/* Middle border */}
      {renderBorder('middle')}

      {/* Data rows */}
      {wrappedRows.map((row, index) => renderDataRow(row, index))}

      {/* Bottom border */}
      {renderBorder('bottom')}
    </Box>
  );
};
