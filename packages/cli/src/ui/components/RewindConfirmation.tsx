/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import type { FileChangeStats } from '../utils/rewindFileOps.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { formatTimeAgo } from '../utils/formatters.js';
import { keyMatchers, Command } from '../keyMatchers.js';

export enum RewindOutcome {
  RewindAndRevert = 'rewind_and_revert',
  RewindOnly = 'rewind_only',
  RevertOnly = 'revert_only',
  Cancel = 'cancel',
}

const REWIND_OPTIONS: Array<RadioSelectItem<RewindOutcome>> = [
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
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onConfirm(RewindOutcome.Cancel);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const handleSelect = (outcome: RewindOutcome) => {
    onConfirm(outcome);
  };

  const options = useMemo(() => {
    if (stats) {
      return REWIND_OPTIONS;
    }
    return REWIND_OPTIONS.filter(
      (option) =>
        option.value !== RewindOutcome.RewindAndRevert &&
        option.value !== RewindOutcome.RevertOnly,
    );
  }, [stats]);
  if (isScreenReaderEnabled) {
    return (
      <Box flexDirection="column" width={terminalWidth}>
        <Text bold>Confirm Rewind</Text>

        {stats && (
          <Box flexDirection="column">
            <Text>
              {stats.fileCount === 1
                ? `File: ${stats.details?.at(0)?.fileName}`
                : `${stats.fileCount} files affected`}
            </Text>
            <Text>Lines added: {stats.addedLines}</Text>
            <Text>Lines removed: {stats.removedLines}</Text>
            {timestamp && <Text>({formatTimeAgo(timestamp)})</Text>}
            <Text>
              Note: Rewinding does not affect files edited manually or by the
              shell tool.
            </Text>
          </Box>
        )}

        {!stats && (
          <Box>
            <Text color={theme.text.secondary}>No code changes to revert.</Text>
            {timestamp && (
              <Text color={theme.text.secondary}>
                {' '}
                ({formatTimeAgo(timestamp)})
              </Text>
            )}
          </Box>
        )}

        <Text>Select an action:</Text>
        <Text color={theme.text.secondary}>
          Use arrow keys to navigate, Enter to confirm, Esc to cancel.
        </Text>

        <RadioButtonSelect
          items={options}
          onSelect={handleSelect}
          isFocused={true}
        />
      </Box>
    );
  }

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
