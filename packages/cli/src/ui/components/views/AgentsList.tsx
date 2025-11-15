/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type AgentDefinitionDisplay } from '../../types.js';

interface AgentsListProps {
  agents: readonly AgentDefinitionDisplay[];
  terminalWidth: number;
}

export const AgentsList: React.FC<AgentsListProps> = ({
  agents,
  terminalWidth: _terminalWidth,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      Available Agents ({agents.length})
    </Text>
    <Box height={1} />
    {agents.length > 0 ? (
      agents.map((agent) => (
        <Box key={agent.name} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <Text color={theme.text.primary}>{agent.icon} </Text>
            <Text bold color={theme.text.accent}>
              {agent.displayName}
            </Text>
            <Text color={theme.text.secondary}> [{agent.source}]</Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            <Text color={theme.text.secondary}>
              ID: <Text color={theme.text.primary}>{agent.name}</Text>
            </Text>
            <Text color={theme.text.secondary}>
              Description:{' '}
              <Text color={theme.text.primary}>{agent.description}</Text>
            </Text>
            <Text color={theme.text.secondary}>
              Model: <Text color={theme.text.primary}>{agent.model}</Text>
            </Text>
            <Text color={theme.text.secondary}>
              Runtime:{' '}
              <Text color={theme.text.primary}>
                {agent.maxTimeMinutes}min / {agent.maxTurns || '∞'} turns
              </Text>
            </Text>
            <Text color={theme.text.secondary}>
              Tools: <Text color={theme.text.primary}>{agent.tools}</Text>
            </Text>
            <Text color={theme.text.secondary}>
              Inputs: <Text color={theme.text.primary}>{agent.inputs}</Text>
            </Text>
            {agent.filePath && (
              <Text color={theme.text.secondary}>
                File: <Text color={theme.text.primary}>{agent.filePath}</Text>
              </Text>
            )}
          </Box>
        </Box>
      ))
    ) : (
      <Text color={theme.text.primary}> No agents available</Text>
    )}
    <Box height={1} />
    <Text color={theme.text.secondary}>
      💡 To use an agent, invoke it as a tool in your conversation.
    </Text>
    <Text color={theme.text.secondary}>
      📁 Add custom agents to: ~/.gemini/agents/
    </Text>
  </Box>
);
