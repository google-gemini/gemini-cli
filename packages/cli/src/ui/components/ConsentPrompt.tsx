/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { type ReactNode } from 'react';
import { theme } from '../semantic-colors.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DialogFooter } from './shared/DialogFooter.js';

type ConsentPromptProps = {
  // If a simple string is given, it will render using markdown by default.
  prompt: ReactNode;
  onConfirm: (value: boolean) => void;
  terminalWidth: number;
};

export const ConsentPrompt = (props: ConsentPromptProps) => {
  const { prompt, onConfirm, terminalWidth } = props;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
    >
      {typeof prompt === 'string' ? (
        <MarkdownDisplay
          isPending={true}
          text={prompt}
          terminalWidth={terminalWidth}
        />
      ) : (
        prompt
      )}
      <Box marginTop={1} flexDirection="column">
        <RadioButtonSelect
          items={[
            { label: 'Yes', value: true, key: 'Yes' },
            { label: 'No', value: false, key: 'No' },
          ]}
          onSelect={onConfirm}
        />
        <DialogFooter
          primaryAction="Enter to select"
          navigationActions="↑/↓ to navigate"
        />
      </Box>
    </Box>
  );
};
