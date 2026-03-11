/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

/** Available choices in the overage menu dialog */
export type OverageMenuChoice =
  | 'use_credits'
  | 'use_fallback'
  | 'manage'
  | 'stop';

interface OverageMenuDialogProps {
  /** The model that hit the quota limit */
  failedModel: string;
  /** The fallback model to offer (omit if none available) */
  fallbackModel?: string;
  /** Time when access resets (human-readable) */
  resetTime?: string;
  /** Available G1 AI credit balance */
  creditBalance: number;
  /** Callback when user makes a selection */
  onChoice: (choice: OverageMenuChoice) => void;
}

export function OverageMenuDialog({
  failedModel,
  fallbackModel,
  resetTime,
  creditBalance,
  onChoice,
}: OverageMenuDialogProps): React.JSX.Element {
  const items: Array<{
    label: string;
    value: OverageMenuChoice;
    key: string;
  }> = [
    {
      label: 'Use AI Credits - Continue this request (Overage)',
      value: 'use_credits',
      key: 'use_credits',
    },
    {
      label: 'Manage - View balance and purchase more credits',
      value: 'manage',
      key: 'manage',
    },
  ];

  if (fallbackModel) {
    items.push({
      label: `Switch to ${fallbackModel}`,
      value: 'use_fallback',
      key: 'use_fallback',
    });
  }

  items.push({
    label: 'Stop - Abort request',
    value: 'stop',
    key: 'stop',
  });

  return (
    <Box borderStyle="round" flexDirection="column" padding={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text color={theme.status.warning}>
          Usage limit reached for {failedModel}.
        </Text>
        {resetTime && <Text>Access resets at {resetTime}.</Text>}
        <Text>
          <Text bold color={theme.text.accent}>
            /stats
          </Text>{' '}
          model for usage details
        </Text>
        <Text>
          <Text bold color={theme.text.accent}>
            /model
          </Text>{' '}
          to switch models.
        </Text>
        <Text>
          <Text bold color={theme.text.accent}>
            /auth
          </Text>{' '}
          to switch to API key.
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          You have{' '}
          <Text bold color={theme.status.success}>
            {creditBalance}
          </Text>{' '}
          AI Credits available.
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>How would you like to proceed?</Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect items={items} onSelect={onChoice} />
      </Box>
    </Box>
  );
}
