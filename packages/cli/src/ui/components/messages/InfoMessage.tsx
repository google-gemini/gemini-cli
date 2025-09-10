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

  return (
    <Box flexDirection="row" marginTop={1} gap={1}>
      <Text color={Colors.AccentYellow}>{prefix}</Text>
      <Text wrap="wrap" color={Colors.AccentYellow}>
        <RenderInline text={text} />
      </Text>
    </Box>
  );
};
