/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useContext } from 'react';
import { Box, Text, useStdout } from 'ink';
import { theme } from '../semantic-colors.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { UIStateContext } from '../contexts/UIStateContext.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';

interface PlanApprovalDialogProps {
  planPath: string;
  planContent?: string;
  onApprove: () => void;
  onFeedback: (feedback: string) => void;
  onCancel: () => void;
}

interface SelectionItem {
  key: string;
  label: string;
  type: 'approve' | 'feedback';
}

export const PlanApprovalDialog: React.FC<PlanApprovalDialogProps> = ({
  planPath,
  planContent,
  onApprove,
  onFeedback,
  onCancel,
}) => {
  const uiState = useContext(UIStateContext);
  const { stdout } = useStdout();
  const terminalWidth = uiState?.terminalWidth ?? stdout?.columns ?? 80;

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { width: terminalWidth - 25, height: 1 },
    singleLine: true,
    isValidPath: () => false,
  });

  const items = useMemo(
    (): Array<{ key: string; value: SelectionItem }> => [
      {
        key: 'approve',
        value: {
          key: 'approve',
          label: 'Yes, Switch to Default Mode',
          type: 'approve',
        },
      },
      {
        key: 'feedback',
        value: { key: 'feedback', label: '', type: 'feedback' },
      },
    ],
    [],
  );

  const handleSelect = useCallback(
    (item: SelectionItem) => {
      if (item.type === 'approve') {
        onApprove();
      } else if (item.type === 'feedback') {
        if (buffer.text.trim()) {
          onFeedback(buffer.text.trim());
        }
      }
    },
    [onApprove, onFeedback, buffer],
  );

  const handleCancel = useCallback(
    (key: Key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
      }
    },
    [onCancel],
  );

  useKeypress(handleCancel, { isActive: true });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      borderColor={theme.border.default}
    >
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Planning Complete. Ready to start implementation?
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>Plan: </Text>
        <Text color={theme.text.accent}>{planPath}</Text>
      </Box>

      {planContent && (
        <Box
          borderStyle="single"
          borderColor={theme.border.default}
          paddingX={1}
          marginBottom={1}
          flexDirection="column"
        >
          <MarkdownDisplay
            text={planContent}
            isPending={false}
            terminalWidth={terminalWidth}
          />
        </Box>
      )}

      <BaseSelectionList<SelectionItem>
        items={items}
        onSelect={handleSelect}
        renderItem={(item, context) => {
          const selectionItem = item.value;

          if (selectionItem.type === 'feedback') {
            return (
              <Box flexDirection="row">
                <TextInput
                  buffer={buffer}
                  placeholder="Type revisions here..."
                  focus={context.isSelected}
                  onSubmit={() => handleSelect(selectionItem)}
                />
              </Box>
            );
          }

          const color = context.isSelected
            ? theme.text.accent
            : theme.text.primary;
          return (
            <Box>
              <Text color={color}>{selectionItem.label}</Text>
            </Box>
          );
        }}
      />

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Enter to select · ↑/↓ to navigate · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};
