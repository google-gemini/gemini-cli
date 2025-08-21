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
  hasActualTokenCounts = false,
}: {
  promptTokenCount: number;
  model: string;
  hasActualTokenCounts?: boolean;
}) => {
  const percentage = promptTokenCount / tokenLimit(model);
  const contextLeft = ((1 - percentage) * 100).toFixed(0);
  
  // Show indicator if using estimates vs actual counts
  const indicator = hasActualTokenCounts ? '' : '~';

  return (
    <Text color={Colors.Gray}>
      ({indicator}{contextLeft}% context left)
    </Text>
  );
};
