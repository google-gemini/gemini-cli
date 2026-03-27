/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import type { ChannelInfo } from '../../types.js';

interface ChannelsListProps {
  channels: readonly ChannelInfo[];
}

export const ChannelsList: React.FC<ChannelsListProps> = ({ channels }) => {
  if (channels.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.primary}>No active channels.</Text>
        <Text color={theme.text.secondary}>
          <RenderInline
            text="Use `--channels <name>` to listen for channel messages from MCP servers."
            defaultColor={theme.text.secondary}
          />
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.text.primary}>
        Active channels:
      </Text>
      <Box height={1} />
      <Box flexDirection="column">
        {channels.map((channel) => (
          <Box key={channel.name} flexDirection="row">
            <Text color={theme.text.primary}>{'  '}- </Text>
            <Box flexDirection="column">
              <Text bold color={theme.text.accent}>
                {channel.displayName || channel.name} ({channel.name})
              </Text>
              <Text color={theme.text.secondary}>
                Direction:{' '}
                <Text
                  color={channel.supportsReply ? 'green' : theme.text.secondary}
                >
                  {channel.supportsReply ? 'two-way' : 'one-way'}
                </Text>
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
