/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';

export const ShellModeIndicator: React.FC = () => {
  const { t } = useTranslation('ui');
  return (
    <Box>
      <Text color={theme.ui.symbol}>
        {t('shellMode.enabled')}
        <Text color={theme.text.secondary}>{t('shellMode.disableHint')}</Text>
      </Text>
    </Box>
  );
};
