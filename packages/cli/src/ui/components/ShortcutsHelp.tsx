/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { theme } from '../semantic-colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { SectionHeader } from './shared/SectionHeader.js';

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

const renderItem = (item: ShortcutItem) => `${item.key} ${item.description}`;

const wrapText = (text: string, width: number) => {
  if (width <= 0) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (stringWidth(next) <= width) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
};

const padToWidth = (text: string, width: number) => {
  const padSize = Math.max(0, width - stringWidth(text));
  return text + ' '.repeat(padSize);
};

export const ShortcutsHelp: React.FC = () => {
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const shortcutRows = buildShortcutRows();
  const gap = 2;
  const columnWidth = Math.max(18, Math.floor((terminalWidth - gap * 2) / 3));
  const backgroundColor = theme.ui.dark;

  if (isNarrow) {
    return (
      <Box flexDirection="column">
        <SectionHeader title="Shortcuts" />
        {shortcutRows.flat().map((item, index) => {
          const text = padToWidth(renderItem(item), terminalWidth);
          return (
            <Text
              key={`${item.key}-${index}`}
              backgroundColor={backgroundColor}
              color={theme.text.primary}
            >
              {text}
            </Text>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Shortcuts" />
      {shortcutRows.map((row, rowIndex) => {
        const cellLines = row.map((item) =>
          wrapText(renderItem(item), columnWidth),
        );
        const lineCount = Math.max(...cellLines.map((lines) => lines.length));

        return Array.from({ length: lineCount }).map((_, lineIndex) => {
          const line =
            padToWidth(cellLines[0][lineIndex] ?? '', columnWidth) +
            ' '.repeat(gap) +
            padToWidth(cellLines[1][lineIndex] ?? '', columnWidth) +
            ' '.repeat(gap) +
            padToWidth(cellLines[2][lineIndex] ?? '', columnWidth);

          return (
            <Text
              key={`row-${rowIndex}-line-${lineIndex}`}
              backgroundColor={backgroundColor}
              color={theme.text.primary}
            >
              {padToWidth(line, terminalWidth)}
            </Text>
          );
        });
      })}
    </Box>
  );
};
