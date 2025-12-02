/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { relaunchApp } from '../../utils/processUtils.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';

interface IdeTrustChangeDialogProps {
  reason: RestartReason;
}

export const IdeTrustChangeDialog = ({ reason }: IdeTrustChangeDialogProps) => {
  useKeypress(
    (key) => {
      if (key.name === 'r' || key.name === 'R') {
        relaunchApp();
      }
    },
    { isActive: true },
  );

  let message = 'Workspace trust has changed.';
  if (reason === 'NONE') {
    // This should not happen, but provides a fallback and a debug log.
    console.error(
      'IdeTrustChangeDialog rendered with unexpected reason "NONE"',
    );
  } else if (reason === 'CONNECTION_CHANGE') {
    message =
      'Workspace trust has changed due to a change in the IDE connection.';
  } else if (reason === 'TRUST_CHANGE') {
    message = 'Workspace trust has changed due to a change in the IDE trust.';
  }

  return (
    <Box borderStyle="round" borderColor={theme.status.warning} paddingX={1}>
      <Text color={theme.status.warning}>
        {message} Press &apos;r&apos; to restart Gemini to apply the changes.
      </Text>
    </Box>
  );
};
