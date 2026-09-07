/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionMessage } from '@zoe/core';

export interface MessageListProps {
  messages: SessionMessage[];
}

export function MessageList({ messages }: MessageListProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <Box key={msg.id} marginY={0}>
              <Text color="gray">zoe &gt; </Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          );
        }
        if (msg.role === 'system') {
          return (
            <Box key={msg.id} marginY={0}>
              <Text color="yellow">{msg.content}</Text>
            </Box>
          );
        }
        return (
          <Box key={msg.id} marginY={0}>
            <Text color="white">{msg.content}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
