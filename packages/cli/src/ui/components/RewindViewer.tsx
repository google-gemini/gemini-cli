/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Colors } from '../colors.js';
import {
  type ConversationRecord,
  type MessageRecord,
  partToString,
} from '@google/gemini-cli-core';
import { InlineRewindEditor } from './InlineRewindEditor.js';

interface RewindViewerProps {
  conversation: ConversationRecord;
  onExit: () => void;
  onRewind: (messageId: string, newText: string) => void;
}

const MAX_LINES_PER_BOX = 5;

export const RewindViewer: React.FC<RewindViewerProps> = ({
  conversation,
  onExit,
  onRewind,
}) => {
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Group messages
  const interactions = useMemo(() => {
    const grouped = [];
    let currentInteraction: { user?: MessageRecord; gemini?: MessageRecord } =
      {};

    for (const msg of conversation.messages) {
      if (msg.type === 'gemini' && msg.toolCalls) {
        continue;
      }
      if (msg.type === 'user') {
        if (currentInteraction.user) {
          grouped.push(currentInteraction);
          currentInteraction = {};
        }
        currentInteraction.user = msg;
      } else if (msg.type === 'gemini') {
        currentInteraction.gemini = msg;
        grouped.push(currentInteraction);
        currentInteraction = {};
      }
    }
    if (currentInteraction.user || currentInteraction.gemini) {
      grouped.push(currentInteraction);
    }
    return grouped;
  }, [conversation.messages]);

  const ITEMS_PER_PAGE = 3;
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + ITEMS_PER_PAGE) {
      setScrollOffset(selectedIndex - ITEMS_PER_PAGE + 1);
    }
  }, [selectedIndex, scrollOffset, ITEMS_PER_PAGE]);

  useKeypress(
    (key) => {
      // If we are editing, ignore navigation keys here (handled by InlineRewindEditor)
      if (editingIndex !== null) return;

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
      } else if (key.name === 'return' || key.name === 'e') {
        setEditingIndex(selectedIndex);
      }
    },
    { isActive: true },
  );

  const visibleInteractions = interactions.slice(
    scrollOffset,
    scrollOffset + ITEMS_PER_PAGE,
  );

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

  // Callback when user saves edits
  const handleSaveEdit = async (
    index: number,
    newText: string,
    messageId: string,
  ) => {
    setErrorMessage(null); // Clear previous errors
    setIsSaving(true);

    try {
      // Optimistic update: update local UI immediately
      setEdits((prev) => ({ ...prev, [index]: newText }));

      // Attempt the rewind. If successful, parent closes this component.
      await onRewind(messageId, newText);

      // If we are here, the parent hasn't closed us yet (or logic finished).
      // We close the editor mode locally.
      setEditingIndex(null);
    } catch (error) {
      // UX: Restore state on failure or just show error?
      // Best UX: Keep the editor open so they don't lose the text, show error.
      const msg =
        error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMessage(`Failed to save: ${msg}`);
      // We do NOT setEditingIndex(null) here, so the user can try again.
    } finally {
      setIsSaving(false);
    }
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
          Rewind Viewer ({interactions.length > 0 ? selectedIndex + 1 : 0} of{' '}
          {interactions.length})
        </Text>
      </Box>

      {/* Error Banner - Only renders if there is an error */}
      {errorMessage && (
        <Box borderStyle="single" borderColor="red" paddingX={1}>
          <Text color="red" bold>
            Error: {errorMessage}
          </Text>
        </Box>
      )}

      {/* Saving Indicator */}
      {isSaving && (
        <Box paddingX={1}>
          <Text color={Colors.AccentYellow}>Rewinding conversation...</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1}>
        {visibleInteractions.map((interaction, idx) => {
          const absoluteIndex = scrollOffset + idx;
          const isSelected = absoluteIndex === selectedIndex;
          const isEditingThis = editingIndex === absoluteIndex;

          // Determine text content: Check local edits first, fall back to conversation history
          const originalUserText = interaction.user
            ? partToString(interaction.user.content)
            : '';
          const displayUserText =
            edits[absoluteIndex] !== undefined
              ? edits[absoluteIndex]
              : originalUserText;

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

                  {/* Logic Switch: Editor vs Text Viewer */}
                  {isEditingThis ? (
                    <InlineRewindEditor
                      initialText={displayUserText}
                      width={terminalWidth - 6}
                      onSave={(text) =>
                        handleSaveEdit(
                          absoluteIndex,
                          text,
                          interaction.user?.id ?? '',
                        )
                      }
                      onCancel={() => {
                        setEditingIndex(null);
                        setErrorMessage(null);
                      }}
                    />
                  ) : (
                    <Text>{truncate(displayUserText, isSelected)}</Text>
                  )}
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
          Controls: <Text bold>Up/Down</Text> navigate |{' '}
          <Text bold>Enter/e</Text> edit user message | <Text bold>Esc/q</Text>{' '}
          exit
        </Text>
      </Box>
    </Box>
  );
};
