/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { CompressionProps } from '../../types.js';
import Spinner from 'ink-spinner';
import { Colors } from '../../colors.js';

export interface CompressionDisplayProps {
  compression: CompressionProps;
}

/*
 * Compression messages appear when the /compress command is run, and show a loading spinner
 * while compression is in progress, followed up by some compression stats.
 */
export const CompressionMessage: React.FC<CompressionDisplayProps> = ({
  compression,
}) => {
  const { isPending, originalTokenCount, newTokenCount } = compression;

  const getCompressionText = () => {
    if (isPending) {
      return 'Compressing chat history';
    }

    const originalTokens = originalTokenCount ?? 0;
    const newTokens = newTokenCount ?? 0;

    if (newTokens >= originalTokens) {
      return 'Skipping compression for small history as the process would have increased its size.';
    }

    return `Chat history compressed from ${originalTokens} to ${newTokens} tokens.`;
  };

  const text = getCompressionText();

  return (
    <Box flexDirection="row">
      <Box marginRight={1}>
        {isPending ? (
          <Spinner type="dots" />
        ) : (
          <Text color={Colors.AccentPurple}>✦</Text>
        )}
      </Box>
      <Box>
        <Text color={isPending ? Colors.AccentPurple : Colors.AccentGreen}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
