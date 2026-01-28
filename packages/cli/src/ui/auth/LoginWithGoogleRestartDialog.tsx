/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { RELAUNCH_EXIT_CODE } from '../../utils/processUtils.js';

interface LoginWithGoogleRestartDialogProps {
  onDismiss: () => void;
  config: Config;
}

export const LoginWithGoogleRestartDialog = ({
  onDismiss,
  config,
}: LoginWithGoogleRestartDialogProps) => {
  const { t } = useTranslation('auth');
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
          await runExitCleanup();
          process.exit(RELAUNCH_EXIT_CODE);
        }, 100);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box borderStyle="round" borderColor={theme.status.warning} paddingX={1}>
      <Text color={theme.status.warning}>
        {t('loginRestart.message')} {t('loginRestart.instructions')}
      </Text>
    </Box>
  );
};
