/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Colors } from '../colors.js';
import {
  type ConversationRecord,
  type MessageRecord,
  partToString,
} from '@google/gemini-cli-core';

interface HistoryViewerProps {
  conversation: ConversationRecord;
  onExit: () => void;
}

const MAX_LINES_PER_BOX = 5;

export const HistoryViewer: React.FC<HistoryViewerProps> = ({
  conversation,
  onExit,
}) => {
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Group messages into interactions (User + Gemini response)
  const interactions = useMemo(() => {
    const grouped = [];
    let currentInteraction: { user?: MessageRecord; gemini?: MessageRecord } =
      {};

    for (const msg of conversation.messages) {
      if (msg.type === 'gemini' && msg.toolCalls) {
        continue;
      }
      if (msg.type === 'user') {
        // If we already have a user message in the current interaction, push it and start new
        if (currentInteraction.user) {
          grouped.push(currentInteraction);
          currentInteraction = {};
        }
        currentInteraction.user = msg;
      } else if (msg.type === 'gemini') {
        currentInteraction.gemini = msg;
        grouped.push(currentInteraction);
        currentInteraction = {}; // Interaction complete
      }
    }
    // Push the last one if it exists
    if (currentInteraction.user || currentInteraction.gemini) {
      grouped.push(currentInteraction);
    }
    return grouped;
  }, [conversation.messages]);

  const ITEMS_PER_PAGE = 3;
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Ensure scrollOffset keeps selectedIndex in view
  if (selectedIndex < scrollOffset) {
    setScrollOffset(selectedIndex);
  } else if (selectedIndex >= scrollOffset + ITEMS_PER_PAGE) {
    setScrollOffset(selectedIndex - ITEMS_PER_PAGE + 1);
  }

  useKeypress(
    (key) => {
      if (key.name === 'escape' || key.sequence === 'q') {
        onExit();
      } else if (key.name === 'up') {
        setSelectedIndex((prev) => {
          if (interactions.length === 0) return 0;
          return prev === 0 ? interactions.length - 1 : prev - 1;
        });
      } else if (key.name === 'down') {
        setSelectedIndex((prev) => {
          if (interactions.length === 0) return 0;
          return prev === interactions.length - 1 ? 0 : prev + 1;
        });
      }
    },
    { isActive: true },
  );

  const visibleInteractions = interactions.slice(
    scrollOffset,
    scrollOffset + ITEMS_PER_PAGE,
  );

  const truncate = (text: string, isSelected: boolean) => {
    if (isSelected) return text; // Show full text if selected
    const lines = text.split('\n');
    if (lines.length > MAX_LINES_PER_BOX) {
      return (
        lines.slice(0, MAX_LINES_PER_BOX).join('\n') +
        `\n... (${lines.length - MAX_LINES_PER_BOX} more lines)`
      );
    }
    return text;
  };

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <Box
        borderStyle="single"
        borderColor={Colors.AccentPurple}
        flexDirection="column"
        paddingX={1}
      >
        <Text bold color={Colors.AccentPurple}>
          History Viewer ({interactions.length > 0 ? selectedIndex + 1 : 0} of{' '}
          {interactions.length})
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visibleInteractions.map((interaction, idx) => {
          const absoluteIndex = scrollOffset + idx;
          const isSelected = absoluteIndex === selectedIndex;

          return (
            <Box
              key={absoluteIndex}
              borderStyle={isSelected ? 'double' : 'round'}
              borderColor={isSelected ? Colors.AccentYellow : Colors.Gray}
              flexDirection="column"
              marginBottom={0}
              paddingX={1}
            >
              {interaction.user && (
                <Box flexDirection="column">
                  <Text bold color={Colors.AccentGreen}>
                    User:
                  </Text>
                  <Text>
                    {truncate(
                      partToString(interaction.user.content),
                      isSelected,
                    )}
                  </Text>
                </Box>
              )}

              {interaction.user && interaction.gemini && (
                <Box
                  height={1}
                  borderStyle="single"
                  borderTop={false}
                  borderLeft={false}
                  borderRight={false}
                  borderBottom={true}
                  borderColor={Colors.DarkGray}
                  marginY={0}
                />
              )}

              {interaction.gemini && (
                <Box flexDirection="column">
                  <Text bold color={Colors.AccentBlue}>
                    Gemini:
                  </Text>
                  <Text>
                    {truncate(
                      partToString(interaction.gemini.content),
                      isSelected,
                    )}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box borderStyle="single" borderColor={Colors.Gray} paddingX={1}>
        <Text>
          Controls: <Text bold>Up/Down</Text> to navigate,{' '}
          <Text bold>Esc/q</Text> to exit
        </Text>
      </Box>
    </Box>
  );
};
