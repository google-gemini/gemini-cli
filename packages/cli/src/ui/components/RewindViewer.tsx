/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import {
  type ConversationRecord,
  type MessageRecord,
  partToString,
} from '@google/gemini-cli-core';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface RewindViewerProps {
  conversation: ConversationRecord;
  onExit: () => void;
  onRewind: (messageId: string, newText: string) => void;
}

const MAX_LINES_PER_BOX = 2;

export const RewindViewer: React.FC<RewindViewerProps> = ({
  conversation,
  onExit,
  onRewind,
}) => {
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();

  const interactions = useMemo(() => {
    const prompts: MessageRecord[] = [];

    for (const msg of conversation.messages) {
      if (msg.type === 'user') {
        prompts.push(msg);
      }
    }
    return prompts;
  }, [conversation.messages]);

  const truncate = (text: string, isSelected: boolean) => {
    if (isSelected) return text;
    const lines = text.split('\n');
    if (lines.length > MAX_LINES_PER_BOX) {
      return (
        lines.slice(0, MAX_LINES_PER_BOX).join('\n') +
        `\n... (${lines.length - MAX_LINES_PER_BOX} more lines)`
      );
    }
    return text;
  };

  const items = interactions.map((msg, idx) => ({
    key: `${msg.id || 'msg'}-${idx}`,
    value: msg,
    index: idx,
  }));

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  // Height constraint calculations
  const DIALOG_PADDING = 2; // Top/bottom padding
  const HEADER_HEIGHT = 2; // Title + margin
  const CONTROLS_HEIGHT = 2; // Controls text + margin

  const listHeight = Math.max(
    5,
    terminalHeight - DIALOG_PADDING - HEADER_HEIGHT - CONTROLS_HEIGHT - 2, // Borders
  );

  const maxItemsToShow = Math.max(1, Math.floor(listHeight / 4));

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>{'> '}Rewind</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        <BaseSelectionList
          items={items}
          isFocused={true}
          showNumbers={false}
          onSelect={(item: MessageRecord) => {
            const userPrompt = item;
            if (userPrompt) {
              const originalUserText = userPrompt.content
                ? partToString(userPrompt.content)
                : '';
              onRewind(userPrompt.id ?? '', originalUserText);
            }
          }}
          maxItemsToShow={maxItemsToShow}
          renderItem={(itemWrapper, { isSelected }) => {
            const userPrompt = itemWrapper.value;

            // Determine text content
            const originalUserText = userPrompt.content
              ? partToString(userPrompt.content)
              : '';

            return (
              <Box flexDirection="column" marginBottom={1}>
                <Text
                  color={
                    isSelected ? theme.status.success : theme.text.secondary
                  }
                >
                  {truncate(originalUserText, isSelected)}
                </Text>
              </Box>
            );
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Use Enter to rewind to this message, Esc to close)
        </Text>
      </Box>
    </Box>
  );
};
