/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
import type { RadioSelectItem } from '../../shared/RadioButtonSelect.js';
import type { NotificationEventType } from '../../../../notifications/types.js';

interface EventProps {
  eventType: NotificationEventType;
  onSelect: (value: boolean) => void;
}

export const Event: React.FC<EventProps> = ({ eventType, onSelect }) => {
  const options: Array<RadioSelectItem<boolean>> = [
    {
      label: 'Yes',
      value: true,
    },
    {
      label: 'No',
      value: false,
    },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Audio Notification Setup</Text>
      <Box marginTop={1}>
        <Text>Enable notification for &quot;{eventType}&quot;?</Text>
      </Box>
      <RadioButtonSelect items={options} onSelect={onSelect} isFocused />
    </Box>
  );
};
