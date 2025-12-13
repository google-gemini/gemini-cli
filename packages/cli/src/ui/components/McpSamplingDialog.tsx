/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type { SamplingMessage } from '@modelcontextprotocol/sdk/types.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { Scrollable } from './shared/Scrollable.js';
import { theme } from '../semantic-colors.js';

/**
 * Extract text content from an MCP message content object.
 */
function getMessageText(content: SamplingMessage['content']): string {
  if (typeof content === 'object' && content !== null) {
    if ('text' in content && typeof content.text === 'string') {
      return content.text;
    }
    if ('type' in content) {
      // For non-text content types (image, audio), show the type
      return `[${content.type} content]`;
    }
  }
  return JSON.stringify(content);
}

export function McpSamplingDialog({
  serverName,
  prompt,
  onConfirm,
  onReject,
  availableTerminalHeight,
}: {
  serverName: string;
  prompt: SamplingMessage[];
  onConfirm: () => void;
  onReject: () => void;
  availableTerminalHeight?: number;
}) {
  // Account for border (2) + padding (2) + title (1) + margin (1) +
  // prompt border (2) + prompt padding (2) + margin (1) + buttons (2)
  const scrollableHeight = availableTerminalHeight
    ? availableTerminalHeight - 13
    : undefined;

  const content = (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      {prompt.map((message, index) => (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.secondary}>
            {message.role === 'user' ? 'User' : 'Assistant'}:
          </Text>
          <Text color={theme.text.primary}>
            {getMessageText(message.content)}
          </Text>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box>
        <Text>
          MCP server <Text bold>{serverName}</Text> wants to run a prompt:
        </Text>
      </Box>
      <Box marginTop={1}>
        {scrollableHeight ? (
          <Scrollable height={scrollableHeight} hasFocus={true}>
            {content}
          </Scrollable>
        ) : (
          content
        )}
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={[
            { label: 'Approve', value: true, key: 'Approve' },
            { label: 'Reject', value: false, key: 'Reject' },
          ]}
          onSelect={(value) => {
            if (value) {
              onConfirm();
            } else {
              onReject();
            }
          }}
        />
      </Box>
    </Box>
  );
}
