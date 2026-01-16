/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { AgentDefinitionJson } from '../../types.js';
import { SelectableList } from '../shared/SelectableList.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { useKeypress } from '../../hooks/useKeypress.js';

interface AgentsManagerProps {
  agents: AgentDefinitionJson[];
  terminalWidth: number;
}

export const AgentsManager: React.FC<AgentsManagerProps> = ({
  agents,
  terminalWidth,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinitionJson | null>(
    null,
  );

  const handleSelect = useCallback((agent: AgentDefinitionJson) => {
    setSelectedAgent(agent);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  // Handle back with Escape when in detail view
  useKeypress(
    (key) => {
      if (key.name === 'escape' && selectedAgent) {
        handleBack();
      }
    },
    { isActive: !!selectedAgent },
  );

  if (selectedAgent) {
    return (
      <AgentDetail
        agent={selectedAgent}
        terminalWidth={terminalWidth}
        onBack={handleBack}
      />
    );
  }

  return (
    <Box
      flexDirection="column"
      height={Math.min(20, Math.max(5, agents.length + 2))}
      borderStyle="round"
      borderColor={theme.border.default}
    >
      <Box
        paddingX={1}
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
      >
        <Text bold color={theme.text.primary}>
          Available Agents (Select with Enter)
        </Text>
      </Box>
      <SelectableList
        data={agents}
        renderItem={({ item, isSelected }) => (
          <Box paddingX={1}>
            <Text color={isSelected ? theme.text.accent : theme.text.primary}>
              {isSelected ? '> ' : '  '}
            </Text>
            <Text
              color={isSelected ? theme.text.accent : theme.text.primary}
              bold={isSelected}
            >
              {item.displayName || item.name}
            </Text>
            <Text color={theme.text.secondary}> ({item.kind})</Text>
          </Box>
        )}
        estimatedItemHeight={() => 1}
        keyExtractor={(item) => item.name}
        onSelect={handleSelect}
      />
    </Box>
  );
};

const AgentDetail: React.FC<{
  agent: AgentDefinitionJson;
  terminalWidth: number;
  onBack: () => void;
}> = ({ agent, terminalWidth }) => {
  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor={theme.text.accent}
    >
      <Text bold color={theme.text.accent}>
        Agent: {agent.displayName || agent.name}
      </Text>
      <Text color={theme.text.secondary}>{agent.description}</Text>
      <Box height={1} />

      {agent.kind === 'local' && (
        <>
          <Text bold>Configuration:</Text>
          <Box marginLeft={2} flexDirection="column">
            {agent.maxTimeMinutes !== undefined && (
              <Text>Max Time: {agent.maxTimeMinutes} mins</Text>
            )}
            {agent.maxTurns !== undefined && (
              <Text>Max Turns: {agent.maxTurns}</Text>
            )}
          </Box>
          <Box height={1} />

          {agent.tools && agent.tools.length > 0 && (
            <>
              <Text bold>Tools:</Text>
              <Box marginLeft={2} flexDirection="column">
                {agent.tools.map((t) => (
                  <Text key={t}>- {t}</Text>
                ))}
              </Box>
              <Box height={1} />
            </>
          )}

          {agent.systemPrompt && (
            <>
              <Text bold>System Prompt:</Text>
              <Box
                marginLeft={2}
                borderStyle="single"
                borderColor={theme.border.default}
                padding={1}
              >
                <MarkdownDisplay
                  terminalWidth={terminalWidth - 8}
                  text={agent.systemPrompt}
                  isPending={false}
                />
              </Box>
            </>
          )}
        </>
      )}

      {agent.kind === 'remote' && (
        <>
          <Text>Remote Agent</Text>
          {agent.agentCardUrl && <Text>Card URL: {agent.agentCardUrl}</Text>}
        </>
      )}

      <Box height={1} />
      <Text color={theme.text.secondary}>Press Esc to go back</Text>
    </Box>
  );
};
