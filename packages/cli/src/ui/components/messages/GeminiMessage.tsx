/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { MarkdownRenderer } from '../../utils/MarkdownRenderer.js';
import { Colors } from '../../colors.js';

interface GeminiMessageProps {
  text: string;
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({ text }) => {
  const prefix = '✦ ';
  const prefixWidth = prefix.length;
  const renderedBlocks = MarkdownRenderer.render(text);

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={Colors.AccentPurple}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        {renderedBlocks}
      </Box>
    </Box>
  );
};
