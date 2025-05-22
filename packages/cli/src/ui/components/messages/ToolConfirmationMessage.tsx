/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
} from '@gemini-code/server';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from '../shared/RadioButtonSelect.js';

export interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
}

export const ToolConfirmationMessage: React.FC<
  ToolConfirmationMessageProps
> = ({ confirmationDetails }) => {
  const { onConfirm } = confirmationDetails;

  useInput((_, key) => {
    if (key.escape) {
      onConfirm(ToolConfirmationOutcome.Cancel);
    }
  });

  const handleSelect = (item: ToolConfirmationOutcome) => onConfirm(item);

  let bodyContent: React.ReactNode | null = null; // Removed contextDisplay here
  let question: string;

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = new Array<
    RadioSelectItem<ToolConfirmationOutcome>
  >();

  if (confirmationDetails.type === 'edit') {
    // Body content is now the DiffRenderer, passing filename to it
    // The bordered box is removed from here and handled within DiffRenderer
    bodyContent = (
      <DiffRenderer
        diffContent={confirmationDetails.fileDiff}
        filename={confirmationDetails.fileName}
      />
    );

    question = `Apply this change?`;
    options.push(
      {
        label: 'Yes, allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: 'Yes, allow always',
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  } else {
    const executionProps =
      confirmationDetails as ToolExecuteConfirmationDetails;

    bodyContent = (
      <Box flexDirection="column">
        <Box paddingX={1} marginLeft={1}>
          <Text color={Colors.AccentCyan}>{executionProps.command}</Text>
        </Box>
      </Box>
    );

    question = `Allow execution?`;
    options.push(
      {
        label: 'Yes, allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: `Yes, allow always "${executionProps.rootCommand} ..."`,
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  }

  return (
    <Box flexDirection="column" padding={1} minWidth="90%">
      {/* Body Content (Diff Renderer or Command Info) */}
      {/* No separate context display here anymore for edits */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginBottom={1}>
        {bodyContent}
      </Box>

      {/* Confirmation Question */}
      <Box marginBottom={1} flexShrink={0}>
        <Text>{question}</Text>
      </Box>

      {/* Select Input for Options */}
      <Box flexShrink={0}>
        <RadioButtonSelect items={options} onSelect={handleSelect} />
      </Box>
    </Box>
  );
};
