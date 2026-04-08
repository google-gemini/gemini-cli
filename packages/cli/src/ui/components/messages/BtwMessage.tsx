/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

interface BtwMessageProps {
  prompt: string;
  text: string;
  isPending: boolean;
  errorText?: string;
}

export const BtwMessage: React.FC<BtwMessageProps> = ({
  prompt,
  text,
  isPending,
  errorText,
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={errorText ? theme.status.error : theme.status.warning}
    paddingX={1}
    marginTop={1}
  >
    <Text color={theme.text.secondary}>BTW: {prompt}</Text>
    <Text wrap="wrap">{text || (isPending ? 'Thinking...' : '')}</Text>
    {errorText && <Text color={theme.status.error}>{errorText}</Text>}
  </Box>
);
