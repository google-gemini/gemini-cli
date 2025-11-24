/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface GoalSelectionPromptProps {
  goals: string[];
  onSelect: (goal: string | null) => void;
  terminalWidth: number;
}

export const GoalSelectionPrompt = (props: GoalSelectionPromptProps) => {
  const { goals, onSelect, terminalWidth } = props;

  const items = [
    ...goals.map((goal) => ({
      label: goal,
      value: goal,
      key: goal,
    })),
    {
      label: 'Skip - proceed without goal focus',
      value: null,
      key: 'skip',
    },
  ];

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      width={Math.min(terminalWidth - 4, 100)}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Context window is filling up
        </Text>
        <Text color={theme.text.secondary}>
          We&apos;ll compress the conversation to free up space.
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>What are you working on?</Text>
        <Text color={theme.text.secondary} dimColor>
          This helps prioritize what to keep in memory.
        </Text>
      </Box>

      <Box marginTop={1}>
        <RadioButtonSelect items={items} onSelect={onSelect} />
      </Box>
    </Box>
  );
};
