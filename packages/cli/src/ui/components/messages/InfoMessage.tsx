/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';

interface InfoMessageProps {
  text: string;
  secondaryText?: string;
  source?: string;
  icon?: string;
  color?: string;
  marginBottom?: number;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({
  text,
  secondaryText,
  source,
  icon,
  color,
  marginBottom,
}) => {
  color ??= theme.status.warning;
  const prefix = icon ?? 'ℹ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row" marginTop={1} marginBottom={marginBottom ?? 0}>
      <Box width={prefixWidth}>
        <Text color={color}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap">
          <RenderInline text={text} defaultColor={color} />
          {secondaryText && (
            <Text color={theme.text.secondary}> {secondaryText}</Text>
          )}
          {source && <Text color={theme.text.secondary}> [{source}]</Text>}
        </Text>
      </Box>
    </Box>
  );
};
