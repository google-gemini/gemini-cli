/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';

interface InfoMessageProps {
  text: string;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ text }) => {
  const prefix = 'ℹ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={prefixWidth}>
        <Text color={Colors.AccentYellow}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={Colors.AccentYellow}>
          <RenderInline text={text} />
        </Text>
      </Box>
    </Box>
  );
};
