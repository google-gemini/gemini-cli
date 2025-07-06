/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
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
    return Math.max(headerWidth, maxRowWidth) + 2; // Add padding
  });

  // Ensure table fits within terminal width
  const totalWidth = columnWidths.reduce((sum, width) => sum + width + 1, 1);
  const scaleFactor =
    totalWidth > terminalWidth ? terminalWidth / totalWidth : 1;
  const adjustedWidths = columnWidths.map((width) =>
    Math.floor(width * scaleFactor),
  );

  // Helper function to render a cell with proper width
  const renderCell = (content: string, width: number): React.ReactNode => {
    const contentWidth = Math.max(0, width - 2);
    const displayWidth = getPlainTextLength(content);
    
    let cellContent = content;
    if (displayWidth > contentWidth) {
      if (contentWidth <= 3) {
        // Just truncate by character count
        cellContent = content.substring(0, Math.min(content.length, contentWidth));
      } else {
        // Truncate preserving markdown formatting
        let truncated = content;
        let currentDisplayWidth = displayWidth;
        
        while (currentDisplayWidth > contentWidth - 3 && truncated.length > 0) {
          truncated = truncated.substring(0, truncated.length - 1);
          currentDisplayWidth = getPlainTextLength(truncated);
        }
        
        cellContent = truncated + '...';
      }
    }
    
    // Calculate exact padding needed
    const actualDisplayWidth = getPlainTextLength(cellContent);
    const paddingNeeded = Math.max(0, contentWidth - actualDisplayWidth);
    
    return (
      <Text>
        <RenderInline text={cellContent} />
        {' '.repeat(paddingNeeded)}
      </Text>
    );
  };

  // Helper function to render border
  const renderBorder = (type: 'top' | 'middle' | 'bottom'): React.ReactNode => {
    const chars = {
      top: { left: '┌', middle: '┬', right: '┐', horizontal: '─' },
      middle: { left: '├', middle: '┼', right: '┤', horizontal: '─' },
      bottom: { left: '└', middle: '┴', right: '┘', horizontal: '─' }
    };
    
    const char = chars[type];
    const borderParts = adjustedWidths.map(w => char.horizontal.repeat(w));
    const border = char.left + borderParts.join(char.middle) + char.right;
    
    return <Text>{border}</Text>;
  };

  // Helper function to render a table row
  const renderRow = (cells: string[]): React.ReactNode => {
    const renderedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 0;
      return renderCell(cell || '', width);
    });
    
    return (
      <Text>
        │ {renderedCells.map((cell, index) => (
          <React.Fragment key={index}>
            {cell}
            {index < renderedCells.length - 1 ? ' │ ' : ''}
          </React.Fragment>
        ))} │
      </Text>
    );
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Top border */}
      {renderBorder('top')}
      
      {/* Header row */}
      {renderRow(headers)}
      
      {/* Middle border */}
      {renderBorder('middle')}
      
      {/* Data rows */}
      {rows.map((row, index) => (
        <React.Fragment key={index}>
          {renderRow(row)}
        </React.Fragment>
      ))}
      
      {/* Bottom border */}
      {renderBorder('bottom')}
    </Box>
  );
};
