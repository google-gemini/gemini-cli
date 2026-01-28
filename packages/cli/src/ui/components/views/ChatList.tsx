/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../../semantic-colors.js';
import type { ChatDetail } from '../../types.js';

interface ChatListProps {
  chats: readonly ChatDetail[];
}

export const ChatList: React.FC<ChatListProps> = ({ chats }) => {
  const { t } = useTranslation('ui');
  if (chats.length === 0) {
    return <Text>{t('chatList.noChats')}</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>{t('chatList.listTitle')}</Text>
      <Box height={1} />
      {chats.map((chat) => {
        const isoString = chat.mtime;
        const match = isoString.match(
          /(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/,
        );
        const formattedDate = match
          ? `${match[1]} ${match[2]}`
          : t('chatList.invalidDate');
        return (
          <Box key={chat.name} flexDirection="row">
            <Text>
              {'  '}- <Text color={theme.text.accent}>{chat.name}</Text>{' '}
              <Text color={theme.text.secondary}>({formattedDate})</Text>
            </Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text color={theme.text.secondary}>{t('chatList.note')}</Text>
    </Box>
  );
};
