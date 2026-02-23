/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { getContextUsagePercentage } from '../utils/contextUsage.js';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: {
  promptTokenCount: number;
  model: string;
}) => {
  const percentage = getContextUsagePercentage(promptTokenCount, model);
  const percentageUsed = (percentage * 100).toFixed(0);

  let textColor = theme.text.secondary;
  if (percentage >= 1.0) {
    textColor = theme.status.error;
  } else if (percentage >= 0.8) {
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
