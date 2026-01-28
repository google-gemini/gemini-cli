/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { theme } from '../semantic-colors.js';

interface ShowMoreLinesProps {
  constrainHeight: boolean;
}

export const ShowMoreLines = ({ constrainHeight }: ShowMoreLinesProps) => {
  const { t } = useTranslation('ui');
  const overflowState = useOverflowState();
  const streamingState = useStreamingContext();

  if (
    overflowState === undefined ||
    overflowState.overflowingIds.size === 0 ||
    !constrainHeight ||
    !(
      streamingState === StreamingState.Idle ||
      streamingState === StreamingState.WaitingForConfirmation
    )
  ) {
    return null;
  }

  return (
    <Box>
      <Text color={theme.text.secondary} wrap="truncate">
        {t('showMoreLines.hint')}
      </Text>
    </Box>
  );
};
