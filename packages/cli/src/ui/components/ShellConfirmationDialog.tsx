/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolConfirmationOutcome } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import type React from 'react';
import { theme } from '../semantic-colors.js';
import { RenderInline } from '../utils/InlineMarkdownRenderer.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

export interface ShellConfirmationRequest {
  commands: string[];
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    approvedCommands?: string[],
  ) => void;
}

export interface ShellConfirmationDialogProps {
  request: ShellConfirmationRequest;
}

export const ShellConfirmationDialog: React.FC<
  ShellConfirmationDialogProps
> = ({ request }) => {
  const { commands, onConfirm } = request;

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onConfirm(ToolConfirmationOutcome.Cancel);
      }
    },
    { isActive: true },
  );

  const handleSelect = (item: ToolConfirmationOutcome) => {
    if (item === ToolConfirmationOutcome.Cancel) {
      onConfirm(item);
    } else {
      // For both ProceedOnce and ProceedAlways, we approve all the
      // commands that were requested.
      onConfirm(item, commands);
    }
  };

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = [
    {
      label: 'Allow once',
      value: ToolConfirmationOutcome.ProceedOnce,
      key: 'Allow once',
    },
    {
      label: 'Allow for this session',
      value: ToolConfirmationOutcome.ProceedAlways,
      key: 'Allow for this session',
    },
    {
      label: 'No (esc)',
      value: ToolConfirmationOutcome.Cancel,
      key: 'No (esc)',
    },
  ];

  return (
    <Box flexDirection="row" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.warning}
        padding={1}
        flexGrow={1}
        marginLeft={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            Shell Command Execution
          </Text>
          <Text color={theme.text.primary}>
            A custom command wants to run the following shell commands:
          </Text>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
            marginTop={1}
          >
            {commands.map((cmd) => (
              <Text key={cmd} color={theme.text.link}>
                <RenderInline text={cmd} defaultColor={theme.text.link} />
              </Text>
            ))}
          </Box>
        </Box>

        <Box marginBottom={1}>
          <Text color={theme.text.primary}>Do you want to proceed?</Text>
        </Box>

        <RadioButtonSelect items={options} onSelect={handleSelect} isFocused />
      </Box>
    </Box>
  );
};
