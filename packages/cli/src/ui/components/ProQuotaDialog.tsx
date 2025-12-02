/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  UserTierId,
} from '@google/gemini-cli-core';

interface ProQuotaDialogProps {
  failedModel: string;
  fallbackModel: string;
  message: string;
  isTerminalQuotaError: boolean;
  isModelNotFoundError?: boolean;
  onChoice: (
    choice: 'retry_later' | 'retry_once' | 'retry_always' | 'upgrade',
  ) => void;
  userTier: UserTierId | undefined;
}

export function ProQuotaDialog({
  failedModel,
  fallbackModel,
  message,
  isTerminalQuotaError,
  isModelNotFoundError,
  onChoice,
  userTier,
}: ProQuotaDialogProps): React.JSX.Element {
  // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
  const isPaidTier =
    userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;
  let items;
  // flash and flash lite don't have options to switch or upgrade.
  if (
    failedModel === DEFAULT_GEMINI_FLASH_MODEL ||
    failedModel === DEFAULT_GEMINI_FLASH_LITE_MODEL
  ) {
    items = [
      {
        label: 'Keep trying',
        value: 'retry_once' as const,
        key: 'retry_once',
      },
      {
        label: 'Stop',
        value: 'retry_later' as const,
        key: 'retry_later',
      },
    ];
  } else if (isModelNotFoundError || (isTerminalQuotaError && isPaidTier)) {
    // out of quota
    items = [
      {
        label: `Switch to ${fallbackModel}`,
        value: 'retry_always' as const,
        key: 'retry_always',
      },
      {
        label: `Stop`,
        value: 'retry_later' as const,
        key: 'retry_later',
      },
    ];
  } else if (isTerminalQuotaError && !isPaidTier) {
    // free user gets an option to upgrade
    items = [
      {
        label: `Switch to ${fallbackModel}`,
        value: 'retry_always' as const,
        key: 'retry_always',
      },
      {
        label: 'Upgrade for higher limits',
        value: 'upgrade' as const,
        key: 'upgrade',
      },
      {
        label: `Stop`,
        value: 'retry_later' as const,
        key: 'retry_later',
      },
    ];
  } else {
    // capacity error
    items = [
      {
        label: 'Keep trying',
        value: 'retry_once' as const,
        key: 'retry_once',
      },
      {
        label: `Switch to ${fallbackModel}`,
        value: 'retry_always' as const,
        key: 'retry_always',
      },
      {
        label: 'Stop',
        value: 'retry_later' as const,
        key: 'retry_later',
      },
    ];
  }

  const handleSelect = (
    choice: 'retry_later' | 'retry_once' | 'retry_always' | 'upgrade',
  ) => {
    onChoice(choice);
  };

  return (
    <Box borderStyle="round" flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect items={items} onSelect={handleSelect} />
      </Box>
      <Text color={theme.text.primary}>
        {fallbackModel === DEFAULT_GEMINI_MODEL && !isModelNotFoundError
          ? 'Note: We will periodically retry Preview Model to see if congestion has cleared.'
          : 'Note: You can always use /model to select a different option.'}
      </Text>
    </Box>
  );
}
