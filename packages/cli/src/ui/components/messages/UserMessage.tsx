/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';

interface UserMessageProps {
  text: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={Colors.SubtleComment}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    </Box>
  );
};
