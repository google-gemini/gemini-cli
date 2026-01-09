/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import type { FileChangeStats } from '../utils/rewindFileOps.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { formatTimeAgo } from '../utils/formatters.js';

export enum RewindOutcome {
  RewindAndRevert = 'rewind_and_revert',
  RewindOnly = 'rewind_only',
  RevertOnly = 'revert_only',
  Cancel = 'cancel',
}

interface RewindConfirmationProps {
  stats: FileChangeStats | null;
  onConfirm: (outcome: RewindOutcome) => void;
  terminalWidth: number;
  timestamp?: string;
}

export const RewindConfirmation: React.FC<RewindConfirmationProps> = ({
  stats,
  onConfirm,
  terminalWidth,
  timestamp,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onConfirm(RewindOutcome.Cancel);
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<RewindOutcome>> = [
    {
      label: 'Rewind conversation and revert code changes',
      value: RewindOutcome.RewindAndRevert,
      key: 'Rewind conversation and revert code changes',
    },
    {
      label: 'Rewind conversation',
      value: RewindOutcome.RewindOnly,
      key: 'Rewind conversation',
    },
    {
      label: 'Revert code changes',
      value: RewindOutcome.RevertOnly,
      key: 'Revert code changes',
    },
    {
      label: 'Do nothing (esc)',
      value: RewindOutcome.Cancel,
      key: 'Do nothing (esc)',
    },
  ];

  const handleSelect = (outcome: RewindOutcome) => {
    onConfirm(outcome);
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      padding={1}
      width={terminalWidth}
    >
      <Box marginBottom={1}>
        <Text bold>Confirm Rewind</Text>
      </Box>

      {stats && (
        <Box
          flexDirection="column"
          marginBottom={1}
          borderStyle="single"
          borderColor={theme.border.default}
          paddingX={1}
        >
          <Text color={theme.text.primary}>
            {stats.fileCount === 1
              ? `File: ${stats.details?.at(0)?.fileName}`
              : `${stats.fileCount} files affected`}
          </Text>
          <Box flexDirection="row">
            <Text color={theme.status.success}>
              Lines added: {stats.addedLines}{' '}
            </Text>
            <Text color={theme.status.error}>
              Lines removed: {stats.removedLines}
            </Text>
            {timestamp && (
              <Text color={theme.text.secondary}>
                {' '}
                ({formatTimeAgo(timestamp)})
              </Text>
            )}
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.warning}>
              ℹ Rewinding does not affect files edited manually or by the shell
              tool.
            </Text>
          </Box>
        </Box>
      )}

      {!stats && (
        <Box marginBottom={1}>
          <Text color={theme.text.secondary}>No code changes to revert.</Text>
          {timestamp && (
            <Text color={theme.text.secondary}>
              {' '}
              ({formatTimeAgo(timestamp)})
            </Text>
          )}
        </Box>
      )}

      <Box marginBottom={1}>
        <Text>Select an action:</Text>
      </Box>

      <RadioButtonSelect
        items={options}
        onSelect={handleSelect}
        isFocused={true}
      />
    </Box>
  );
};
