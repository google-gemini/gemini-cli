/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@google/gemini-cli-core';
import { useTranslation } from '../../i18n/useTranslation.js';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: {
  promptTokenCount: number;
  model: string;
}) => {
  const { t } = useTranslation();
  const percentage = promptTokenCount / tokenLimit(model);
  const remainingPercent = ((1 - percentage) * 100).toFixed(0);

  return (
    <Text color={Colors.Gray}>
      ({t('ui:contextUsage.remaining', { percent: remainingPercent })})
    </Text>
  );
};
