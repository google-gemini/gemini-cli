/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

interface DiagramDisplayProps {
  content: string;
}

export const DiagramDisplay: React.FC<DiagramDisplayProps> = ({ content }) => {
  const [header, ...body] = content.split('\n');

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      paddingY={0}
    >
      <Text color={theme.text.accent}>{header}</Text>
      {body.length > 0 ? (
        <Text color={theme.text.primary}>{body.join('\n')}</Text>
      ) : null}
    </Box>
  );
};
