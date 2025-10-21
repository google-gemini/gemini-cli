/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

export type LoopDetectionConfirmationResult = {
  userSelection: 'disable' | 'keep';
};

interface LoopDetectionConfirmationProps {
  onComplete: (result: LoopDetectionConfirmationResult) => void;
}

export function LoopDetectionConfirmation({
  onComplete,
}: LoopDetectionConfirmationProps) {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onComplete({
          userSelection: 'keep',
        });
      }
    },
    { isActive: true },
  );

  const OPTIONS: Array<RadioSelectItem<LoopDetectionConfirmationResult>> = [
    {
      label: 'Keep loop detection enabled (esc)',
      value: {
        userSelection: 'keep',
      },
      key: 'Keep loop detection enabled (esc)',
    },
    {
      label: 'Disable loop detection for this session',
      value: {
        userSelection: 'disable',
      },
      key: 'Disable loop detection for this session',
    },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      width="100%"
      marginLeft={1}
    >
      <Box paddingX={1} paddingY={0} flexDirection="column">
        <Box minHeight={1}>
          <Box minWidth={3}>
            <Text color={theme.status.warning} aria-label="Loop detected:">
              ?
            </Text>
          </Box>
          <Box>
            <Text wrap="truncate-end">
              <Text color={theme.text.primary} bold>
                A potential loop was detected
              </Text>{' '}
            </Text>
          </Box>
        </Box>
        <Box width="100%" marginTop={1}>
          <Box flexDirection="column">
            <Text color={theme.text.secondary}>
              This can happen due to repetitive tool calls or other model
              behavior. Do you want to keep loop detection enabled or disable it
              for this session?
            </Text>
            <Box marginTop={1}>
              <RadioButtonSelect items={OPTIONS} onSelect={onComplete} />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
