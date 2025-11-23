/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type ToolDefinition } from '../../types.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface AgentsListProps {
  agents: readonly ToolDefinition[];
  showDescriptions: boolean;
  terminalWidth: number;
}

export const AgentsList: React.FC<AgentsListProps> = ({
  agents,
  showDescriptions,
  terminalWidth,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      Available Agents:
    </Text>
    <Box height={1} />
    {agents.length > 0 ? (
      agents.map((agent) => (
        <Box key={agent.name} flexDirection="row">
          <Text color={theme.text.primary}>
            {'  '}
            {agent.icon ?? '🤖'}{' '}
          </Text>
          <Box flexDirection="column">
            <Text bold color={theme.text.accent}>
              {agent.displayName} ({agent.name})
            </Text>
            {showDescriptions && agent.description && (
              <MarkdownDisplay
                terminalWidth={terminalWidth}
                text={agent.description}
                isPending={false}
              />
            )}
          </Box>
        </Box>
      ))
    ) : (
      <Text color={theme.text.primary}> No agents available</Text>
    )}
  </Box>
);
