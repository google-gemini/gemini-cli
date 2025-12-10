/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { type ConversationRecord, partToString } from '@google/gemini-cli-core';
import { InlineRewindEditor } from './InlineRewindEditor.js';
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const interactions = useMemo(() => {
    const prompts = [];

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

  const items = interactions.map((msg, idx) => ({
    key: `${msg.id || 'msg'}-${idx}`,
    value: msg,
    index: idx,
  }));

  useKeypress(
    (key) => {
      // If editing, allow the editor to handle keys (it uses useKeypress too)
      // But BaseSelectionList listens to keys when focused.
      // We handle ESC to exit here if NOT editing.
      if (editingIndex === null) {
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
  const ERROR_HEIGHT = errorMessage ? 3 : 0;
  const SAVING_HEIGHT = isSaving ? 1 : 0;

  const listHeight = Math.max(
    5,
    terminalHeight -
      DIALOG_PADDING -
      HEADER_HEIGHT -
      CONTROLS_HEIGHT -
      ERROR_HEIGHT -
      SAVING_HEIGHT -
      2, // Borders
  );

  // Calculate items to show based on available height.
  // Assuming roughly 3 lines per item on average?
  // BaseSelectionList doesn't do variable height virtual scrolling perfectly if heights vary wildly,
  // but it renders a slice.
  // Let's set maxItemsToShow based on lines.
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
        <Text bold>{editingIndex === null ? '> ' : '  '}Rewind</Text>
      </Box>

      {/* Error Banner */}
      {errorMessage && (
        <Box
          borderStyle="single"
          borderColor="red"
          paddingX={1}
          marginBottom={1}
        >
          <Text color="red" bold>
            Error: {errorMessage}
          </Text>
        </Box>
      )}

      {/* Saving Indicator */}
      {isSaving && (
        <Box paddingX={1} marginBottom={1}>
          <Text color={theme.status.warning}>Rewinding conversation...</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1}>
        <BaseSelectionList
          items={items}
          isFocused={editingIndex === null}
          showNumbers={false}
          onSelect={(item) => {
            const idx = items.findIndex((i) => i.value === item);
            if (idx !== -1) {
              setEditingIndex(idx);
            }
          }}
          maxItemsToShow={maxItemsToShow}
          renderItem={(itemWrapper, { isSelected }) => {
            const idx = itemWrapper.index;
            const userPrompt = itemWrapper.value;
            const isEditingThis = editingIndex === idx;

            // Determine text content
            const originalUserText = userPrompt
              ? partToString(userPrompt.content)
              : '';
            const displayUserText =
              edits[idx] !== undefined ? edits[idx] : originalUserText;

            if (isEditingThis) {
              return (
                <Box flexDirection="column" marginTop={1} marginBottom={1}>
                  <InlineRewindEditor
                    initialText={displayUserText}
                    width={terminalWidth - 12} // Adjust for padding/indicators
                    onSave={(text) =>
                      handleSaveEdit(idx, text, userPrompt.id ?? '')
                    }
                    onCancel={() => {
                      setEditingIndex(null);
                      setErrorMessage(null);
                    }}
                  />
                </Box>
              );
            }

            return (
              <Box flexDirection="column" marginBottom={1}>
                <Text
                  color={
                    isSelected ? theme.status.success : theme.text.secondary
                  }
                >
                  {truncate(displayUserText, isSelected)}
                </Text>
              </Box>
            );
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Use Enter to select, Esc to close)
        </Text>
      </Box>
    </Box>
  );
};
