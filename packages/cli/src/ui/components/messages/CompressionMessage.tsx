/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type { CompressionProps } from '../../types.js';
import { CliSpinner } from '../CliSpinner.js';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_MODEL_PREFIX } from '../../textConstants.js';
import { CompressionStatus } from '@google/gemini-cli-core';

export interface CompressionDisplayProps {
  compression: CompressionProps;
}

/*
 * Compression messages appear when the /compress command is run, and show a loading spinner
 * while compression is in progress, followed up by some compression stats.
 */
export function CompressionMessage({
  compression,
}: CompressionDisplayProps): React.JSX.Element {
  const { isPending, beforePercentage, afterPercentage, compressionStatus } =
    compression;

  const getCompressionText = () => {
    if (isPending) {
      return 'Compressing chat history';
    }

    switch (compressionStatus) {
      case CompressionStatus.COMPRESSED:
        return `Context compressed (${beforePercentage}% → ${afterPercentage}%).`;
      case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
        return 'Compression was not beneficial for this history size.';
      case CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR:
        return 'Could not compress chat history due to a token counting error.';
      case CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY:
        return 'Chat history compression failed: empty summary.';
      case CompressionStatus.NOOP:
        return 'Nothing to compress.';
      default:
        return '';
    }
  };

  const text = getCompressionText();

  return (
    <Box flexDirection="row" paddingLeft={1} marginBottom={1}>
      <Box marginRight={1}>{isPending && <CliSpinner type="dots" />}</Box>
      <Box>
        <Text
          color={theme.text.secondary}
          aria-label={SCREEN_READER_MODEL_PREFIX}
          italic
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
}
