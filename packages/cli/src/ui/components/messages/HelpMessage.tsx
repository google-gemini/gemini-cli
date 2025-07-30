/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

interface HelpMessageProps {
  content: string;
}

export const HelpMessage: React.FC<HelpMessageProps> = ({ content }) => {
  const lines = content.split('\n');

  const renderLineWithColors = (line: string, lineIndex: number) => {
    // Parse line for bold sections marked with **
    const parts = line.split(/(\*\*[^*]+\*\*)/g);

    return (
      <Text key={lineIndex} color={Colors.Foreground}>
        {parts.map((part, partIndex) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            // Remove ** markers and render in purple
            const text = part.slice(2, -2);
            return (
              <Text key={partIndex} bold color={Colors.AccentPurple}>
                {text}
              </Text>
            );
          }
          return part;
        })}
      </Text>
    );
  };

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

        // Handle section headers (lines like "**Basics:**" or "**Commands:**")
        if (line.endsWith(':') && line.startsWith('**') && line.includes('**')) {
          return (
            <Text key={index} bold color={Colors.Foreground}>
              {line.replace(/\*\*/g, '')}
            </Text>
          );
        }

        // Handle indented lines (subcommands)
        if (line.startsWith('   ')) {
          return (
            <Box key={index} marginLeft={2}>
              {renderLineWithColors(line.trim(), index)}
            </Box>
          );
        }

        // Handle command entries and regular text with colors
        if (line.includes('**')) {
          return renderLineWithColors(line, index);
        }

        // Regular text without formatting
        return (
          <Text key={index} color={Colors.Foreground}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
};
