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
  streamingText?: string;
  isProcessing?: boolean;
}

export function MessageList({ messages, streamingText, isProcessing }: MessageListProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {messages.map((msg, index) => {
        const key = `${msg.id}-${index}`;
        if (msg.role === 'user') {
          return (
            <Box key={key} marginY={0}>
              <Text color="gray">zoe &gt; </Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          );
        }
        if (msg.role === 'system') {
          return (
            <Box key={key} marginY={0}>
              <Text color="yellow">{msg.content}</Text>
            </Box>
          );
        }
        return (
          <Box key={key} marginY={0}>
            <Text color="white">{msg.content}</Text>
          </Box>
        );
      })}

      {isProcessing && !streamingText ? (
        <Box marginY={0}>
          <Text color="cyan" dimColor>Thinking...</Text>
        </Box>
      ) : null}

      {streamingText ? (
        <Box marginY={0}>
          <Text color="white">{streamingText}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
