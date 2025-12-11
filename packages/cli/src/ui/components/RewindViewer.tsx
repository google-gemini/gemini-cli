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

  const calculateStats = (userMessage: MessageRecord) => {
    const msgIndex = conversation.messages.indexOf(userMessage);
    if (msgIndex === -1) return null;

    let addedLines = 0;
    let removedLines = 0;
    const files = new Set<string>();
    let hasEdits = false;

    // Look ahead until the next user message or end of conversation
    for (let i = msgIndex + 1; i < conversation.messages.length; i++) {
      const msg = conversation.messages[i];
      if (msg.type === 'user') break; // Stop at next user message

      if (msg.type === 'gemini' && msg.toolCalls) {
        for (const toolCall of msg.toolCalls) {
          const result = toolCall.resultDisplay;
          if (
            result &&
            typeof result === 'object' &&
            'diffStat' in result &&
            result.diffStat
          ) {
            hasEdits = true;
            const stats = result.diffStat;
            addedLines += stats.model_added_lines + stats.user_added_lines;
            removedLines +=
              stats.model_removed_lines + stats.user_removed_lines;
            if ('fileName' in result && typeof result.fileName === 'string') {
              files.add(result.fileName);
            }
          }
        }
      }
    }

    if (!hasEdits) return null;

    return {
      addedLines,
      removedLines,
      fileCount: files.size,
      firstFileName: files.values().next().value as string,
    };
  };

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
            const stats = calculateStats(userPrompt);

            const originalUserText = userPrompt.content
              ? partToString(userPrompt.content)
              : '';

            return (
              <Box flexDirection="column" marginBottom={1}>
                <Box>
                  <Text
                    color={
                      isSelected ? theme.status.success : theme.text.secondary
                    }
                  >
                    {truncate(originalUserText, isSelected)}
                  </Text>
                </Box>
                {stats ? (
                  <Box flexDirection="row">
                    <Text color={theme.text.primary}>
                      {stats.fileCount === 1
                        ? stats.firstFileName
                        : `${stats.fileCount} files changed`}{' '}
                    </Text>
                    {stats.addedLines > 0 && (
                      <Text color="green">+{stats.addedLines} </Text>
                    )}
                    {stats.removedLines > 0 && (
                      <Text color="red">-{stats.removedLines}</Text>
                    )}
                  </Box>
                ) : (
                  <Text color={theme.text.primary}>
                    No files have been changed
                  </Text>
                )}
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
