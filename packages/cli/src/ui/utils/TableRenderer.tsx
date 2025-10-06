/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { AlignType, PhrasingContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import stringWidth from 'string-width';
import { theme } from '../semantic-colors.js';

interface TableRendererProps {
  headers: PhrasingContent[][];
  rows: PhrasingContent[][][];
  alignment?: AlignType[];
  terminalWidth: number;
}

/**
 * Render phrasing (inline) content from AST nodes
 * Maps mdast inline nodes directly to React components
 */
function renderPhrasing(children: PhrasingContent[]): React.ReactNode {
  return children.map((child, index) => {
    const key = `inline-${index}`;

    switch (child.type) {
      case 'text':
        return <React.Fragment key={key}>{child.value}</React.Fragment>;
      case 'strong':
        return (
          <Text key={key} bold>
            {renderPhrasing(child.children)}
          </Text>
        );
      case 'emphasis':
        return (
          <Text key={key} italic>
            {renderPhrasing(child.children)}
          </Text>
        );
      case 'inlineCode':
        return (
          <Text key={key} color="cyan">
            {child.value}
          </Text>
        );
      case 'link':
        return (
          <Text key={key} underline color="blue">
            {renderPhrasing(child.children)}
          </Text>
        );
      case 'delete':
        return (
          <Text key={key} strikethrough>
            {renderPhrasing(child.children)}
          </Text>
        );
      default:
        return null;
    }
  });
}

/**
 * Custom table renderer for markdown tables
 * We implement our own instead of using ink-table due to module compatibility issues
 */
export const TableRenderer: React.FC<TableRendererProps> = ({
  headers,
  rows,
  alignment,
  terminalWidth,
}) => {
  // Calculate column widths using mdast-util-to-string for plain text length
  const columnWidths = headers.map((header, index) => {
    const headerText = toString({ type: 'paragraph', children: header });
    const headerWidth = stringWidth(headerText);
    const maxRowWidth = Math.max(
      ...rows.map((row) => {
        const cellContent = row[index] || [];
        const cellText = toString({ type: 'paragraph', children: cellContent });
        return stringWidth(cellText);
      }),
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

  // Helper function to render a cell with proper width and alignment
  const renderCell = (
    content: PhrasingContent[],
    width: number,
    columnIndex: number,
    isHeader = false,
  ): React.ReactNode => {
    const contentWidth = Math.max(0, width - 2);
    const cellText = toString({ type: 'paragraph', children: content });
    const displayWidth = stringWidth(cellText);

    // For now, if content is too wide, we truncate with ellipsis
    // TODO: Implement smart truncation that preserves AST structure
    const renderedContent =
      displayWidth > contentWidth ? (
        <Text>{cellText.substring(0, contentWidth - 3)}...</Text>
      ) : isHeader ? (
        <Text bold color={theme.text.link}>
          {renderPhrasing(content)}
        </Text>
      ) : (
        renderPhrasing(content)
      );

    // Calculate exact padding needed
    const actualDisplayWidth =
      displayWidth > contentWidth ? contentWidth : displayWidth;
    const paddingNeeded = Math.max(0, contentWidth - actualDisplayWidth);

    // Get alignment for this column (default to left)
    const align = alignment?.[columnIndex] || 'left';

    // Distribute padding based on alignment
    let leftPadding = 0;
    let rightPadding = 0;

    if (align === 'center') {
      leftPadding = Math.floor(paddingNeeded / 2);
      rightPadding = paddingNeeded - leftPadding;
    } else if (align === 'right') {
      leftPadding = paddingNeeded;
      rightPadding = 0;
    } else {
      // 'left' or null
      leftPadding = 0;
      rightPadding = paddingNeeded;
    }

    return (
      <Text>
        {' '.repeat(leftPadding)}
        {renderedContent}
        {' '.repeat(rightPadding)}
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

  // Helper function to render a table row
  const renderRow = (
    cells: PhrasingContent[][],
    isHeader = false,
  ): React.ReactNode => {
    const renderedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 0;
      return renderCell(cell || [], width, index, isHeader);
    });

    return (
      <Text>
        <Text color={theme.border.default}>│</Text>{' '}
        {renderedCells.map((cell, index) => (
          <React.Fragment key={index}>
            {cell}
            {index < renderedCells.length - 1 ? (
              <>
                {' '}
                <Text color={theme.border.default}>│</Text>{' '}
              </>
            ) : (
              ''
            )}
          </React.Fragment>
        ))}{' '}
        <Text color={theme.border.default}>│</Text>
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
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
