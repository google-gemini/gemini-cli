/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';

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
  // Calculate column widths
  const columnWidths = headers.map((header, index) => {
    const headerWidth = header.length;
    const maxRowWidth = Math.max(
      ...rows.map((row) => (row[index] || '').length),
    );
    return Math.max(headerWidth, maxRowWidth) + 2; // Add padding
  });

  // Ensure table fits within terminal width
  const totalWidth = columnWidths.reduce((sum, width) => sum + width + 1, 1);
  const scaleFactor =
    totalWidth > terminalWidth ? terminalWidth / totalWidth : 1;
  const adjustedWidths = columnWidths.map((width) =>
    Math.floor(width * scaleFactor),
  );

  const renderCell = (content: string, width: number, isHeader = false) => {
    // The actual space for content inside the padding
    const contentWidth = Math.max(0, width - 2);

    let cellContent = content;
    if (content.length > contentWidth) {
      if (contentWidth <= 3) {
        // Not enough space for '...'
        cellContent = content.substring(0, contentWidth);
      } else {
        cellContent = content.substring(0, contentWidth - 3) + '...';
      }
    }

    // Pad the content to fill the cell
    const padded = cellContent.padEnd(contentWidth, ' ');

    if (isHeader) {
      return (
        <Text bold color={Colors.AccentCyan}>
          {padded}
        </Text>
      );
    }
    return <Text>{padded}</Text>;
  };

  const renderRow = (cells: string[], isHeader = false) => (
    <Box flexDirection="row">
      <Text>│ </Text>
      {cells.map((cell, index) => (
        <React.Fragment key={index}>
          {renderCell(cell, adjustedWidths[index] || 0, isHeader)}
          <Text> │ </Text>
        </React.Fragment>
      ))}
    </Box>
  );

  const renderSeparator = () => {
    const separator = adjustedWidths
      .map((width) => '─'.repeat(Math.max(0, (width || 0) - 2)))
      .join('─┼─');
    return <Text>├─{separator}─┤</Text>;
  };

  const renderTopBorder = () => {
    const border = adjustedWidths
      .map((width) => '─'.repeat(Math.max(0, (width || 0) - 2)))
      .join('─┬─');
    return <Text>┌─{border}─┐</Text>;
  };

  const renderBottomBorder = () => {
    const border = adjustedWidths
      .map((width) => '─'.repeat(Math.max(0, (width || 0) - 2)))
      .join('─┴─');
    return <Text>└─{border}─┘</Text>;
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {renderTopBorder()}
      {renderRow(headers, true)}
      {renderSeparator()}
      {rows.map((row, index) => (
        <React.Fragment key={index}>{renderRow(row)}</React.Fragment>
      ))}
      {renderBottomBorder()}
    </Box>
  );
};
