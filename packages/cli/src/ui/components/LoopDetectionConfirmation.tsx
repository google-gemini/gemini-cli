/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

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
      label: 'No, keep loop detection enabled and stop (esc)',
      value: {
        userSelection: 'keep',
      },
    },
    {
      label: 'Yes, disable loop detection for this session',
      value: {
        userSelection: 'disable',
      },
    },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text>
          <Text color="yellow">⚠️ </Text>
          Loop Detection Alert
        </Text>
        <Text dimColor>
          A potential loop was detected. This can happen due to repetitive tool
          calls or other model behavior patterns.
        </Text>
        <Text dimColor>
          Would you like to disable loop detection for this session and
          continue?
        </Text>
      </Box>
      <RadioButtonSelect items={OPTIONS} onSelect={onComplete} />
    </Box>
  );
}
