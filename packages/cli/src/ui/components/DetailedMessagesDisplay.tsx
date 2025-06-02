/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ConsoleMessageItem } from '../types.js';

interface DetailedMessagesDisplayProps {
  messages: ConsoleMessageItem[];
  // debugMode is not needed here if App.tsx filters debug messages before passing them.
  // If DetailedMessagesDisplay should handle filtering, add debugMode prop.
}

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ messages }) => {
  if (messages.length === 0) {
    return null; // Don't render anything if there are no messages
  }

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.SubtleComment}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.Foreground}>
          Debug Console{' '}
          <Text color={Colors.SubtleComment}>(ctrl+O to close)</Text>
        </Text>
      </Box>
      {messages.map((msg, index) => {
        let textColor = Colors.Foreground;
        let icon = '\u2139'; // Information source (ℹ)

        switch (msg.type) {
          case 'warn':
            textColor = Colors.AccentYellow;
            icon = '\u26A0'; // Warning sign (⚠)
            break;
          case 'error':
            textColor = Colors.AccentRed;
            icon = '\u2716'; // Heavy multiplication x (✖)
            break;
          case 'debug':
            textColor = Colors.SubtleComment; // Or Colors.Gray
            icon = '\u1F50D'; // Left-pointing magnifying glass (????)
            break;
          case 'log':
          default:
            // Default textColor and icon are already set
            break;
        }

        return (
          <Box key={index} flexDirection="row">
            <Text color={textColor}>{icon} </Text>
            <Text color={textColor} wrap="wrap">
              {msg.content}
              {msg.count && msg.count > 1 && (
                <Text color={Colors.SubtleComment}> (x{msg.count})</Text>
              )}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
