/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@google/gemini-cli-core';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
  terminalWidth,
}: {
  promptTokenCount: number;
  model: string;
  terminalWidth: number;
}) => {
  const percentage = promptTokenCount / tokenLimit(model);
  const percentageLeft = ((1 - percentage) * 100).toFixed(0);

  const label = terminalWidth < 100 ? '%' : '% context left';

  return (
    <Text color={Colors.Gray}>
      ({percentageLeft}
      {label})
    </Text>
  );
};
