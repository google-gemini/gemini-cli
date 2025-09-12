/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';

const MAX_DISPLAYED_QUEUED_MESSAGES = 3;

export interface QueuedMessageDisplayProps {
  messageQueue: string[];
}

export const QueuedMessageDisplay = ({
  messageQueue,
}: QueuedMessageDisplayProps) => {
  if (messageQueue.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {messageQueue
        .slice(0, MAX_DISPLAYED_QUEUED_MESSAGES)
        .map((message, index) => {
          const preview = message.replace(/\s+/g, ' ');

          return (
            <Box key={index} paddingLeft={2} width="100%">
              <Text dimColor wrap="truncate">
                {preview}
              </Text>
            </Box>
          );
        })}
      {messageQueue.length > MAX_DISPLAYED_QUEUED_MESSAGES && (
        <Box paddingLeft={2}>
          <Text dimColor>
            ... (+
            {messageQueue.length - MAX_DISPLAYED_QUEUED_MESSAGES} more)
          </Text>
        </Box>
      )}
    </Box>
  );
};
