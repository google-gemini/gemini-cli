/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { getContextUsagePercentage } from '../utils/contextUsage.js';
import { useSettings } from '../contexts/SettingsContext.js';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: {
  promptTokenCount: number;
  model: string;
}) => {
  const settings = useSettings();
  const percentage = getContextUsagePercentage(promptTokenCount, model);
  const percentageUsed = (percentage * 100).toFixed(0);

  const threshold = settings.merged.model?.compressionThreshold ?? 0.5;

  let textColor = theme.text.secondary;
  if (percentage >= 1.0) {
    textColor = theme.status.error;
  } else if (percentage >= threshold) {
    textColor = theme.status.warning;
  }

  const label = '% context used';

  return (
    <Text color={textColor}>
      {percentageUsed}
      {label}
    </Text>
  );
};
