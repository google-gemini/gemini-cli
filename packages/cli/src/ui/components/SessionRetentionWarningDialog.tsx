/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  DescriptiveRadioButtonSelect,
  type DescriptiveRadioSelectItem,
} from './shared/DescriptiveRadioButtonSelect.js';

export type SessionRetentionChoice = 'graceful' | 'strict';

interface SessionRetentionWarningDialogProps {
  onConfirm: (choice: SessionRetentionChoice) => void;
}

export const SessionRetentionWarningDialog = ({
  onConfirm,
}: SessionRetentionWarningDialogProps): React.JSX.Element => {
  const items: Array<DescriptiveRadioSelectItem<SessionRetentionChoice>> = [
    {
      key: 'graceful',
      title: 'Graceful Cleanup (Recommended)',
      description:
        'Start 60-day limit from today. Existing sessions are safe for now.',
      value: 'graceful',
    },
    {
      key: 'strict',
      title: 'Strict Cleanup',
      description:
        'Apply 60-day limit immediately. Older sessions will be deleted.',
      value: 'strict',
    },
  ];

  return (
    <Box
      borderStyle="round"
      borderColor={theme.status.warning}
      flexDirection="column"
      padding={1}
      width={60}
    >
      <Box marginBottom={1}>
        <Text color={theme.status.warning} bold>
          Session Retention Policy
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          To save disk space, we recommend enabling automatic cleanup of old
          sessions. Please choose how to apply the 60-day retention policy:
        </Text>
      </Box>
      <DescriptiveRadioButtonSelect
        items={items}
        onSelect={onConfirm}
        initialIndex={0}
      />
    </Box>
  );
};
