/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

import { UserTierId } from '@google/gemini-cli-core';

type DialogChoice =
  | 'retry_later'
  | 'retry_once'
  | 'retry_always'
  | 'upgrade'
  | 'gemini-api-key'
  | 'vertex-ai';

interface ProQuotaDialogProps {
  failedModel: string;
  fallbackModel: string;
  message: string;
  isTerminalQuotaError: boolean;
  isModelNotFoundError?: boolean;
  onChoice: (choice: DialogChoice) => void;
  userTier: UserTierId | undefined;
  hasVertexAI?: boolean;
  hasApiKey?: boolean;
}

export function ProQuotaDialog({
  failedModel,
  fallbackModel,
  message,
  isTerminalQuotaError,
  isModelNotFoundError,
  onChoice,
  userTier,
  hasVertexAI,
  hasApiKey,
}: ProQuotaDialogProps): React.JSX.Element {
  // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
  const isPaidTier =
    userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;
  let items: Array<{ label: string; value: DialogChoice; key: string }>;

  // Do not provide a fallback option if failed model and fallbackmodel are same.
  if (failedModel === fallbackModel) {
    items = [
      {
        label: 'Keep trying',
        value: 'retry_once',
        key: 'retry_once',
      },
      {
        label: 'Stop',
        value: 'retry_later',
        key: 'retry_later',
      },
    ];
  } else if (isModelNotFoundError || (isTerminalQuotaError && isPaidTier)) {
    // out of quota
    items = [
      {
        label: `Switch to ${fallbackModel}`,
        value: 'retry_always',
        key: 'retry_always',
      },
      {
        label: `Stop`,
        value: 'retry_later',
        key: 'retry_later',
      },
    ];
  } else if (isTerminalQuotaError && !isPaidTier) {
    // free user gets an option to upgrade
    items = [
      {
        label: `Switch to ${fallbackModel}`,
        value: 'retry_always',
        key: 'retry_always',
      },
      {
        label: 'Upgrade for higher limits',
        value: 'upgrade',
        key: 'upgrade',
      },
      {
        label: `Stop`,
        value: 'retry_later',
        key: 'retry_later',
      },
    ];
  } else {
    // capacity error
    items = [
      {
        label: 'Keep trying',
        value: 'retry_once',
        key: 'retry_once',
      },
      {
        label: 'Stop',
        value: 'retry_later',
        key: 'retry_later',
      },
    ];
  }

  if (hasApiKey) {
    items.unshift({
      label: 'Always fallback to Gemini API key',
      value: 'gemini-api-key',
      key: 'gemini-api-key',
    });
  }

  if (hasVertexAI) {
    items.unshift({
      label: 'Always fallback to Vertex AI',
      value: 'vertex-ai',
      key: 'vertex-ai',
    });
  }

  const handleSelect = (choice: DialogChoice) => {
    onChoice(choice);
  };

  // Helper to highlight simple slash commands in the message
  const renderMessage = (msg: string) => {
    const parts = msg.split(/(\s+)/);
    return (
      <Text>
        {parts.map((part, index) => {
          if (part.startsWith('/')) {
            return (
              <Text key={index} bold color={theme.text.accent}>
                {part}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  return (
    <Box borderStyle="round" flexDirection="column" padding={1}>
      <Box marginBottom={1}>{renderMessage(message)}</Box>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect items={items} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}
