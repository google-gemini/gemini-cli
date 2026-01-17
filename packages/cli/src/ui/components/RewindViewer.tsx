/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
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
import { stripReferenceContent } from '../utils/formatters.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { CliSpinner } from './CliSpinner.js';
import { ExpandableText } from './shared/ExpandableText.js';

interface RewindViewerProps {
  conversation: ConversationRecord;
  onExit: () => void;
  onRewind: (
    messageId: string,
    newText: string,
    outcome: RewindOutcome,
  ) => Promise<void>;
}

const MAX_LINES_PER_BOX = 2;

export const RewindViewer: React.FC<RewindViewerProps> = ({
  conversation,
  onExit,
  onRewind,
}) => {
  const [isRewinding, setIsRewinding] = useState(false);
  const { terminalWidth, terminalHeight } = useUIState();
  const {
    selectedMessageId,
    getStats,
    confirmationStats,
    selectMessage,
    clearSelection,
  } = useRewind(conversation);

  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(
    null,
  );

  const interactions = useMemo(
    () => conversation.messages.filter((msg) => msg.type === 'user'),
    [conversation.messages],
  );

  const items = useMemo(
    () =>
      interactions
        .map((msg, idx) => ({
          key: `${msg.id || 'msg'}-${idx}`,
          value: msg,
          index: idx,
        }))
        .reverse(),
    [interactions],
  );

  useEffect(() => {
    if (items.length > 0 && !highlightedMessageId) {
      // Initialize with the first item (most recent)
      const firstItem = items[0];
      if (firstItem?.value.id) {
        setHighlightedMessageId(firstItem.value.id);
      }
    }
  }, [items, highlightedMessageId]);

  useKeypress(
    (key) => {
      if (!selectedMessageId) {
        if (keyMatchers[Command.ESCAPE](key)) {
          onExit();
          return;
        }
        if (keyMatchers[Command.EXPAND_SUGGESTION](key)) {
          if (highlightedMessageId) {
            setExpandedMessageId(highlightedMessageId);
          }
        }
        if (keyMatchers[Command.COLLAPSE_SUGGESTION](key)) {
          setExpandedMessageId(null);
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
    if (isRewinding) {
      return (
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          padding={1}
          width={terminalWidth}
          flexDirection="row"
        >
          <Box>
            <CliSpinner />
          </Box>
          <Text>Rewinding...</Text>
        </Box>
      );
    }

    const selectedMessage = interactions.find(
      (m) => m.id === selectedMessageId,
    );
    return (
      <RewindConfirmation
        stats={confirmationStats}
        terminalWidth={terminalWidth}
        timestamp={selectedMessage?.timestamp}
        onConfirm={async (outcome) => {
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
              setIsRewinding(true);
              await onRewind(selectedMessageId, cleanedText, outcome);
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
          onHighlight={(item: MessageRecord) => {
            if (item.id) {
              setHighlightedMessageId(item.id);
              // Collapse when moving selection
              setExpandedMessageId(null);
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
                  <ExpandableText
                    label={cleanedText}
                    isExpanded={expandedMessageId === userPrompt.id}
                    textColor={
                      isSelected ? theme.status.success : theme.text.primary
                    }
                    maxWidth={(terminalWidth - 4) * MAX_LINES_PER_BOX}
                    maxLines={MAX_LINES_PER_BOX}
                  />
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
          (Use Enter to select a message, Esc to close, Right/Left to
          expand/collapse)
        </Text>
      </Box>
    </Box>
  );
};
