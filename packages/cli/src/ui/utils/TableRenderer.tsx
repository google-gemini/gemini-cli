/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';

interface TableRendererProps {
  headers: React.ReactNode[];
  rows: React.ReactNode[][];
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
  // Helper function to get text length from React node
  const getNodeTextLength = (node: React.ReactNode): number => {
    if (typeof node === 'string') return node.length;
    if (typeof node === 'number') return String(node).length;
    if (React.isValidElement(node)) {
      // Extract text content from React elements
      const children = (node.props as any).children;
      if (typeof children === 'string') return children.length;
      if (Array.isArray(children)) {
        return children.reduce((sum, child) => sum + getNodeTextLength(child), 0);
      }
      return getNodeTextLength(children);
    }
    if (Array.isArray(node)) {
      return node.reduce((sum, child) => sum + getNodeTextLength(child), 0);
    }
    return 0;
  };

  // Calculate column widths
  const columnWidths = headers.map((header, index) => {
    const headerWidth = getNodeTextLength(header);
    const maxRowWidth = Math.max(
      ...rows.map((row) => getNodeTextLength(row[index] || '')),
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

  const renderCell = (content: React.ReactNode, width: number, isHeader = false) => {
    // The actual space for content inside the padding
    const contentWidth = Math.max(0, width - 2);
    const textLength = getNodeTextLength(content);

    let cellContent: React.ReactNode = content;
    
    // If content is too long and is a string, truncate it
    if (textLength > contentWidth && typeof content === 'string') {
      if (contentWidth <= 3) {
        // Not enough space for '...'
        cellContent = content.substring(0, contentWidth);
      } else {
        cellContent = content.substring(0, contentWidth - 3) + '...';
      }
    }

    // Calculate padding needed
    const paddingNeeded = Math.max(0, contentWidth - textLength);
    const padding = ' '.repeat(paddingNeeded);

    if (isHeader) {
      return (
        <Text bold color={Colors.AccentCyan}>
          {cellContent}{padding}
        </Text>
      );
    }
    return (
      <Text>
        {cellContent}{padding}
      </Text>
    );
  };

  const renderRow = (cells: React.ReactNode[], isHeader = false) => (
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
