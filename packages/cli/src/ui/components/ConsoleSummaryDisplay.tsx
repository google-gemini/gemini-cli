/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface ConsoleSummaryDisplayProps {
  errorCount: number;
  // logCount is not currently in the plan to be displayed in summary
}

export const ConsoleSummaryDisplay: React.FC<ConsoleSummaryDisplayProps> = ({
  errorCount,
}) => {
  if (errorCount === 0) {
    return null;
  }

  const errorIcon = '\u2716'; // Heavy multiplication x (✖)

  return (
    <Box>
      {errorCount > 0 && (
        <Text color={Colors.AccentRed}>
          {errorIcon} {errorCount} error{errorCount > 1 ? 's' : ''}{' '}
          <Text color={Colors.Gray}>(ctrl+o for details)</Text>
        </Text>
      )}
    </Box>
  );
};
