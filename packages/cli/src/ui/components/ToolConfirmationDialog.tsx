/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { theme } from '../semantic-colors.js';
import { ToolConfirmationMessage } from './messages/ToolConfirmationMessage.js';
import type {
  SerializableToolConfirmationDetails,
  ToolCallConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { ToolConfirmationOutcome } from '@google/gemini-cli-core';

interface ToolConfirmationDialogProps {
  confirmationDetails: SerializableToolConfirmationDetails;
  config: Config;
  onConfirm: (confirmed: boolean) => void;
  terminalWidth: number;
}

export const ToolConfirmationDialog: React.FC<ToolConfirmationDialogProps> = ({
  confirmationDetails,
  config,
  onConfirm,
  terminalWidth,
}) => {
  const details: ToolCallConfirmationDetails = {
    ...confirmationDetails,
    onConfirm: async (outcome: ToolConfirmationOutcome) => {
      const confirmed = outcome !== ToolConfirmationOutcome.Cancel;
      onConfirm(confirmed);
    },
  } as unknown as ToolCallConfirmationDetails;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      flexDirection="column"
      width={terminalWidth}
    >
      <ToolConfirmationMessage
        confirmationDetails={details}
        config={config}
        terminalWidth={terminalWidth - 4}
      />
    </Box>
  );
};
