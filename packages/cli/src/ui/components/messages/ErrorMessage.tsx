/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';

interface ErrorMessageProps {
  text: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ text }) => {
  const prefix = '✕ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Box width={prefixWidth}>
        <Text color={theme.status.error}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={theme.status.error}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
