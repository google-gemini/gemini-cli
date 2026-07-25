/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { relaunchApp } from '../../utils/processUtils.js';

interface LoginRestartDialogProps {
  onDismiss: () => void;
  config: Config;
  message?: string;
}

export const LoginRestartDialog = ({
  onDismiss,
  config,
  message,
}: LoginRestartDialogProps) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onDismiss();
        return true;
      } else if (key.name === 'r' || key.name === 'R') {
        setTimeout(async () => {
          if (process.send) {
            const remoteSettings = config.getRemoteAdminSettings();
            if (remoteSettings) {
              process.send({
                type: 'admin-settings-update',
                settings: remoteSettings,
              });
            }
          }
          await relaunchApp();
        }, 100);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const displayMessage =
    message ??
    "You've successfully signed in with Google. Gemini CLI needs to be restarted.";

  return (
    <Box
      borderStyle="round"
      borderColor={theme.status.warning}
      paddingX={1}
      flexDirection="column"
    >
      <Text color={theme.status.warning}>{displayMessage}</Text>
      <Text color={theme.status.warning}>
        Press R to restart, or Esc to choose a different authentication method.
      </Text>
    </Box>
  );
};
