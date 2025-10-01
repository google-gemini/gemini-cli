/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { tokenLimit } from '@google/gemini-cli-core';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: {
  promptTokenCount: number;
  model: string;
}) => {
  const percentage = promptTokenCount / tokenLimit(model);

  return (
    <Text color={theme.text.secondary}>
      ({((1 - percentage) * 100).toFixed(0)}% context left)
    </Text>
  );
};
