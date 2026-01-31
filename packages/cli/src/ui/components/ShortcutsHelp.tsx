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
        description: 'cycle mode',
      },
      { key: 'Ctrl+G', description: 'IDE context details' },
    ],
    [
      { key: '@', description: 'select file or folder' },
      { key: 'Ctrl+Y', description: 'YOLO mode' },
      { key: 'Ctrl+R', description: 'reverse-search history' },
    ],
    [
      { key: 'Esc Esc', description: 'clear prompt / rewind' },
      { key: `${altLabel}+M`, description: 'raw markdown mode' },
      { key: 'Ctrl+X', description: 'open external editor' },
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
  const keyColor = theme.text.accent;

  if (isNarrow) {
    return (
      <Box flexDirection="column">
        <SectionHeader title="Shortcuts (for more see /help)" />
        {shortcutRows.flat().map((item, index) => {
          const text = padToWidth(renderItem(item), terminalWidth);
          return (
            <Text
              key={`${item.key}-${index}`}
              backgroundColor={backgroundColor}
              color={theme.text.primary}
            >
              <Text color={keyColor}>{item.key}</Text>
              {text.slice(item.key.length)}
            </Text>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Shortcuts (for more see /help)" />
      {shortcutRows.map((row, rowIndex) => {
        const cellLines = row.map((item) =>
          wrapText(renderItem(item), columnWidth),
        );
        const lineCount = Math.max(...cellLines.map((lines) => lines.length));

        return Array.from({ length: lineCount }).map((_, lineIndex) => {
          const segments = row.map((item, colIndex) => {
            const lineText = cellLines[colIndex][lineIndex] ?? '';
            const keyWidth = stringWidth(item.key);

            if (lineIndex === 0) {
              const rest = lineText.slice(item.key.length);
              const restPadded = padToWidth(
                rest,
                Math.max(0, columnWidth - keyWidth),
              );
              return (
                <Text key={`${item.key}-${colIndex}`}>
                  <Text color={keyColor}>{item.key}</Text>
                  {restPadded}
                </Text>
              );
            }

            const spacer = ' '.repeat(keyWidth);
            const padded = padToWidth(`${spacer}${lineText}`, columnWidth);
            return <Text key={`${item.key}-${colIndex}`}>{padded}</Text>;
          });

          return (
            <Box
              key={`row-${rowIndex}-line-${lineIndex}`}
              width={terminalWidth}
              backgroundColor={backgroundColor}
              flexDirection="row"
            >
              <Box width={columnWidth}>{segments[0]}</Box>
              <Box width={gap}>
                <Text>{' '.repeat(gap)}</Text>
              </Box>
              <Box width={columnWidth}>{segments[1]}</Box>
              <Box width={gap}>
                <Text>{' '.repeat(gap)}</Text>
              </Box>
              <Box width={columnWidth}>{segments[2]}</Box>
            </Box>
          );
        });
      })}
    </Box>
  );
};
