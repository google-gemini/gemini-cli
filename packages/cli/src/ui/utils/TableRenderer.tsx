/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
import { getPlainTextLength, RenderInline } from './InlineMarkdownRenderer.js';
import {
  splitContentIntoEqualWidthLines,
  MAX_LINES_IN_A_ROW,
} from './tableRendererUtils.js';

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
  // Calculate column widths using actual display width after markdown processing
  let columnWidths = headers.map((header, index) => {
    const headerWidth = getPlainTextLength(header);
    const maxRowWidth = Math.max(
      ...rows.map((row) => getPlainTextLength(row[index] || '')),
    );
    return Math.max(headerWidth, maxRowWidth) + 2; // Add padding
  });

  const charSum = columnWidths.reduce((s, w) => s + w, 0);
  columnWidths = columnWidths.map((w) => Math.max(w, charSum / 3));

  // Ensure table fits within terminal width
  const totalWidth = columnWidths.reduce((sum, width) => sum + width + 1, 1);
  const scaleFactor =
    totalWidth > terminalWidth ? terminalWidth / totalWidth : 1;
  const adjustedWidths = columnWidths.map((width) =>
    Math.floor(width * scaleFactor),
  );

  // helper function to render a cell
  const renderCell = (cellPart: string, isHeader: boolean) => (
    <Text>
      {isHeader ? (
        <Text bold color={Colors.AccentCyan}>
          <RenderInline text={cellPart} />
        </Text>
      ) : (
        <RenderInline text={cellPart} />
      )}
    </Text>
  );

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

    return <Text>{border}</Text>;
  };

  const renderLineInsideRow = (line: string[], isHeader: boolean) => {
    const lineParts = line.map((txt) => renderCell(txt, isHeader));
    return (
      <Text>
        │{' '}
        {lineParts.map((cell, index) => (
          <React.Fragment key={index}>
            {cell}
            {index < lineParts.length - 1 ? ' │ ' : ''}
          </React.Fragment>
        ))}{' '}
        │
      </Text>
    );
  };

  function splitRowCellsIntoMultipleLines(
    cells: string[],
    lineCount: number,
  ): string[][] {
    const lines: string[][] = Array.from({ length: lineCount }, () => []);
    for (const [colIdx, cell] of cells.entries()) {
      const cellParts = splitContentIntoEqualWidthLines(
        cell,
        adjustedWidths[colIdx] - 2,
        lineCount,
      );
      cellParts.forEach((part, lineIdx) => {
        lines[lineIdx].push(part);
      });
    }

    return lines;
  }

  // Helper function to render a table row
  const renderRow = (cells: string[], isHeader = false): React.ReactNode => {
    const textLines = cells.map((c, i) =>
      Math.ceil(getPlainTextLength(c) / adjustedWidths[i]),
    );
    const linesInRow = Math.min(Math.max(...textLines), MAX_LINES_IN_A_ROW);
    const lines = splitRowCellsIntoMultipleLines(cells, linesInRow);

    return lines.map((line, idx) => (
      <React.Fragment key={idx}>
        {renderLineInsideRow(line, isHeader)}
      </React.Fragment>
    ));
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Top border */}
      {renderBorder('top')}

      {/* Header row */}
      {renderRow(headers, true)}

      {/* Middle border */}
      {renderBorder('middle')}

      {/* Data rows */}
      {rows.map((row, index) => (
        <React.Fragment key={index}>{renderRow(row)}</React.Fragment>
      ))}

      {/* Bottom border */}
      {renderBorder('bottom')}
    </Box>
  );
};
