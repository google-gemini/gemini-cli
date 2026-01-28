/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { Command, keyMatchers } from '../keyMatchers.js';

export const AdminSettingsChangedDialog = () => {
  const { handleRestart } = useUIActions();
  const { t } = useTranslation('dialogs');

  useKeypress(
    (key) => {
      if (keyMatchers[Command.RESTART_APP](key)) {
        handleRestart();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box borderStyle="round" borderColor={theme.status.warning} paddingX={1}>
      <Text color={theme.status.warning}>
        {t('adminSettings.message')} {t('adminSettings.restartHint')}
      </Text>
    </Box>
  );
};
