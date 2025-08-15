/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';

interface InfoMessageProps {
  text: string;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ text }) => {
  const prefix = 'ℹ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={prefixWidth}>
        <Text color={theme.status.warning}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={theme.status.warning}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
