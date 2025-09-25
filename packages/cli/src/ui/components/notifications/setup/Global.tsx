/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
import type { RadioSelectItem } from '../../shared/RadioButtonSelect.js';

interface GlobalProps {
  onSelect: (value: boolean) => void;
}

export const Global: React.FC<GlobalProps> = ({ onSelect }) => {
  const options: Array<RadioSelectItem<boolean>> = [
    {
      label: 'Yes, enable audio notifications',
      value: true,
    },
    {
      label: 'No, disable audio notifications',
      value: false,
    },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Audio Notification Setup</Text>
      <Box marginTop={1}>
        <Text>Do you want to enable audio notifications?</Text>
      </Box>
      <RadioButtonSelect items={options} onSelect={onSelect} isFocused />
    </Box>
  );
};
