/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Box, Text } from 'ink';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import type { PlanCompletionRequest } from '../types.js';

type PlanChoice = 'execute' | 'save' | 'refine' | 'cancel';

interface PlanCompletionDialogProps {
  request: PlanCompletionRequest;
}

export function PlanCompletionDialog({ request }: PlanCompletionDialogProps) {
  const [isRefining, setIsRefining] = useState(false);
  const { mainAreaWidth } = useUIState();
  const viewportWidth = Math.max(mainAreaWidth - 10, 40);

  const buffer = useTextBuffer({
    initialText: '',
    initialCursorOffset: 0,
    viewport: {
      width: viewportWidth,
      height: 3,
    },
    isValidPath: () => false,
    singleLine: false,
  });

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (isRefining) {
          // Go back to options
          setIsRefining(false);
          buffer.setText('');
        } else {
          request.onChoice('cancel');
        }
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
    if (choice === 'refine') {
      setIsRefining(true);
    } else {
      request.onChoice(choice);
    }
  };

  const handleRefineSubmit = (feedback: string) => {
    if (feedback.trim()) {
      request.onChoice('refine', feedback.trim());
    }
  };

  const handleRefineCancel = () => {
    setIsRefining(false);
    buffer.setText('');
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
              {isRefining ? (
                <>
                  <Text color={theme.text.primary}>
                    Enter your feedback to refine the plan:
                  </Text>
                  <Box
                    marginTop={1}
                    borderStyle="round"
                    borderColor={theme.border.focused}
                    paddingX={1}
                  >
                    <TextInput
                      buffer={buffer}
                      onSubmit={handleRefineSubmit}
                      onCancel={handleRefineCancel}
                      placeholder="Type your feedback here..."
                    />
                  </Box>
                  <Box marginTop={1}>
                    <Text color={theme.text.secondary}>
                      Press Enter to submit feedback, Esc to go back
                    </Text>
                  </Box>
                </>
              ) : (
                <>
                  <Text color={theme.text.secondary}>
                    What would you like to do with this plan?
                  </Text>
                  <Box marginTop={1}>
                    <RadioButtonSelect
                      items={OPTIONS}
                      onSelect={handleSelect}
                    />
                  </Box>
                </>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
