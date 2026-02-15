/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { SectionHeader } from './shared/SectionHeader.js';
import { useUIState } from '../contexts/UIStateContext.js';

type ShortcutItem = {
  key: string;
  description: string;
};

const buildShortcutItems = (): ShortcutItem[] => {
  const isMac = process.platform === 'darwin';
  const altLabel = isMac ? 'Option' : 'Alt';

  return [
    { key: '!', description: 'shell mode' },
    { key: '@', description: 'select file or folder' },
    { key: 'Esc Esc', description: 'clear & rewind' },
    { key: 'Tab Tab', description: 'focus UI' },
    { key: 'Ctrl+Y', description: 'YOLO mode' },
    { key: 'Shift+Tab', description: 'cycle mode' },
    { key: 'Ctrl+V', description: 'paste images' },
    { key: `${altLabel}+M`, description: 'raw markdown mode' },
    { key: 'Ctrl+R', description: 'reverse-search history' },
    { key: 'Ctrl+X', description: 'open external editor' },
  ];
};

const Shortcut: React.FC<{ item: ShortcutItem }> = ({ item }) => (
  <Box flexDirection="row">
    <Box flexShrink={0} marginRight={1}>
      <Text color={theme.text.accent}>{item.key}</Text>
    </Box>
    <Box flexGrow={1}>
      <Text color={theme.text.primary}>{item.description}</Text>
    </Box>
  </Box>
);

export const ShortcutsHelp: React.FC = () => {
  const { terminalWidth } = useUIState();
  const isNarrow = isNarrowWidth(terminalWidth);
  const items = buildShortcutItems();
  const itemsForDisplay = isNarrow
    ? items
    : [
        // Keep first column stable: !, @, Esc Esc, Tab Tab.
        items[0],
        items[5],
        items[6],
        items[1],
        items[4],
        items[7],
        items[2],
        items[8],
        items[9],
        items[3],
      ];

  return (
    <Box flexDirection="column" width="100%">
      <SectionHeader title="Shortcuts (for more, see /help)" />
      <Box flexDirection="row" flexWrap="wrap" paddingLeft={1} paddingRight={2}>
        {itemsForDisplay.map((item, index) => (
          <Box
            key={`${item.key}-${index}`}
            width={isNarrow ? '100%' : '33%'}
            paddingRight={isNarrow ? 0 : 2}
          >
            <Shortcut item={item} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};
