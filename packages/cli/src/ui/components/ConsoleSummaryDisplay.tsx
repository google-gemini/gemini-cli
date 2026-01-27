/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';

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

  return (
    <Box>
      {errorCount > 0 && (
        <Text color={theme.status.error}>
          {errorIcon} {t('consoleSummary.errorCount', { count: errorCount })}{' '}
          <Text color={theme.text.secondary}>
            {t('consoleSummary.detailsHint')}
          </Text>
        </Text>
      )}
    </Box>
  );
};
