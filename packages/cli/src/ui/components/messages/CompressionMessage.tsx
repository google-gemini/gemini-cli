/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { CompressionProps } from '../../types.js';
import Spinner from 'ink-spinner';
import { Colors } from '../../colors.js';
import { SCREEN_READER_MODEL_PREFIX } from '../../textConstants.js';

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

  const originalTokens = originalTokenCount ?? 0;
  const newTokens = newTokenCount ?? 0;

  const getCompressionText = () => {
    if (isPending) {
      return 'Compressing chat history';
    }

    if (newTokens >= originalTokens) {
      // For smaller histories (< 50k tokens), compression overhead likely exceeds benefits
      if (originalTokens < 50000) {
        return 'Compression was not beneficial for this history size.';
      }
      // For larger histories where compression should work but didn't,
      // this suggests an issue with the compression process itself
      return 'Chat history compression did not reduce size. This may indicate issues with the compression prompt.';
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
        <Text
          color={
            compression.isPending ? Colors.AccentPurple : Colors.AccentGreen
          }
          aria-label={SCREEN_READER_MODEL_PREFIX}
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
};
