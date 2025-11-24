/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box, type TextProps } from 'ink';
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
  const maxRowContentWidths = headers.map((_, index) =>
    Math.max(...rows.map((row) => getPlainTextLength(row[index] ?? ''))),
  );
  const contentWidths = headers.map((header, index) => {
    const headerWidth = getPlainTextLength(header);
    const maxRowWidth = maxRowContentWidths[index];
    return Math.max(headerWidth, maxRowWidth);
  });

  const borderAndPaddingWidth = headers.length * (2 * CELL_PADDING_X + 1) + 1;
  const availableContentWidth = terminalWidth - borderAndPaddingWidth;
  const columnWidths = calculateColumnWidths(
    availableContentWidth,
    contentWidths,
  );

  const hasRowOverflow = maxRowContentWidths.some(
    (maxWidth, index) => maxWidth > columnWidths[index],
  );

  return (
    <Box flexDirection="column" marginY={1}>
      <Row
        cellContents={headers}
        columnWidths={columnWidths}
        top={true}
        bottom={rows.length === 0}
        includeRowSeparators={true}
        textProps={{ bold: true, color: theme.text.link }}
      />
      {rows.map((row, index) => (
        <Row
          key={index}
          cellContents={row}
          columnWidths={columnWidths}
          top={false}
          bottom={index === rows.length - 1}
          includeRowSeparators={hasRowOverflow}
          textProps={{ color: theme.text.primary }}
        />
      ))}
    </Box>
  );
};

function calculateColumnWidths(
  availableWidth: number,
  contentWidths: number[],
): number[] {
  // Distribute width to the columns as evenly as possible. This avoids wrapping
  // of already narrow columns, and approximately fairly distributes width among
  // the columns that are forced to wrap.
  const columnWidths = contentWidths.map(() => 0);
  let overflowingColumns = contentWidths.map((_, i) => i);
  while (availableWidth > 0 && overflowingColumns.length > 0) {
    let share = Math.floor(availableWidth / overflowingColumns.length);
    let columnsToGrow = overflowingColumns;
    if (share === 0) {
      // availableWidth < overflowingColumns.length, so fairly distribute the
      // remaining width arbitrarily to the leftmost overflowing columns.
      share = 1;
      columnsToGrow = columnsToGrow.slice(0, availableWidth);
    }

    overflowingColumns = [];
    for (const index of columnsToGrow) {
      const contentWidth = contentWidths[index];
      const oldWidth = columnWidths[index];
      let newWidth = oldWidth + share;
      if (newWidth > contentWidth) {
        newWidth = contentWidth;
      } else {
        overflowingColumns.push(index);
      }
      columnWidths[index] = newWidth;
      availableWidth -= newWidth - oldWidth;
    }
  }
  return columnWidths;
}

const Row: React.FC<{
  cellContents: string[];
  columnWidths: number[];
  top: boolean;
  bottom: boolean;
  includeRowSeparators: boolean;
  textProps: TextProps;
}> = ({
  cellContents,
  columnWidths,
  top,
  bottom,
  includeRowSeparators,
  textProps,
}) => (
  <Box margin={0}>
    {cellContents.map((contents, index) => (
      <Cell
        key={index}
        contents={contents}
        width={columnWidths[index] ?? 0}
        top={top}
        bottom={bottom}
        left={index === 0}
        right={index === cellContents.length - 1}
        includeRowSeparators={includeRowSeparators}
        textProps={textProps}
      />
    ))}
  </Box>
);

const CELL_PADDING_X = 1;

const Cell: React.FC<{
  contents: string;
  width: number;
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  includeRowSeparators: boolean;
  textProps: TextProps;
}> = ({
  contents,
  width,
  top,
  bottom,
  left,
  right,
  includeRowSeparators,
  textProps,
}) => (
  // Cells share borders, so each cell leaves rendering its top and left borders
  // to its neighbors when possible.
  // Abouth the width calculation: ink seems to include the border in the width
  // (box-sizing: border-box), so we have to add in padding and border.
  <Box
    width={width + 2 * CELL_PADDING_X + (left ? 2 : 1)}
    paddingX={CELL_PADDING_X}
    borderColor={theme.border.default}
    borderLeft={left}
    borderTop={top}
    borderBottom={bottom || includeRowSeparators}
    borderStyle={{
      topLeft: top ? (left ? '┌' : '┬') : left ? '├' : '┼',
      top: '─',
      topRight: top ? (right ? '┐' : '┬') : right ? '┤' : '┼',
      left: '│',
      bottomLeft: bottom ? (left ? '└' : '┴') : left ? '├' : '┼',
      bottom: '─',
      bottomRight: bottom ? (right ? '┘' : '┴') : right ? '┤' : '┼',
      right: '│',
    }}
  >
    <Text {...textProps}>
      <RenderInline text={contents} />
    </Text>
  </Box>
);
