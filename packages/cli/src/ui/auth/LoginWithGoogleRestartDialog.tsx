/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { relaunchApp } from '../../utils/processUtils.js';

interface LoginWithGoogleRestartDialogProps {
  onDismiss: () => void;
}

export const LoginWithGoogleRestartDialog = ({
  onDismiss,
}: LoginWithGoogleRestartDialogProps) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onDismiss();
        return true;
      } else if (key.name === 'r' || key.name === 'R') {
        setTimeout(async () => {
          await relaunchApp();
        }, 100);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const message =
    'You have successfully logged in with Google. Gemini CLI needs to be restarted.';

  return (
    <Box borderStyle="round" borderColor={theme.status.warning} paddingX={1}>
      <Text color={theme.status.warning}>
        {message} Press &apos;r&apos; to restart, or &apos;escape&apos; to
        choose a different auth method.
      </Text>
    </Box>
  );
};
