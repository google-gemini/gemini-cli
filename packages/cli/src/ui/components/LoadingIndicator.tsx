/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';

interface LoadingIndicatorProps {
  isLoading: boolean;
  showSpinner: boolean;
  currentLoadingPhrase: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  isLoading,
  showSpinner,
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
}) => {
  if (!isLoading) {
    return null;
  }

  return (
    <Box marginTop={1} paddingLeft={0}>
      {showSpinner && (
        <Box marginRight={1}>
          <Spinner type="dots" />
        </Box>
      )}
      <Text color={Colors.AccentPurple}>
        {currentLoadingPhrase}
        {isLoading && ` (esc to cancel, ${elapsedTime}s)`}
      </Text>
      <Box flexGrow={1}>{/* Spacer */}</Box>
      {rightContent && <Box>{rightContent}</Box>}
    </Box>
  );
};
