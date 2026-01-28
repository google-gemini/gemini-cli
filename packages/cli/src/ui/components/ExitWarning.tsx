/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { useUIState } from '../contexts/UIStateContext.js';
import { theme } from '../semantic-colors.js';

export const ExitWarning: React.FC = () => {
  const { t } = useTranslation('ui');
  const uiState = useUIState();
  return (
    <>
      {uiState.dialogsVisible && uiState.ctrlCPressedOnce && (
        <Box marginTop={1}>
          <Text color={theme.status.warning}>{t('exitWarning.ctrlC')}</Text>
        </Box>
      )}

      {uiState.dialogsVisible && uiState.ctrlDPressedOnce && (
        <Box marginTop={1}>
          <Text color={theme.status.warning}>{t('exitWarning.ctrlD')}</Text>
        </Box>
      )}
    </>
  );
};
