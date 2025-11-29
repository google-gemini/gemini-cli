/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useEffect, useRef } from 'react';
import { theme } from '../semantic-colors.js';
import { useTimer } from '../hooks/useTimer.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface GoalSelectionPromptProps {
  goals: string[];
  onSelect: (
    goal: string | 'auto' | 'other' | 'disable' | 'less_frequent' | null,
  ) => void;
  terminalWidth: number;
  timeoutSeconds?: number;
  /**
   * When true (safety valve triggered), opt-out options are hidden
   * as compression is mandatory at high utilization.
   */
  isSafetyValve?: boolean;
}

export const GoalSelectionPrompt = (props: GoalSelectionPromptProps) => {
  const { goals, onSelect, terminalWidth, timeoutSeconds, isSafetyValve } =
    props;

  // Track whether user has already made a selection
  const hasSelectedRef = useRef(false);

  // Use timer to track elapsed time
  const elapsedTime = useTimer(timeoutSeconds !== undefined, 0);

  // Calculate remaining time
  const remainingTime =
    timeoutSeconds !== undefined
      ? Math.max(0, timeoutSeconds - elapsedTime)
      : null;

  // Trigger auto-select when countdown reaches zero
  useEffect(() => {
    if (remainingTime === 0 && !hasSelectedRef.current) {
      hasSelectedRef.current = true;
      onSelect('auto');
    }
  }, [remainingTime, onSelect]);

  // Wrap onSelect to track user selection
  const handleSelect = (
    value: string | 'auto' | 'other' | 'disable' | 'less_frequent' | null,
  ) => {
    if (!hasSelectedRef.current) {
      hasSelectedRef.current = true;
      onSelect(value);
    }
  };

  // Build menu items - opt-out options hidden when safety valve triggers
  const items = [
    ...goals.map((goal) => ({
      label: goal,
      value: goal,
      key: goal,
    })),
    {
      label: 'Auto-compress (default behavior)',
      value: 'auto',
      key: 'auto',
    },
    {
      label: 'Other (specify)',
      value: 'other',
      key: 'other',
    },
    // Only show opt-out options when NOT safety valve
    // At safety valve, compression is mandatory
    ...(isSafetyValve
      ? []
      : [
          {
            label: "Don't ask me again",
            value: 'disable',
            key: 'disable',
          },
          {
            label: 'Check in less often',
            value: 'less_frequent',
            key: 'less_frequent',
          },
        ]),
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
        <Text
          bold
          color={isSafetyValve ? theme.status.warning : theme.text.primary}
        >
          {isSafetyValve
            ? 'Context window nearly full - compression required'
            : 'Context window is filling up'}
        </Text>
        <Text color={theme.text.secondary}>
          {isSafetyValve
            ? 'Compressing now to avoid hitting context limits.'
            : "We'll compress the conversation to free up space."}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>What are you working on?</Text>
        <Text color={theme.text.secondary} dimColor>
          This helps prioritize what to keep in memory.
        </Text>
      </Box>

      <Box marginTop={1}>
        <RadioButtonSelect items={items} onSelect={handleSelect} />
      </Box>

      {remainingTime !== null && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary} dimColor>
            auto in {remainingTime}s
          </Text>
        </Box>
      )}
    </Box>
  );
};
