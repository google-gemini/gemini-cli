/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import type { AgentDefinitionJson } from '../../types.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface AgentsStatusProps {
  agents: AgentDefinitionJson[];
  terminalWidth: number;
}

export const AgentsStatus: React.FC<AgentsStatusProps> = ({
  agents,
  terminalWidth,
}) => {
  const localAgents = agents.filter((a) => a.kind === 'local');
  const remoteAgents = agents.filter((a) => a.kind === 'remote');

  if (agents.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text>No agents available.</Text>
      </Box>
    );
  }

  const renderAgentList = (title: string, agentList: AgentDefinitionJson[]) => {
    if (agentList.length === 0) return null;

    return (
      <Box flexDirection="column">
        <Text bold color={theme.text.primary}>
          {title}
        </Text>
        <Box height={1} />
        {agentList.map((agent) => (
          <Box key={agent.name} flexDirection="row">
            <Text color={theme.text.primary}>{'  '}- </Text>
            <Box flexDirection="column">
              <Text bold color={theme.text.accent}>
                {agent.displayName || agent.name}
                {agent.displayName && agent.displayName !== agent.name && (
                  <Text bold={false}> ({agent.name})</Text>
                )}
              </Text>
              {agent.description && (
                <MarkdownDisplay
                  terminalWidth={terminalWidth}
                  text={agent.description}
                  isPending={false}
                />
              )}
            </Box>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {renderAgentList('Local Agents', localAgents)}
      {localAgents.length > 0 && remoteAgents.length > 0 && <Box height={1} />}
      {renderAgentList('Remote Agents', remoteAgents)}
    </Box>
  );
};
