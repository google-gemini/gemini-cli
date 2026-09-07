/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionMessage } from '@zoe/core';
import { LiveStatus, StreamingCursor } from './LiveStatus.js';
import { ThoughtBox } from './ThoughtBox.js';

export interface MessageListProps {
  messages: SessionMessage[];
  streamingText?: string;
  streamingThought?: string;
  isProcessing?: boolean;
  statusText?: string;
  startTime?: number;
  showThoughts?: boolean;
}

export function MessageList({
  messages,
  streamingText,
  streamingThought,
  isProcessing,
  statusText,
  startTime,
  showThoughts = true,
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
          <Box key={key} flexDirection="column" marginY={0}>
            {msg.thought && showThoughts ? (
              <ThoughtBox thought={msg.thought} />
            ) : null}
            <Text color="white">{msg.content}</Text>
          </Box>
        );
      })}

      {isProcessing && streamingThought && showThoughts ? (
        <ThoughtBox thought={streamingThought} isStreaming={!streamingText} />
      ) : null}

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
