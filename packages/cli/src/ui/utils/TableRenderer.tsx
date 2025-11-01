/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
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
  // Calculate column widths using actual display width after markdown processing
  const columnWidths = headers.map((header, index) => {
    const headerWidth = getPlainTextLength(header);
    const maxRowWidth = Math.max(
      ...rows.map((row) => getPlainTextLength(row[index] || '')),
    );

    // Use the square root of the content length to calculate column widths, preventing excessive width differences between cells.
    return Math.pow(Math.max(headerWidth, maxRowWidth, 10), 0.5);
  });

  // Ensure table fits within terminal width
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const scaleFactor = terminalWidth / totalWidth;
  const adjustedWidths = columnWidths.map((width) =>
    Math.floor(width * scaleFactor),
  );

  // Helper function to render a cell with proper width
  const renderCell = (
    content: string,
    width: number,
    isHeader = false,
    index = 0,
  ): React.ReactNode => {
    const contentWidth = Math.max(0, width);

    return (
      <Box
        width={contentWidth}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        borderStyle="single"
        borderColor={theme.border.default}
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderLeft={index === 0 ? false : true}
        key={index}
      >
        {isHeader ? (
          <Text bold color={theme.text.link}>
            <RenderInline text={content} />
          </Text>
        ) : (
          <RenderInline text={content} />
        )}
      </Box>
    );
  };

  // Helper function to render a table row
  const renderRow = (cells: string[], isHeader = false): React.ReactNode => {
    const renderedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 0;
      return renderCell(cell || '', width, isHeader, index);
    });

    return <Box>{renderedCells.map((cell) => cell)}</Box>;
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.border.default}
    >
      {/* Header row */}
      {renderRow(headers, true)}

      {/* Data rows */}
      {rows.map((row, index) => (
        <React.Fragment key={index}>
          <Box
            borderStyle="classic"
            borderColor={theme.border.default}
            borderRight={false}
            borderLeft={false}
            borderBottom={false}
          />
          {renderRow(row)}
        </React.Fragment>
      ))}
    </Box>
  );
};
