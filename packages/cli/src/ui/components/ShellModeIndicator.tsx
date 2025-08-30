/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { Colors } from '../colors.js';

export const ShellModeIndicator: React.FC = () => {
  const { t } = useTranslation('ui');
  return (
    <Box>
      <Text color={Colors.AccentYellow}>
        {t('shellMode.enabled')}
        <Text color={Colors.Gray}>{t('shellMode.escToDisable')}</Text>
      </Text>
    </Box>
  );
};
