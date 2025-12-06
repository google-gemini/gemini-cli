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

export enum LogoutChoice {
  LOGIN = 'login',
  EXIT = 'exit',
}

interface LogoutConfirmationDialogProps {
  onSelect: (choice: LogoutChoice) => void;
}

export const LogoutConfirmationDialog: React.FC<
  LogoutConfirmationDialogProps
> = ({ onSelect }) => {
  const options: Array<RadioSelectItem<LogoutChoice>> = [
    {
      label: 'Login',
      value: LogoutChoice.LOGIN,
      key: 'login',
    },
    {
      label: 'Exit',
      value: LogoutChoice.EXIT,
      key: 'exit',
    },
  ];

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.success}
        padding={1}
        width="100%"
        marginLeft={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            You are now logged out.
          </Text>
          <Text color={theme.text.secondary}>
            Login again to continue using Gemini CLI, or exit the application.
          </Text>
        </Box>

        <RadioButtonSelect items={options} onSelect={onSelect} isFocused />
      </Box>
    </Box>
  );
};
