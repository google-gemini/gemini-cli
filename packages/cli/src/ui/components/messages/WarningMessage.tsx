/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';

interface WarningMessageProps {
  text: string;
}

export const WarningMessage: React.FC<WarningMessageProps> = ({ text }) => {
  const prefix = '⚠ ';
  const prefixWidth = 3;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={prefixWidth}>
        <Text color={theme.status.warning}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap">
          <RenderInline text={text} defaultColor={theme.status.warning} />
        </Text>
      </Box>
    </Box>
  );
};
