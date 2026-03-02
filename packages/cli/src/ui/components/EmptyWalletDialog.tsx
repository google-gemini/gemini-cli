/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

/** Available choices in the empty wallet dialog */
export type EmptyWalletChoice = 'get_credits' | 'use_fallback' | 'stop';

interface EmptyWalletDialogProps {
  /** The model that hit the quota limit */
  failedModel: string;
  /** The fallback model to offer (omit if none available) */
  fallbackModel?: string;
  /** Time when access resets (human-readable) */
  resetTime?: string;
  /** Callback to log click and open the browser for purchasing credits */
  onGetCredits?: () => void;
  /** Callback when user makes a selection */
  onChoice: (choice: EmptyWalletChoice) => void;
}

export function EmptyWalletDialog({
  failedModel,
  fallbackModel,
  resetTime,
  onGetCredits,
  onChoice,
}: EmptyWalletDialogProps): React.JSX.Element {
  const items: Array<{
    label: string;
    value: EmptyWalletChoice;
    key: string;
  }> = [
    {
      label: 'Get AI Credits - Open browser to purchase credits',
      value: 'get_credits',
      key: 'get_credits',
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

  const handleSelect = (choice: EmptyWalletChoice) => {
    if (choice === 'get_credits') {
      onGetCredits?.();
    }
    onChoice(choice);
  };

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
        <Text>To continue using this model now, purchase more AI Credits.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Newly purchased AI credits may take a few minutes to update.
        </Text>
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
