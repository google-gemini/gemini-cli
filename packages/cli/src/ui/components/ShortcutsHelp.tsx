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
import { Command } from '../key/keyBindings.js';
import { formatCommand } from '../key/keybindingUtils.js';

type ShortcutItem = {
  key: string;
  description: string;
};

const buildShortcutItems = (): ShortcutItem[] => [
  { key: '!', description: 'shell mode' },
  { key: '@', description: 'select file or folder' },
  { key: 'Double Esc', description: 'clear & rewind' },
  { key: formatCommand(Command.FOCUS_SHELL_INPUT), description: 'focus UI' },
  { key: formatCommand(Command.TOGGLE_YOLO), description: 'YOLO mode' },
  {
    key: formatCommand(Command.CYCLE_APPROVAL_MODE),
    description: 'cycle mode',
  },
  {
    key: formatCommand(Command.PASTE_CLIPBOARD),
    description: 'paste images',
  },
  {
    key: formatCommand(Command.TOGGLE_MARKDOWN),
    description: 'raw markdown mode',
  },
  {
    key: formatCommand(Command.REVERSE_SEARCH),
    description: 'reverse-search history',
  },
  {
    key: formatCommand(Command.OPEN_EXTERNAL_EDITOR),
    description: 'open external editor',
  },
];

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
      <SectionHeader title=" Shortcuts" subtitle=" See /help for more" />
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
