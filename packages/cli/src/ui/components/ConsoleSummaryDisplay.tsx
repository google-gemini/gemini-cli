/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { Colors } from '../colors.js';

interface ConsoleSummaryDisplayProps {
  errorCount: number;
  // logCount is not currently in the plan to be displayed in summary
}

export const ConsoleSummaryDisplay: React.FC<ConsoleSummaryDisplayProps> = ({
  errorCount,
}) => {
  const { t } = useTranslation('ui');

  if (errorCount === 0) {
    return null;
  }

  const errorIcon = '\u2716'; // Heavy multiplication x (✖)
  const errorText = errorCount === 1 ? t('console.error') : t('console.errors');

  return (
    <Box>
      {errorCount > 0 && (
        <Text color={Colors.AccentRed}>
          {errorIcon} {errorCount}
          {errorText}{' '}
          <Text color={Colors.Gray}>{t('console.ctrlOForDetails')}</Text>
        </Text>
      )}
    </Box>
  );
};
