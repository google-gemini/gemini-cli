/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { ConsoleMessageItem } from '../types.js';
import {
  ScrollableList,
  type ScrollableListRef,
} from './shared/ScrollableList.js';
import { useConsoleMessages } from '../hooks/useConsoleMessages.js';
import { useConfig } from '../contexts/ConfigContext.js';

interface DetailedMessagesDisplayProps {
  maxHeight: number | undefined;
  width: number;
  hasFocus: boolean;
}

const iconBoxWidth = 3;

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ maxHeight, width, hasFocus }) => {
  const scrollableListRef = useRef<ScrollableListRef<ConsoleMessageItem>>(null);

  const { consoleMessages } = useConsoleMessages();
  const config = useConfig();

  const messages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  const borderAndPadding = 3;

  const estimatedItemHeight = useCallback(
    (index: number) => {
      const msg = messages[index];
      if (!msg) {
        return 1;
      }
      const textWidth = width - borderAndPadding - iconBoxWidth;
      if (textWidth <= 0) {
        return 1;
      }
      const lines = Math.ceil((msg.content?.length || 1) / textWidth);
      return Math.max(1, lines);
    },
    [width, messages],
  );

  if (messages.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border.default}
      paddingLeft={1}
      width={width}
      height={maxHeight}
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
    >
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Debug Console <Text color={theme.text.secondary}>(F12 to close)</Text>
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
                <Box minWidth={iconBoxWidth} flexShrink={0}>
                  <Text color={textColor}>{icon}</Text>
                </Box>
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
          estimatedItemHeight={estimatedItemHeight}
          hasFocus={hasFocus}
          initialScrollIndex={Number.MAX_SAFE_INTEGER}
        />
      </Box>
    </Box>
  );
};
