/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';

interface HelpMessageProps {
  content: string;
}

export const HelpMessage: React.FC<HelpMessageProps> = ({ content }) => {
  const lines = content.split('\n');

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderColor={Colors.Gray}
      borderStyle="round"
      padding={1}
    >
      {lines.map((line, index) => {
        if (line === '') {
          return <Box key={index} height={1} />;
        }

        // Handle section headers (bold text ending with :)
        if (line.endsWith(':') && line.includes('**')) {
          return (
            <Text key={index} bold color={Colors.Foreground}>
              {line.replace(/\*\*/g, '')}
            </Text>
          );
        }

        // Handle command entries
        if (line.trim().startsWith('**') || line.includes('**')) {
          return (
            <Box key={index} marginLeft={line.startsWith('   ') ? 2 : 0}>
              <RenderInline text={line} />
            </Box>
          );
        }

        // Regular text
        return (
          <Text key={index} color={Colors.Foreground}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
};
