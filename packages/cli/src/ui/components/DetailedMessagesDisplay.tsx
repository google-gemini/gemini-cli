/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from 'react';
import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { ConsoleMessageItem } from '../types.js';
import {
  ScrollableList,
  type ScrollableListRef,
} from './shared/ScrollableList.js';

interface DetailedMessagesDisplayProps {
  messages: ConsoleMessageItem[];
  maxHeight: number | undefined;
  width: number;
  hasFocus: boolean;
}

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ messages, maxHeight, width, hasFocus }) => {
  const scrollableListRef = useRef<ScrollableListRef<ConsoleMessageItem>>(null);

  const borderAndPadding = 4;

  if (messages.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      width={width}
    >
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Debug Console{' '}
          <Text color={theme.text.secondary}>(ctrl+o to close)</Text>
        </Text>
      </Box>
      <Box height={maxHeight} width={width - borderAndPadding}>
        <ScrollableList
          ref={scrollableListRef}
          data={messages}
          renderItem={({ item: msg }: { item: ConsoleMessageItem }) => {
            let textColor = theme.text.primary;
            let icon = 'ℹ'; // Information source (ℹ)

            switch (msg.type) {
              case 'warn':
                textColor = theme.status.warning;
                icon = '⚠'; // Warning sign (⚠)
                break;
              case 'error':
                textColor = theme.status.error;
                icon = '✖'; // Heavy multiplication x (✖)
                break;
              case 'debug':
                textColor = theme.text.secondary; // Or theme.text.secondary
                icon = '🔍'; // Left-pointing magnifying glass (🔍)
                break;
              case 'log':
              default:
                // Default textColor and icon are already set
                break;
            }

            return (
              <Box flexDirection="row">
                <Text color={textColor}>{icon} </Text>
                <Text color={textColor} wrap="wrap">
                  {msg.content}
                  {msg.count && msg.count > 1 && (
                    <Text color={theme.text.secondary}> (x{msg.count})</Text>
                  )}
                </Text>
              </Box>
            );
          }}
          keyExtractor={(item, index) => `${item.content}-${index}`}
          estimatedItemHeight={(index) => {
            const msg = messages[index]!;
            if (!msg) {
              return 1;
            }
            const iconAndSpace = 2;
            const textWidth = width - borderAndPadding - iconAndSpace;
            if (textWidth <= 0) {
              return 1;
            }
            const lines = Math.ceil((msg.content?.length || 1) / textWidth);
            return Math.max(1, lines);
          }}
          hasFocus={hasFocus}
          initialScrollIndex={Number.MAX_SAFE_INTEGER}
        />
      </Box>
    </Box>
  );
};
