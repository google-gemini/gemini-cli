/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

/** Available choices in the empty wallet dialog */
export type EmptyWalletChoice = 'get_credits' | 'switch_auth' | 'stop';

interface EmptyWalletDialogProps {
  /** The model that hit the quota limit */
  failedModel: string;
  /** Time when access resets (human-readable) */
  resetTime?: string;
  /** Callback when user makes a selection */
  onChoice: (choice: EmptyWalletChoice) => void;
}

export function EmptyWalletDialog({
  failedModel,
  resetTime,
  onChoice,
}: EmptyWalletDialogProps): React.JSX.Element {
  const items = [
    {
      label: 'Get AI Credits - Open browser to purchase credits',
      value: 'get_credits' as const,
      key: 'get_credits',
    },
    {
      label: 'Switch Auth - Use a different authentication mode',
      value: 'switch_auth' as const,
      key: 'switch_auth',
    },
    {
      label: 'Stop - Abort request',
      value: 'stop' as const,
      key: 'stop',
    },
  ];

  const handleSelect = (choice: EmptyWalletChoice) => {
    onChoice(choice);
  };

  return (
    <Box borderStyle="round" flexDirection="column" padding={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text color={theme.status.warning}>
          ⚠️ Usage limit reached for {failedModel}.
        </Text>
        {resetTime && (
          <Text>
            Access resets at {resetTime}. See{' '}
            <Text bold color={theme.text.accent}>
              /stats
            </Text>{' '}
            for usage details.
          </Text>
        )}
      </Box>
      <Box marginBottom={1}>
        <Text>To continue using this model now, purchase more AI Credits.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>How would you like to proceed?</Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect items={items} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}
