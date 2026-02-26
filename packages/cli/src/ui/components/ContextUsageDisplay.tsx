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
  terminalWidth,
}: {
  promptTokenCount: number;
  model: string;
  terminalWidth: number;
}) => {
  const percentage = getContextUsagePercentage(promptTokenCount, model);
  const percentageLeft = ((1 - percentage) * 100).toFixed(0);

  const label = terminalWidth < 100 ? '%' : '% context left';

  return (
    <Text color={theme.text.secondary}>
      {percentageLeft}
      {label}
    </Text>
  );
};
