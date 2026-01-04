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
import type { PlanCompletionRequest } from '../types.js';

type PlanChoice = 'execute' | 'save' | 'refine' | 'cancel';

interface PlanCompletionDialogProps {
  request: PlanCompletionRequest;
}

export function PlanCompletionDialog({ request }: PlanCompletionDialogProps) {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        request.onChoice('cancel');
      }
    },
    { isActive: true },
  );

  const OPTIONS: Array<RadioSelectItem<PlanChoice>> = [
    {
      label: 'Execute - Start implementing the plan',
      value: 'execute',
      key: 'execute',
    },
    {
      label: 'Save - Save plan for later execution',
      value: 'save',
      key: 'save',
    },
    {
      label: 'Refine - Provide feedback to improve the plan',
      value: 'refine',
      key: 'refine',
    },
    {
      label: 'Cancel - Discard and return to prompt (esc)',
      value: 'cancel',
      key: 'cancel',
    },
  ];

  const handleSelect = (choice: PlanChoice) => {
    request.onChoice(choice);
  };

  return (
    <Box width="100%" flexDirection="row">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.text.link}
        flexGrow={1}
        marginLeft={1}
      >
        <Box paddingX={1} paddingY={0} flexDirection="column">
          <Box minHeight={1}>
            <Box minWidth={3}>
              <Text color={theme.text.link} aria-label="Plan ready:">
                ✓
              </Text>
            </Box>
            <Box>
              <Text wrap="truncate-end">
                <Text color={theme.text.primary} bold>
                  Plan Ready: {request.title}
                </Text>
              </Text>
            </Box>
          </Box>
          {request.affectedFiles.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.text.secondary}>
                Files to modify: {request.affectedFiles.length}
              </Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Box flexDirection="column">
              <Text color={theme.text.secondary}>
                What would you like to do with this plan?
              </Text>
              <Box marginTop={1}>
                <RadioButtonSelect items={OPTIONS} onSelect={handleSelect} />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
