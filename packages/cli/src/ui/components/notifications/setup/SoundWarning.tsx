/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
import type { NotificationEventType } from '../../../../notifications/types.js';

interface SoundWarningStepProps {
  eventType: NotificationEventType;
  soundPath: string;
  onSelect: (response: 'disable' | 'custom' | 'continue') => void;
}

export const SoundWarning: React.FC<SoundWarningStepProps> = ({
  eventType,
  soundPath,
  onSelect,
}) => (
  <Box flexDirection="column" padding={1}>
    <Text bold color="red">
      Warning: System Sound Not Found!
    </Text>
    <Box marginTop={1}>
      <Text>
        The default system sound for &quot;{eventType}&quot; was not found on
        your system:
      </Text>
      <Text>{soundPath}</Text>
    </Box>
    <Box marginTop={1}>
      <Text>What would you like to do?</Text>
    </Box>
    <RadioButtonSelect
      items={[
        { label: 'Disable this notification', value: 'disable' },
        { label: 'Use a custom sound', value: 'custom' },
        {
          label: 'Continue anyway (notification might not play)',
          value: 'continue',
        },
      ]}
      onSelect={onSelect}
      isFocused
    />
  </Box>
);
