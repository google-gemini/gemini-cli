/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { type ReactNode } from 'react';
import { theme } from '../semantic-colors.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { Scrollable } from './shared/Scrollable.js';

type ConsentPromptProps = {
  // If a simple string is given, it will render using markdown by default.
  prompt: ReactNode;
  onConfirm: (value: boolean) => void;
  terminalWidth: number;
  availableTerminalHeight?: number;
};

export const ConsentPrompt = (props: ConsentPromptProps) => {
  const { prompt, onConfirm, terminalWidth, availableTerminalHeight } = props;

  // Account for border (2) + paddingY (2) + marginTop (1) + RadioButtonSelect height (~3)
  const scrollableHeight = availableTerminalHeight
    ? availableTerminalHeight - 8
    : undefined;

  const content = (
    <>
      {typeof prompt === 'string' ? (
        <MarkdownDisplay
          isPending={true}
          text={prompt}
          terminalWidth={terminalWidth - 6}
          availableTerminalHeight={availableTerminalHeight}
        />
      ) : (
        prompt
      )}
      <Box marginTop={1}>
        <RadioButtonSelect
          items={[
            { label: 'Yes', value: true, key: 'Yes' },
            { label: 'No', value: false, key: 'No' },
          ]}
          onSelect={onConfirm}
        />
      </Box>
    </>
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      {scrollableHeight ? (
        <Scrollable height={scrollableHeight} hasFocus={true}>
          {content}
        </Scrollable>
      ) : (
        content
      )}
    </Box>
  );
};
