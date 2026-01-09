/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
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
import { useRewind } from '../hooks/useRewind.js';
import { RewindConfirmation, RewindOutcome } from './RewindConfirmation.js';

interface RewindViewerProps {
  conversation: ConversationRecord;
  onExit: () => void;
  onRewind: (
    messageId: string,
    newText: string,
    outcome: RewindOutcome,
  ) => void;
}

const MAX_LINES_PER_BOX = 2;

const REFERENCE_CONTENT_START = '--- Content from referenced files ---';
const REFERENCE_CONTENT_END = '--- End of content ---';

function stripReferenceContent(text: string): string {
  const startIndex = text.indexOf(REFERENCE_CONTENT_START);
  if (startIndex === -1) return text;

  const endIndex = text.lastIndexOf(REFERENCE_CONTENT_END);
  if (endIndex === -1 || endIndex < startIndex) return text;

  let removeStart = startIndex;
  if (removeStart > 0 && text[removeStart - 1] === '\n') {
    removeStart--;
  }

  const removeEnd = endIndex + REFERENCE_CONTENT_END.length;

  return (text.slice(0, removeStart) + text.slice(removeEnd)).trim();
}

export const RewindViewer: React.FC<RewindViewerProps> = ({
  conversation,
  onExit,
  onRewind,
}) => {
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const {
    selectedMessageId,
    getStats,
    confirmationStats,
    selectMessage,
    clearSelection,
  } = useRewind(conversation);

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

  const interactions = conversation.messages.filter(
    (msg) => msg.type === 'user',
  );

  const items = interactions
    .map((msg, idx) => ({
      key: `${msg.id || 'msg'}-${idx}`,
      value: msg,
      index: idx,
    }))
    .reverse();

  useKeypress(
    (key) => {
      if (!selectedMessageId) {
        if (key.name === 'escape') {
          onExit();
        }
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
    terminalHeight - DIALOG_PADDING - HEADER_HEIGHT - CONTROLS_HEIGHT - 2,
  );

  const maxItemsToShow = Math.max(1, Math.floor(listHeight / 4));

  if (selectedMessageId) {
    const selectedMessage = interactions.find(
      (m) => m.id === selectedMessageId,
    );
    return (
      <RewindConfirmation
        stats={confirmationStats}
        terminalWidth={terminalWidth}
        timestamp={selectedMessage?.timestamp}
        onConfirm={(outcome) => {
          if (outcome === RewindOutcome.Cancel) {
            clearSelection();
          } else {
            const userPrompt = interactions.find(
              (m) => m.id === selectedMessageId,
            );
            if (userPrompt) {
              const originalUserText = userPrompt.content
                ? partToString(userPrompt.content)
                : '';
              const cleanedText = stripReferenceContent(originalUserText);
              onRewind(selectedMessageId, cleanedText, outcome);
            }
          }
        }}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      width={terminalWidth}
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
            if (userPrompt && userPrompt.id) {
              selectMessage(userPrompt.id);
            }
          }}
          maxItemsToShow={maxItemsToShow}
          renderItem={(itemWrapper, { isSelected }) => {
            const userPrompt = itemWrapper.value;
            const stats = getStats(userPrompt);
            const firstFileName = stats?.details?.at(0)?.fileName;
            const originalUserText = userPrompt.content
              ? partToString(userPrompt.content)
              : '';
            const cleanedText = stripReferenceContent(originalUserText);

            return (
              <Box flexDirection="column" marginBottom={1}>
                <Box>
                  <Text
                    color={
                      isSelected ? theme.status.success : theme.text.primary
                    }
                  >
                    {truncate(cleanedText, isSelected)}
                  </Text>
                </Box>
                {stats ? (
                  <Box flexDirection="row">
                    <Text color={theme.text.secondary}>
                      {stats.fileCount === 1
                        ? firstFileName
                          ? firstFileName
                          : '1 file changed'
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
                  <Text color={theme.text.secondary}>
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
          (Use Enter to select a message, Esc to close)
        </Text>
      </Box>
    </Box>
  );
};
