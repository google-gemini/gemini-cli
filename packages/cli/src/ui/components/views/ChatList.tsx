/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { ChatDetail } from '../../types.js';

interface ChatListProps {
  chats: readonly ChatDetail[];
}

export const ChatList: React.FC<ChatListProps> = ({ chats }) => {
  if (chats.length === 0) {
    return <Text>No saved conversation checkpoints found.</Text>;
  }

  const maxNameLength = Math.max(...chats.map((chat) => chat.name.length));

  return (
    <Box flexDirection="column">
      <Text>List of saved conversations:</Text>
      <Box height={1} />
      {chats.map((chat) => {
        const paddedName = chat.name.padEnd(maxNameLength, ' ');
        const isoString = chat.mtime;
        const match = isoString.match(
          /(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/,
        );
        const formattedDate = match
          ? `${match[1]} ${match[2]}`
          : 'Invalid Date';
        return (
          <Box key={chat.name} flexDirection="row">
            <Text>
              {'  '}- <Text color={theme.text.accent}>{paddedName}</Text>
              {'  '}
              <Text color={theme.text.secondary}>
                (saved on {formattedDate})
              </Text>
            </Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text color={theme.text.secondary}>Note: Newest last, oldest first</Text>
    </Box>
  );
};
