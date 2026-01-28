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

export const CopyModeWarning: React.FC = () => {
  const { t } = useTranslation('ui');
  const { copyModeEnabled } = useUIState();

  if (!copyModeEnabled) {
    return null;
  }

  return (
    <Box>
      <Text color={theme.status.warning}>{t('copyMode.message')}</Text>
    </Box>
  );
};
