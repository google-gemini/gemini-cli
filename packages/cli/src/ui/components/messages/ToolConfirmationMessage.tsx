/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
} from '../../types.js';
import { PartListUnion } from '@google/genai';
import { DiffRenderer } from './DiffRenderer.js';
import { UI_WIDTH } from '../../constants.js';
import { Colors } from '../../colors.js';

export interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
  onSubmit: (value: PartListUnion) => void;
}

function isEditDetails(
  props: ToolCallConfirmationDetails,
): props is ToolEditConfirmationDetails {
  return (props as ToolEditConfirmationDetails).fileName !== undefined;
}

interface InternalOption {
  label: string;
  value: ToolConfirmationOutcome;
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

  const handleSelect = (item: InternalOption) => {
    onConfirm(item.value);
  };

  let bodyContent: React.ReactNode | null = null; // Removed contextDisplay here
  let question: string;
  const options: InternalOption[] = [];

  if (isEditDetails(confirmationDetails)) {
    // Body content is now the DiffRenderer, passing filename to it
    // The bordered box is removed from here and handled within DiffRenderer
    bodyContent = <DiffRenderer diffContent={confirmationDetails.fileDiff} />;

    question = `Apply this change?`;
    options.push(
      {
        label: '1. Yes, apply change',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: '2. Yes, always apply file edits',
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: '3. No (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  } else {
    const executionProps =
      confirmationDetails as ToolExecuteConfirmationDetails;

    // For execution, we still need context display and description
    const commandDisplay = (
      <Text color={Colors.AccentCyan}>{executionProps.command}</Text>
    );

    // Combine command and description into bodyContent for layout consistency
    bodyContent = (
      <Box flexDirection="column">
        <Box paddingX={1} marginLeft={1}>
          {commandDisplay}
        </Box>
      </Box>
    );

    question = `Allow execution?`;
    const alwaysLabel = `2. Yes, always allow '${executionProps.rootCommand}' commands`;
    options.push(
      {
        label: '1. Yes, allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: alwaysLabel,
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: '3. No (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  }

  return (
    <Box flexDirection="column" padding={1} minWidth={UI_WIDTH}>
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
        <SelectInput items={options} onSelect={handleSelect} />
      </Box>
    </Box>
  );
};
