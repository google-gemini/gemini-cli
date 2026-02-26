/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Text, Box } from 'ink';
import {
  type StyledChar,
  toStyledCharacters,
  styledCharsToString,
  styledCharsWidth,
  wordBreakStyledChars,
  wrapStyledChars,
  widestLineFromStyledChars,
} from 'ink';
import { theme } from '../semantic-colors.js';
import { RenderInline } from './InlineMarkdownRenderer.js';
import { stripUnsafeCharacters } from './textUtils.js';

interface TableRendererProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const MIN_COLUMN_WIDTH = 5;
const COLUMN_PADDING = 2;
const TABLE_MARGIN = 2;

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
  // Clean headers: remove bold markers since we already render headers as bold
  // and having them can break wrapping when the markers are split across lines.
  const cleanedHeaders = useMemo(
    () => headers.map((header) => header.replace(/\*\*(.*?)\*\*/g, '$1')),
    [headers],
  );

  const styledHeaders = useMemo(
    () =>
      cleanedHeaders.map((header) =>
        toStyledCharacters(stripUnsafeCharacters(header)),
      ),
    [cleanedHeaders],
  );

  const styledRows = useMemo(
    () =>
      rows.map((row) =>
        row.map((cell) => toStyledCharacters(stripUnsafeCharacters(cell))),
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
        (totalMinWidth - finalTotalShortColumnWidth);
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
            <RenderInline text={content.text} />
          </Text>
        ) : (
          <RenderInline text={content.text} />
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
      <Text color={theme.text.primary}>
        <Text color={theme.border.default}>│</Text>{' '}
        {renderedCells.map((cell, index) => (
          <React.Fragment key={index}>
            {cell}
            {index < renderedCells.length - 1 && (
              <Text color={theme.border.default}>{' │ '}</Text>
            )}
          </React.Fragment>
        ))}{' '}
        <Text color={theme.border.default}>│</Text>
      </Text>
    );
  };

  // Handles the wrapping logic for a logical data row
  const renderDataRow = (
    wrappedCells: ProcessedLine[][],
    rowIndex?: number,
    isHeader = false,
  ): React.ReactNode => {
    const key = isHeader ? 'header' : `${rowIndex}`;
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
