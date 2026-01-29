/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export interface DialogFooterProps {
  /** The main shortcut (e.g., "Enter to submit") */
  primaryAction: string;
  /** Secondary navigation shortcuts (e.g., "Tab/Shift+Tab to switch questions") */
  navigationActions?: string;
  /** Exit shortcut (defaults to "Esc to cancel") */
  cancelAction?: string;
}

/**
 * A shared footer component for dialogs to ensure consistent styling and formatting
 * of keyboard shortcuts and help text.
 */
export const DialogFooter: React.FC<DialogFooterProps> = ({
  primaryAction,
  navigationActions,
  cancelAction = 'Esc to cancel',
}) => {
  const parts = [primaryAction];
  if (navigationActions) {
    parts.push(navigationActions);
  }
  parts.push(cancelAction);

  return (
    <Box marginTop={1}>
      <Text color={theme.text.secondary}>{parts.join(' · ')}</Text>
    </Box>
  );
};
