/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';
import type { ConsoleMessageItem } from '../types.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';

interface DetailedMessagesDisplayProps {
  messages: ConsoleMessageItem[];
  maxHeight: number | undefined;
  width: number;
  // debugMode is not needed here if App.tsx filters debug messages before passing them.
  // If DetailedMessagesDisplay should handle filtering, add debugMode prop.
}

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ messages, maxHeight, width }) => {
  if (messages.length === 0) {
    return null; // Don't render anything if there are no messages
  }

  const borderAndPadding = 4;
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={semanticTheme.border.default}
      paddingX={1}
      width={width}
    >
      <Box marginBottom={1}>
        <Text bold color={semanticTheme.text.primary}>
          Debug Console{' '}
          <Text color={semanticTheme.text.secondary}>(ctrl+o to close)</Text>
        </Text>
      </Box>
      <MaxSizedBox maxHeight={maxHeight} maxWidth={width - borderAndPadding}>
        {messages.map((msg, index) => {
          let textColor = semanticTheme.text.primary;
          let icon = '\u2139'; // Information source (ℹ)

          switch (msg.type) {
            case 'warn':
              textColor = semanticTheme.status.warning;
              icon = '\u26A0'; // Warning sign (⚠)
              break;
            case 'error':
              textColor = semanticTheme.status.error;
              icon = '\u2716'; // Heavy multiplication x (✖)
              break;
            case 'debug':
              textColor = semanticTheme.text.secondary; // Or Colors.Gray
              icon = '\u{1F50D}'; // Left-pointing magnifying glass (🔍)
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
                  <Text color={semanticTheme.text.secondary}>
                    {' '}
                    (x{msg.count})
                  </Text>
                )}
              </Text>
            </Box>
          );
        })}
      </MaxSizedBox>
    </Box>
  );
};
