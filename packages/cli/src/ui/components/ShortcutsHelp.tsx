/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

type ShortcutItem = {
  key: string;
  description: string;
};

const buildShortcutRows = (): ShortcutItem[][] => {
  const isMac = process.platform === 'darwin';
  const altLabel = isMac ? 'Option' : 'Alt';

  return [
    [
      { key: '!', description: 'shell mode' },
      {
        key: 'Shift+Tab',
        description: 'cycle approval (plan / accept edits)',
      },
      { key: 'Ctrl+G', description: 'IDE context details' },
    ],
    [
      { key: '/shells', description: 'background shells view' },
      { key: 'Ctrl+Y', description: 'toggle YOLO mode' },
      { key: 'Ctrl+R', description: 'reverse-search shell history' },
    ],
    [
      { key: '/dir add', description: 'add workspace directories' },
      { key: `${altLabel}+M`, description: 'raw markdown mode' },
      { key: 'Ctrl+X', description: 'open external editor' },
    ],
    [
      { key: '@path', description: 'attach file or folder' },
      { key: '/vim', description: 'toggle vim keybindings' },
      { key: 'Esc Esc', description: 'clear prompt / rewind' },
    ],
  ];
};

const renderItem = (item: ShortcutItem) => (
  <Text>
    <Text color={theme.text.accent}>{item.key}</Text>
    <Text color={theme.text.primary}> {item.description}</Text>
  </Text>
);

export const ShortcutsHelp: React.FC = () => {
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const columnWidth = Math.max(24, Math.floor((terminalWidth - 6) / 3));
  const shortcutRows = buildShortcutRows();

  if (isNarrow) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={1}
        paddingY={0}
      >
        {shortcutRows.flat().map((item, index) => (
          <Box key={`${item.key}-${index}`}>{renderItem(item)}</Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      paddingY={0}
    >
      {shortcutRows.map((row, rowIndex) => (
        <Box key={`row-${rowIndex}`} flexDirection="row">
          {row.map((item, colIndex) => (
            <Box key={`${item.key}-${colIndex}`} width={columnWidth}>
              {renderItem(item)}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};
