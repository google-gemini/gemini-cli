/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';

interface ModelMessageProps {
  model: string;
}

export const ModelMessage: React.FC<ModelMessageProps> = ({ model }) => (
  <Box marginLeft={2}>
    <Text color={theme.ui.comment} italic>
      Responding with {model}
    </Text>
  </Box>
);
