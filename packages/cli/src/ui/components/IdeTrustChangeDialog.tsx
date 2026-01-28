/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { relaunchApp } from '../../utils/processUtils.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';
import { debugLogger } from '@google/gemini-cli-core';

interface IdeTrustChangeDialogProps {
  reason: RestartReason;
}

export const IdeTrustChangeDialog = ({ reason }: IdeTrustChangeDialogProps) => {
  const { t } = useTranslation('dialogs');

  useKeypress(
    (key) => {
      if (key.name === 'r' || key.name === 'R') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        relaunchApp();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  let message = t('ideTrustChange.changed');
  if (reason === 'NONE') {
    // This should not happen, but provides a fallback and a debug log.
    debugLogger.warn(
      'IdeTrustChangeDialog rendered with unexpected reason "NONE"',
    );
  } else if (reason === 'CONNECTION_CHANGE') {
    message = t('ideTrustChange.changedConnection');
  } else if (reason === 'TRUST_CHANGE') {
    message = t('ideTrustChange.changedTrust');
  }

  return (
    <Box borderStyle="round" borderColor={theme.status.warning} paddingX={1}>
      <Text color={theme.status.warning}>
        {message} {t('ideTrustChange.pressRestart')}
      </Text>
    </Box>
  );
};
