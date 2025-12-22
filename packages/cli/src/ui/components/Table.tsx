/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  width?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  renderCell?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  data: T[];
  columns: Array<Column<T>>;
}

export function Table<T>({ data, columns }: TableProps<T>) {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box flexDirection="row">
        {columns.map((col, index) => (
          <Box
            key={`header-${index}`}
            width={col.width}
            flexGrow={col.flexGrow}
            flexShrink={col.flexShrink}
            flexBasis={col.flexBasis ?? (col.width ? undefined : 0)}
            paddingRight={1}
          >
            {typeof col.header === 'string' ? (
              <Text bold color={theme.text.primary}>
                {col.header}
              </Text>
            ) : (
              col.header
            )}
          </Box>
        ))}
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        marginBottom={0}
      />

      {/* Rows */}
      {data.map((item, rowIndex) => (
        <Box key={`row-${rowIndex}`} flexDirection="row">
          {columns.map((col, colIndex) => (
            <Box
              key={`cell-${rowIndex}-${colIndex}`}
              width={col.width}
              flexGrow={col.flexGrow}
              flexShrink={col.flexShrink}
              flexBasis={col.flexBasis ?? (col.width ? undefined : 0)}
              paddingRight={1}
            >
              {col.renderCell ? (
                col.renderCell(item)
              ) : (
                <Text color={theme.text.primary}>
                  {String((item as Record<string, unknown>)[col.key])}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
