/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('messages');
  const { isPending, originalTokenCount, newTokenCount, compressionStatus } =
    compression;

  const originalTokens = originalTokenCount ?? 0;
  const newTokens = newTokenCount ?? 0;

  const getCompressionText = () => {
    if (isPending) {
      return t('compression.pending');
    }

    switch (compressionStatus) {
      case CompressionStatus.COMPRESSED:
        return t('compression.success', {
          original: originalTokens,
          new: newTokens,
        });
      case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
        // For smaller histories (< 50k tokens), compression overhead likely exceeds benefits
        if (originalTokens < 50000) {
          return t('compression.failedSmall');
        }
        // For larger histories where compression should work but didn't,
        // this suggests an issue with the compression process itself
        return t('compression.failedLarge');
      case CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR:
        return t('compression.tokenCountError');
      case CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY:
        return t('compression.emptySummary');
      case CompressionStatus.NOOP:
        return t('compression.noop');
      default:
        return '';
    }
  };

  const text = getCompressionText();

  return (
    <Box flexDirection="row">
      <Box marginRight={1}>
        {isPending ? (
          <CliSpinner type="dots" />
        ) : (
          <Text color={theme.text.accent}>✦</Text>
        )}
      </Box>
      <Box>
        <Text
          color={
            compression.isPending ? theme.text.accent : theme.status.success
          }
          aria-label={SCREEN_READER_MODEL_PREFIX}
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
}
