/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { theme } from '../semantic-colors.js';
import { RenderInline, getPlainTextLength } from './InlineMarkdownRenderer.js';

interface TableRendererProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
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
  // --- Step 1: Define Constraints per Column ---
  const constraints = headers.map((header, colIndex) => {
    const headerWidth = getPlainTextLength(header);

    // Calculate max content width and max word width for this column
    let maxContentWidth = headerWidth;
    let maxWordWidth = 0;

    rows.forEach((row) => {
      const cell = row[colIndex] || '';
      const cellWidth = getPlainTextLength(cell);
      maxContentWidth = Math.max(maxContentWidth, cellWidth);

      // Find longest word to ensure it fits without splitting
      const words = cell.split(/\s+/);
      for (const word of words) {
        const wordWidth = getPlainTextLength(word);
        maxWordWidth = Math.max(maxWordWidth, wordWidth);
      }
    });

    // min: used to guarantee minimum column width and prevent wrapping mid-word
    // Defaults to header width or max word width
    const min = Math.max(headerWidth, maxWordWidth);

    // max: used to determine how much the column can grow if space allows
    // Ensure max is never smaller than min
    const max = Math.max(min, maxContentWidth);

    return { min, max };
  });

  // --- Step 2: Calculate Available Space ---
  // Fixed overhead: borders (n+1) + padding (2n)
  const fixedOverhead = headers.length + 1 + headers.length * 2;
  const availableWidth = Math.max(0, terminalWidth - fixedOverhead - 1);

  // --- Step 3: Allocation Algorithm ---
  const totalMinWidth = constraints.reduce((sum, c) => sum + c.min, 0);
  let finalContentWidths: number[];

  if (totalMinWidth > availableWidth) {
    // Case A: Not enough space even for minimums.
    // We must scale everything down proportionally.
    const scale = availableWidth / totalMinWidth;
    finalContentWidths = constraints.map((c) => Math.floor(c.min * scale));
  } else {
    // Case B: We have space! Distribute the surplus.
    const surplus = availableWidth - totalMinWidth;
    const totalGrowthNeed = constraints.reduce(
      (sum, c) => sum + (c.max - c.min),
      0,
    );

    if (totalGrowthNeed === 0) {
      // If nobody wants to grow, simply give everyone their min.
      finalContentWidths = constraints.map((c) => c.min);
    } else {
      finalContentWidths = constraints.map((c) => {
        const growthNeed = c.max - c.min;
        // Calculate share: (My Need / Total Need) * Surplus
        const share = growthNeed / totalGrowthNeed;
        const extra = Math.floor(surplus * share);
        return c.min + extra;
      });
    }
  }

  // Add padding (+2) to get the visual widths expected by the renderers
  const adjustedWidths = finalContentWidths.map((w) => w + 2);

  // Helper function to render a cell with proper width
  const renderCell = (
    content: string,
    width: number,
    isHeader = false,
  ): React.ReactNode => {
    const contentWidth = Math.max(0, width - 2);
    const displayWidth = getPlainTextLength(content);

    // Calculate exact padding needed
    const paddingNeeded = Math.max(0, contentWidth - displayWidth);

    return (
      <Text>
        {isHeader ? (
          <Text bold color={theme.text.link}>
            <RenderInline text={content} />
          </Text>
        ) : (
          <RenderInline text={content} />
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
    cells: string[],
    isHeader = false,
  ): React.ReactNode => {
    const renderedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 0;
      return renderCell(cell || '', width, isHeader);
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
    row: string[],
    rowIndex: number,
    isHeader = false,
  ): React.ReactNode => {
    const wrappedCells = row.map((cell, colIndex) => {
      // Get the calculated width for THIS column
      const colWidth = adjustedWidths[colIndex];
      const contentWidth = Math.max(1, colWidth - 2); // Subtract padding

      // 1. Try soft wrap first (respects word boundaries)
      // wrap-ansi with hard:false will put long words on their own line but won't split them,
      // potentially exceeding contentWidth.
      const softWrapped = wrapAnsi(cell, contentWidth, {
        hard: false,
        trim: true,
      });

      // 2. Post-process to handle "Giant Words" that overflow
      const rawLines = softWrapped.split('\n');
      const finalLines: string[] = [];

      for (const line of rawLines) {
        if (getPlainTextLength(line) > contentWidth) {
          // It's too long (a single giant word or URL). Force break it.
          const forced = wrapAnsi(line, contentWidth, {
            hard: true,
            trim: true,
          });
          finalLines.push(...forced.split('\n'));
        } else {
          finalLines.push(line);
        }
      }

      return finalLines;
    });

    const maxHeight = Math.max(...wrappedCells.map((lines) => lines.length), 1);

    const visualRows: React.ReactNode[] = [];
    for (let i = 0; i < maxHeight; i++) {
      const visualRowCells = wrappedCells.map((lines) => lines[i] || '');
      visualRows.push(
        <React.Fragment key={`${rowIndex}-${i}`}>
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
      {renderDataRow(headers, -1, true)}

      {/* Middle border */}
      {renderBorder('middle')}

      {/* Data rows */}
      {rows.map((row, index) => renderDataRow(row, index))}

      {/* Bottom border */}
      {renderBorder('bottom')}
    </Box>
  );
};
