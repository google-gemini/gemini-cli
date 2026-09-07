/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionMessage } from '@zoe/core';
import { LiveStatus, StreamingCursor } from './LiveStatus.js';

export interface MessageListProps {
  messages: SessionMessage[];
  streamingText?: string;
  isProcessing?: boolean;
  statusText?: string;
  startTime?: number;
}

export function MessageList({
  messages,
  streamingText,
  isProcessing,
  statusText,
  startTime,
}: MessageListProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {messages.map((msg, index) => {
        const key = `${msg.id}-${index}`;
        if (msg.role === 'user') {
          return (
            <Box key={key} marginY={0}>
              <Text>
                <Text color="gray">zoe &gt; </Text>
                <Text color="white">{msg.content}</Text>
              </Text>
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
        <LiveStatus statusText={statusText} startTime={startTime} />
      ) : null}

      {streamingText ? (
        <Box flexDirection="column" marginY={0}>
          <Text>
            <Text color="white">{streamingText}</Text>
            {isProcessing ? <StreamingCursor /> : null}
          </Text>
          {isProcessing ? (
            <LiveStatus statusText={statusText || 'Streaming response...'} startTime={startTime} />
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
