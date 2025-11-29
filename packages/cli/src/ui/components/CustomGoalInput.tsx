/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';

interface CustomGoalInputProps {
  onSubmit: (goal: string) => void;
  onCancel: () => void;
  terminalWidth: number;
}

export const CustomGoalInput = (props: CustomGoalInputProps) => {
  const { onSubmit, onCancel, terminalWidth } = props;

  const viewportWidth = Math.min(terminalWidth - 8, 92);

  const buffer = useTextBuffer({
    initialText: '',
    initialCursorOffset: 0,
    viewport: {
      width: viewportWidth,
      height: 2,
    },
    isValidPath: () => false,
    singleLine: true,
  });

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
          Enter your current goal
        </Text>
        <Text color={theme.text.secondary}>
          Describe what you&apos;re working on so we can prioritize relevant
          context.
        </Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={1}
        marginTop={1}
      >
        <TextInput
          buffer={buffer}
          onSubmit={onSubmit}
          onCancel={onCancel}
          placeholder="e.g., Implementing user authentication"
        />
      </Box>

      <Box marginTop={1}>
        <Text color={theme.text.secondary} dimColor>
          Press Enter to submit, Esc to cancel (uses auto-compress)
        </Text>
      </Box>
    </Box>
  );
};
