/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { Command, keyMatchers } from '../keyMatchers.js';

export const AdminSettingsChangedDialog = () => {
  const { handleRestart } = useUIActions();

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

  const message =
    'Admin settings have changed. Please restart the session to apply new settings.';

  return (
    <Box borderStyle="round" borderColor={theme.status.warning} paddingX={1}>
      <Text color={theme.status.warning}>
        {message} Press &apos;r&apos; to restart, or &apos;Ctrl+C&apos; twice to
        exit.
      </Text>
    </Box>
  );
};
