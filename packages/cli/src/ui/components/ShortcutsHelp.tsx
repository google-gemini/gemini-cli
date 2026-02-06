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
      { key: 'Ctrl+V', description: 'paste images' },
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

const splitLongWord = (word: string, width: number) => {
  if (width <= 0) return [''];
  const parts: string[] = [];
  let current = '';

  for (const char of word) {
    const next = current + char;
    if (stringWidth(next) <= width) {
      current = next;
      continue;
    }
    if (current) {
      parts.push(current);
    }
    current = char;
  }

  if (current) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [''];
};

const wrapText = (text: string, width: number) => {
  if (width <= 0) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (stringWidth(word) > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      const chunks = splitLongWord(word, width);
      for (const chunk of chunks) {
        lines.push(chunk);
      }
      continue;
    }
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

const wrapDescription = (key: string, description: string, width: number) => {
  const keyWidth = stringWidth(key);
  const availableWidth = Math.max(1, width - keyWidth - 1);
  const wrapped = wrapText(description, availableWidth);
  return wrapped.length > 0 ? wrapped : [''];
};

const padToWidth = (text: string, width: number) => {
  const padSize = Math.max(0, width - stringWidth(text));
  return text + ' '.repeat(padSize);
};

export const ShortcutsHelp: React.FC = () => {
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const shortcutRows = buildShortcutRows();
  const leftInset = 1;
  const rightInset = 2;
  const gap = 2;
  const contentWidth = Math.max(1, terminalWidth - leftInset - rightInset);
  const columnWidth = Math.max(18, Math.floor((contentWidth - gap * 2) / 3));
  const keyColor = theme.text.accent;

  if (isNarrow) {
    return (
      <Box flexDirection="column">
        <SectionHeader title="Shortcuts (for more, see /help)" />
        {shortcutRows.flat().map((item, index) => {
          const descriptionLines = wrapDescription(
            item.key,
            item.description,
            contentWidth,
          );
          const keyWidth = stringWidth(item.key);

          return descriptionLines.map((line, lineIndex) => {
            const rightPadding = Math.max(
              0,
              contentWidth - (keyWidth + 1 + stringWidth(line)),
            );

            return (
              <Text
                key={`${item.key}-${index}-${lineIndex}`}
                color={theme.text.primary}
              >
                {lineIndex === 0 ? (
                  <>
                    {' '.repeat(leftInset)}
                    <Text color={keyColor}>{item.key}</Text> {line}
                    {' '.repeat(rightPadding + rightInset)}
                  </>
                ) : (
                  `${' '.repeat(leftInset)}${padToWidth(
                    `${' '.repeat(keyWidth + 1)}${line}`,
                    contentWidth,
                  )}${' '.repeat(rightInset)}`
                )}
              </Text>
            );
          });
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Shortcuts (for more, see /help)" />
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
              flexDirection="row"
            >
              <Box width={leftInset}>
                <Text>{' '.repeat(leftInset)}</Text>
              </Box>
              <Box width={columnWidth}>{segments[0]}</Box>
              <Box width={gap}>
                <Text>{' '.repeat(gap)}</Text>
              </Box>
              <Box width={columnWidth}>{segments[1]}</Box>
              <Box width={gap}>
                <Text>{' '.repeat(gap)}</Text>
              </Box>
              <Box width={columnWidth}>{segments[2]}</Box>
              <Box width={rightInset}>
                <Text>{' '.repeat(rightInset)}</Text>
              </Box>
            </Box>
          );
        });
      })}
    </Box>
  );
};
