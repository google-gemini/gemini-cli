/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import stringWidth from 'string-width';
import { Colors } from '../colors.js';
import { RenderInline } from './InlineRenderer.js';

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
  const columnWidths = headers.map((header, index) => {
    const headerWidth = stringWidth(header);
    const maxRowWidth = Math.max(
      ...rows.map((row) => stringWidth(row[index] || '')),
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

  // Helper function to calculate the wrapped height of text
  const getWrappedHeight = (text: string, width: number): number => {
    if (width <= 0) return 1;
    const lines = text.split('\n');
    let totalLines = 0;

    for (const line of lines) {
      if (line.length === 0) {
        totalLines += 1;
      } else {
        totalLines += Math.ceil(stringWidth(line) / width);
      }
    }

    return Math.max(1, totalLines);
  };

  // Helper function to get the height of a row (max height among all cells)
  const getRowHeight = (cells: string[]): number =>
    Math.max(
      ...cells.map((cell, index) => {
        const contentWidth = Math.max(0, (adjustedWidths[index] || 0) - 2);
        return getWrappedHeight(cell, contentWidth);
      }),
    );

  const renderCell = (
    content: string,
    width: number,
    height: number,
    isHeader = false,
  ) => {
    // The actual space for content inside the padding
    const contentWidth = Math.max(0, width - 2);

    // Apply inline rendering first
    const textComponent = isHeader ? (
      <Text bold color={Colors.AccentCyan}>
        <RenderInline text={content} />
      </Text>
    ) : (
      <Text>
        <RenderInline text={content} />
      </Text>
    );

    return (
      <Box width={contentWidth} height={height} flexDirection="column">
        {textComponent}
      </Box>
    );
  };

  const renderRow = (cells: string[], isHeader = false) => {
    const rowHeight = getRowHeight(cells);

    const VerticalSeparator = ({ content }: { content: string }) => (
      <Text>{Array.from({ length: rowHeight }, () => content).join('\n')}</Text>
    );

    return (
      <Box flexDirection="row" height={rowHeight}>
        <VerticalSeparator content="│ " />
        {cells.map((cell, index) => (
          <React.Fragment key={index}>
            {renderCell(cell, adjustedWidths[index] || 0, rowHeight, isHeader)}
            <VerticalSeparator content=" │ " />
          </React.Fragment>
        ))}
      </Box>
    );
  };

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
