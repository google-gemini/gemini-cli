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
  onCleanUpNow: () => void;
  onCleanUpIn30Days: () => void;
}

export const SessionRetentionWarningDialog = ({
  onCleanUpNow,
  onCleanUpIn30Days,
}: SessionRetentionWarningDialogProps) => {
  const options: Array<RadioSelectItem<() => void>> = [
    {
      label: 'Defer cleanup for 30 days',
      value: onCleanUpIn30Days,
      key: 'defer',
    },
    {
      label: 'Clean up old sessions now',
      value: onCleanUpNow,
      key: 'now',
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
        <Text bold>Session Retention Policy Update</Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        <Text>
          We&apos;re introducing a 60-day default session retention policy to
          keep your workspace clean.
        </Text>
        <Text>
          Existing session data will be affected. Choose how to proceed:
        </Text>
      </Box>

      <Box marginTop={1}>
        <RadioButtonSelect items={options} onSelect={(action) => action()} />
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Text color="gray">
          (You can adjust the retention period with{' '}
          <Text bold>sessionRetention.maxAge</Text> in settings.json)
        </Text>
      </Box>
    </Box>
  );
};
