/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@google/gemini-cli-core';
import { useI18n } from '../../i18n/hooks.js';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: {
  promptTokenCount: number;
  model: string;
}) => {
  const { t } = useI18n();
  const percentage = promptTokenCount / tokenLimit(model);

  return (
    <Text color={Colors.Gray}>
      ({((1 - percentage) * 100).toFixed(0)}% {t('ui.status.contextLeft')})
    </Text>
  );
};
