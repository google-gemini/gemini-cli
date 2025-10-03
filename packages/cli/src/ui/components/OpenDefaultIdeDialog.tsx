/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

export interface OpenDefaultIdeDialogProps {
  onChoice: (choice: 'yes' | 'no') => void;
}

export const OpenDefaultIdeDialog: React.FC<OpenDefaultIdeDialogProps> = ({
  onChoice,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onChoice('no');
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<'yes' | 'no'>> = [
    {
      label: 'Yes',
      value: 'yes',
      key: 'Yes',
    },
    {
      label: 'No (esc)',
      value: 'no',
      key: 'No (esc)',
    },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Do you want to open your default IDE?
        </Text>
        <Text color={theme.text.secondary}>
          IDE integration is not supported in your current environment. This
          will open your system&apos;s default IDE for code editing.
        </Text>
      </Box>

      <RadioButtonSelect items={options} onSelect={onChoice} isFocused />
    </Box>
  );
};
