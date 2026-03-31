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
  /** Secondary navigation shortcuts (e.g., "Tab to switch questions") */
  navigationActions?: string;
  /** Exit shortcut (defaults to "Esc to cancel") */
  cancelAction?: string;
  /** Custom keyboard shortcut hints (e.g., ["Ctrl+P to edit"]) */
  extraParts?: React.ReactNode[];
}

/**
 * A shared footer component for dialogs to ensure consistent styling and formatting
 * of keyboard shortcuts and help text.
 */
export const DialogFooter: React.FC<DialogFooterProps> = ({
  primaryAction,
  navigationActions,
  cancelAction = 'Esc to cancel',
  extraParts = [],
}) => {
  const textParts: string[] = [primaryAction];
  if (navigationActions) {
    textParts.push(navigationActions);
  }

  // We split string parts and node parts to properly render nodes without forcing them into a single string join
  const stringExtras = extraParts.filter((p): p is string => typeof p === 'string');
  const nodeExtras = extraParts.filter((p) => typeof p !== 'string');

  textParts.push(...stringExtras);
  textParts.push(cancelAction);

  return (
    <Box marginTop={1} flexDirection="column">
      {nodeExtras.map((part, i) => (
        <Box key={i}>{part}</Box>
      ))}
      <Box>
        <Text color={theme.text.secondary}>{textParts.join(' · ')}</Text>
      </Box>
    </Box>
  );
};
