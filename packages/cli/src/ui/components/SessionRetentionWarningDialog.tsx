/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';

interface SessionRetentionWarningDialogProps {
  onKeep120Days: () => void;
  onKeep30Days: () => void;
  sessionsToDeleteCount: number;
}

export const SessionRetentionWarningDialog = ({
  onKeep120Days,
  onKeep30Days,
  sessionsToDeleteCount,
}: SessionRetentionWarningDialogProps) => {
  const options: Array<RadioSelectItem<() => void>> = [
    {
      label: 'Keep for 30 days (Recommended)',
      value: onKeep30Days,
      key: '30days',
      sublabel: `${sessionsToDeleteCount} session${
        sessionsToDeleteCount === 1 ? '' : 's'
      } will be deleted`,
    },
    {
      label: 'Keep for 120 days',
      value: onKeep120Days,
      key: '120days',
      sublabel: 'No sessions will be deleted at this time',
    },
  ];

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      width="100%"
      padding={1}
    >
      <Box marginBottom={1} justifyContent="center" width="100%">
        <Text bold>Keep chat history</Text>
      </Box>

      <Box flexDirection="column" gap={1} marginBottom={1}>
        <Text>
          To keep your workspace clean, we are introducing a limit on how long
          chat sessions are stored. Please choose a retention period for your
          existing chats:
        </Text>
      </Box>

      <Box marginTop={1}>
        <RadioButtonSelect
          items={options}
          onSelect={(action) => action()}
          initialIndex={1}
        />
      </Box>

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Set a custom limit <Text color={theme.text.primary}>/settings</Text>{' '}
          and change &quot;Keep chat history&quot;.
        </Text>
      </Box>
    </Box>
  );
};
