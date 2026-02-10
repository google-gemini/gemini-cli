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
import { useSettings } from '../contexts/SettingsContext.js';

type ShortcutItem = {
  key: string;
  description: string;
};

const buildShortcutItems = (focusUiPreviewEnabled: boolean): ShortcutItem[] => {
  const isMac = process.platform === 'darwin';
  const altLabel = isMac ? 'Option' : 'Alt';

  const items: ShortcutItem[] = [
    { key: '!', description: 'shell mode' },
    { key: 'Shift+Tab', description: 'cycle mode' },
    { key: 'Ctrl+V', description: 'paste images' },
    { key: '@', description: 'select file or folder' },
    { key: 'Ctrl+Y', description: 'YOLO mode' },
    { key: `${altLabel}+M`, description: 'raw markdown mode' },
    { key: 'Esc Esc', description: 'clear & rewind' },
    { key: 'Ctrl+R', description: 'reverse-search history' },
    { key: 'Ctrl+X', description: 'open external editor' },
  ];

  if (focusUiPreviewEnabled) {
    items.push({ key: 'Tab Tab', description: 'focus UI' });
  }

  return items;
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
  const settings = useSettings();
  const items = buildShortcutItems(settings.merged.ui.focusUiPreview === true);

  const isNarrow = isNarrowWidth(terminalWidth);

  return (
    <Box flexDirection="column" width="100%">
      <SectionHeader title="Shortcuts (for more, see /help)" />
      <Box flexDirection="row" flexWrap="wrap" paddingLeft={1} paddingRight={2}>
        {items.map((item, index) => (
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
