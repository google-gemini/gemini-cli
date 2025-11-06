/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

interface ProQuotaDialogProps {
  fallbackModel: string;
  onChoice: (choice: 'retry_later' | 'retry') => void;
}

export function ProQuotaDialog({
  fallbackModel,
  onChoice,
}: ProQuotaDialogProps): React.JSX.Element {
  const items = [
    {
      label: 'Try again later',
      value: 'retry_later' as const,
      key: 'retry_later',
    },
    {
      label: `Switch to ${fallbackModel} for the rest of this session`,
      value: 'retry' as const,
      key: 'retry',
    },
  ];

  const handleSelect = (choice: 'retry_later' | 'retry') => {
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
        Note: You can always use /model to select a different option.
      </Text>
    </Box>
  );
}
