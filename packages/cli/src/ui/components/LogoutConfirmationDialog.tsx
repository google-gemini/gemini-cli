/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

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
  const { t } = useTranslation('dialogs');

  // Handle escape key to exit (consistent with other dialogs)
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(LogoutChoice.EXIT);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<LogoutChoice>> = [
    {
      label: t('logout.loginButton'),
      value: LogoutChoice.LOGIN,
      key: 'login',
    },
    {
      label: t('logout.exitButton'),
      value: LogoutChoice.EXIT,
      key: 'exit',
    },
  ];

  return (
    <Box flexDirection="row" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.focused}
        padding={1}
        flexGrow={1}
        marginLeft={1}
        marginRight={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            {t('logout.title')}
          </Text>
          <Text color={theme.text.secondary}>{t('logout.description')}</Text>
        </Box>

        <RadioButtonSelect items={options} onSelect={onSelect} isFocused />

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>{t('logout.instructions')}</Text>
        </Box>
      </Box>
    </Box>
  );
};
