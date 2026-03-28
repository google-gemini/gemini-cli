/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
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
import { parseMarkdownToANSI } from './markdownParsingUtils.js';
import { stripUnsafeCharacters } from './textUtils.js';

interface TableRendererProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const COLUMN_PADDING = 2;
const TABLE_MARGIN = 2;

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
        parseMarkdownToStyledChars(
          stripUnsafeCharacters(header),
          theme.text.link,
        ),
      ),
    [headers],
  );

  const styledRows = useMemo(
    () =>
      rows.map((row) =>
        row.map((cell) =>
          parseMarkdownToStyledChars(
            stripUnsafeCharacters(cell),
            theme.text.primary,
          ),
        ),
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
    let finalContentWidths: number[];

    if (availableWidth <= numColumns) {
      // Structurally impossible to fit > 1 character per column.
      // Every column gets at least 1 wide.
      finalContentWidths = new Array(numColumns).fill(1);
    } else {
      // 1. Initial fair baseline: Everyone gets 1 character width initially.
      finalContentWidths = new Array(numColumns).fill(1);
      let budget = availableWidth - numColumns;

      // 2. Satisfy minWidths proportionally
      const neededForMin = constraints.map((c) => Math.max(0, c.minWidth - 1));
      let totalNeededForMin = neededForMin.reduce((a, b) => a + b, 0);

      if (totalNeededForMin > 0) {
        if (budget >= totalNeededForMin) {
          // Can satisfy all minWidths easily
          for (let i = 0; i < numColumns; i++) {
            finalContentWidths[i]! += neededForMin[i]!;
            budget -= neededForMin[i]!;
          }
        } else {
          // Cannot satisfy all minWidths, distribute budget proportionally
          const initialBudget = budget;
          for (let i = 0; i < numColumns; i++) {
            if (neededForMin[i]! > 0) {
              const proportion = neededForMin[i]! / totalNeededForMin;
              const extra = Math.floor(initialBudget * proportion);
              finalContentWidths[i]! += extra;
              budget -= extra;
            }
          }
          // Distribute rounding remainders to columns still below minWidth
          for (let i = 0; i < numColumns && budget > 0; i++) {
            if (finalContentWidths[i]! < constraints[i]!.minWidth) {
              finalContentWidths[i]! += 1;
              budget -= 1;
            }
          }
        }
      }

      // 3. Satisfy maxWidths proportionally, if budget still remains
      if (budget > 0) {
        const neededForMax = constraints.map((c, i) =>
          Math.max(0, c.maxWidth - finalContentWidths[i]!),
        );
        let totalNeededForMax = neededForMax.reduce((a, b) => a + b, 0);

        if (totalNeededForMax > 0) {
          const initialBudget = budget;
          for (let i = 0; i < numColumns; i++) {
            if (neededForMax[i]! > 0) {
              const proportion = neededForMax[i]! / totalNeededForMax;
              let extra = Math.floor(initialBudget * proportion);
              // strictly cap to avoid overflowing maxWidths
              extra = Math.min(extra, neededForMax[i]!);
              finalContentWidths[i]! += extra;
              budget -= extra;
            }
          }

          // Distribute any final fractional rounding remainders up to maxWidth
          for (let i = 0; i < numColumns && budget > 0; i++) {
            if (finalContentWidths[i]! < constraints[i]!.maxWidth) {
              finalContentWidths[i]! += 1;
              budget -= 1;
            }
          }
        }

        // 4. Distribute any absolute surplus remainder evenly
        let index = 0;
        while (budget > 0) {
          finalContentWidths[index % numColumns]! += 1;
          budget -= 1;
          index++;
        }
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
    const adjustedWidths = actualColumnWidths.map(
      (w) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        w + COLUMN_PADDING,
    );

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
