/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState } from 'react';
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

const getCleanedRewindText = (userPrompt: MessageRecord): string => {
  const contentToUse = userPrompt.displayContent || userPrompt.content;
  const originalUserText = contentToUse ? partToString(contentToUse) : '';
  return userPrompt.displayContent
    ? originalUserText
    : stripReferenceContent(originalUserText);
};

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

  const items = useMemo(() => {
    const interactionItems = interactions.map((msg, idx) => ({
      key: `${msg.id || 'msg'}-${idx}`,
      value: msg,
      index: idx,
    }));

    // Add "Current Position" as the last item
    return [
      ...interactionItems,
      {
        key: 'current-position',
        value: {
          id: 'current-position',
          type: 'user',
          content: 'Stay at current position',
          timestamp: new Date().toISOString(),
        } as MessageRecord,
        index: interactionItems.length,
      },
    ];
  }, [interactions]);

  useKeypress(
    (key) => {
      if (!selectedMessageId) {
        if (keyMatchers[Command.ESCAPE](key)) {
          onExit();
          return true;
        }
        if (keyMatchers[Command.EXPAND_SUGGESTION](key)) {
          if (
            highlightedMessageId &&
            highlightedMessageId !== 'current-position'
          ) {
            setExpandedMessageId(highlightedMessageId);
            return true;
          }
        }
        if (keyMatchers[Command.COLLAPSE_SUGGESTION](key)) {
          setExpandedMessageId(null);
          return true;
        }
      }
      return false;
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

    if (selectedMessageId === 'current-position') {
      onExit();
      return null;
    }

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
            void (async () => {
              const userPrompt = interactions.find(
                (m) => m.id === selectedMessageId,
              );
              if (userPrompt) {
                const cleanedText = getCleanedRewindText(userPrompt);
                setIsRewinding(true);
                await onRewind(selectedMessageId, cleanedText, outcome);
              }
            })();
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
          initialIndex={items.length - 1}
          isFocused={true}
          showNumbers={false}
          wrapAround={false}
          onSelect={(item: MessageRecord) => {
            const userPrompt = item;
            if (userPrompt && userPrompt.id) {
              if (userPrompt.id === 'current-position') {
                onExit();
              } else {
                selectMessage(userPrompt.id);
              }
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

            if (userPrompt.id === 'current-position') {
              return (
                <Box flexDirection="column" marginBottom={1}>
                  <Text
                    color={
                      isSelected ? theme.status.success : theme.text.primary
                    }
                  >
                    {partToString(
                      userPrompt.displayContent || userPrompt.content,
                    )}
                  </Text>
                  <Text color={theme.text.secondary}>
                    Cancel rewind and stay here
                  </Text>
                </Box>
              );
            }

            const stats = getStats(userPrompt);
            const firstFileName = stats?.details?.at(0)?.fileName;
            const cleanedText = getCleanedRewindText(userPrompt);

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
