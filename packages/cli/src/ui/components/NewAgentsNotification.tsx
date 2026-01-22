/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { type AgentDefinition } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';

export enum NewAgentsChoice {
  ACKNOWLEDGE = 'acknowledge',
  IGNORE = 'ignore',
}

interface NewAgentsNotificationProps {
  agents: AgentDefinition[];
  onSelect: (choice: NewAgentsChoice) => void;
}

export const NewAgentsNotification = ({
  agents,
  onSelect,
}: NewAgentsNotificationProps) => {
  const options: Array<RadioSelectItem<NewAgentsChoice>> = [
    {
      label: 'Acknowledge and Enable',
      value: NewAgentsChoice.ACKNOWLEDGE,
      key: 'acknowledge',
    },
    {
      label: 'Do not enable (Ask again next time)',
      value: NewAgentsChoice.IGNORE,
      key: 'ignore',
    },
  ];

  // Limit display to 5 agents to avoid overflow, show count for rest
  const displayAgents = agents.slice(0, 5);
  const remaining = agents.length - 5;

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.warning}
        padding={1}
        marginLeft={1}
        marginRight={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            New Agents Discovered
          </Text>
          <Text color={theme.text.primary}>
            The following agents were found in this project. Please review them:
          </Text>
          <Box
            flexDirection="column"
            marginTop={1}
            marginBottom={1}
            borderStyle="single"
            padding={1}
          >
            {displayAgents.map((agent) => (
              <Box key={agent.name} flexDirection="column" marginBottom={1}>
                <Text bold>- {agent.name}</Text>
                <Text color="gray"> {agent.description}</Text>
              </Box>
            ))}
            {remaining > 0 && (
              <Text color="gray">... and {remaining} more.</Text>
            )}
          </Box>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={onSelect}
          isFocused={true}
        />
      </Box>
    </Box>
  );
};
