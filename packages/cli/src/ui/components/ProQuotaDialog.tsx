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
  failedModel: string;
  fallbackModel: string;
  hasApiKey: boolean;
  onChoice: (choice: 'auth' | 'continue' | 'api-key') => void;
}

export function ProQuotaDialog({
  failedModel,
  fallbackModel,
  hasApiKey,
  onChoice,
}: ProQuotaDialogProps): React.JSX.Element {
  const items = [
    {
      label: 'Change auth (executes the /auth command)',
      value: 'auth' as const,
      key: 'auth',
    },
    {
      label: `Continue with ${fallbackModel}`,
      value: 'continue' as const,
      key: 'continue',
    },
    ...(hasApiKey
      ? [
          {
            label: 'Always fallback to API key',
            value: 'api-key' as const,
            key: 'api-key',
          },
        ]
      : []),
  ];

  const handleSelect = (choice: 'auth' | 'continue' | 'api-key') => {
    onChoice(choice);
  };

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold color={theme.status.warning}>
        Pro quota limit reached for {failedModel}.
      </Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={1}
          onSelect={handleSelect}
        />
      </Box>
    </Box>
  );
}
