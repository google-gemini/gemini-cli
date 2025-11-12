/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

import { PREVIEW_GEMINI_MODEL } from '@google/gemini-cli-core';

interface ProQuotaDialogProps {
  failedModel: string;
  fallbackModel: string;
  onChoice: (choice: 'retry_later' | 'retry_once' | 'retry_always') => void;
}

export function ProQuotaDialog({
  failedModel,
  fallbackModel,
  onChoice,
}: ProQuotaDialogProps): React.JSX.Element {
  let items;

  if (failedModel === PREVIEW_GEMINI_MODEL) {
    items = [
      {
        label: `Continue with ${fallbackModel} (this time)`,
        value: 'retry_once' as const,
        key: 'retry_once',
      },
      {
        label: `Continue with ${fallbackModel} (always)`,
        value: 'retry_always' as const,
        key: 'retry_always',
      },
    ];
  } else {
    items = [
      {
        label: 'Try again later',
        value: 'retry_later' as const,
        key: 'retry_later',
      },
      {
        label: `Switch to ${fallbackModel} for the rest of this session`,
        value: 'retry_always' as const,
        key: 'retry_always',
      },
    ];
  }

  const handleSelect = (
    choice: 'retry_later' | 'retry_once' | 'retry_always',
  ) => {
    onChoice(choice);
  };

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={1}
          onSelect={handleSelect}
        />
      </Box>
      <Text color={theme.text.primary}>
        {failedModel === PREVIEW_GEMINI_MODEL
          ? 'Note: We will periodically retry Preview Model to see if congestion has cleared.'
          : 'Note: You can always use /model to select a different option.'}
      </Text>
    </Box>
  );
}
