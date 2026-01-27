/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

interface ProQuotaDialogProps {
  failedModel: string;
  fallbackModel: string;
  message: string;
  isTerminalQuotaError: boolean;
  isModelNotFoundError?: boolean;
  onChoice: (
    choice: 'retry_later' | 'retry_once' | 'retry_always' | 'upgrade',
  ) => void;
}

export function ProQuotaDialog({
  failedModel,
  fallbackModel,
  message,
  isTerminalQuotaError,
  isModelNotFoundError,
  onChoice,
}: ProQuotaDialogProps): React.JSX.Element {
  const { t } = useTranslation('dialogs');

  const items = useMemo(() => {
    // Do not provide a fallback option if failed model and fallbackmodel are same.
    if (failedModel === fallbackModel) {
      return [
        {
          label: t('proQuota.keepTrying'),
          value: 'retry_once' as const,
          key: 'retry_once',
        },
        {
          label: t('proQuota.stop'),
          value: 'retry_later' as const,
          key: 'retry_later',
        },
      ];
    }
    if (isModelNotFoundError || isTerminalQuotaError) {
      // free users and out of quota users on G1 pro and Cloud Console gets an option to upgrade
      return [
        {
          label: t('proQuota.switchTo', { model: fallbackModel }),
          value: 'retry_always' as const,
          key: 'retry_always',
        },
        {
          label: t('proQuota.upgrade'),
          value: 'upgrade' as const,
          key: 'upgrade',
        },
        {
          label: t('proQuota.stop'),
          value: 'retry_later' as const,
          key: 'retry_later',
        },
      ];
    }
    // capacity error
    return [
      {
        label: t('proQuota.keepTrying'),
        value: 'retry_once' as const,
        key: 'retry_once',
      },
      {
        label: t('proQuota.switchTo', { model: fallbackModel }),
        value: 'retry_always' as const,
        key: 'retry_always',
      },
      {
        label: t('proQuota.stop'),
        value: 'retry_later' as const,
        key: 'retry_later',
      },
    ];
  }, [
    failedModel,
    fallbackModel,
    isModelNotFoundError,
    isTerminalQuotaError,
    t,
  ]);

  const handleSelect = (
    choice: 'retry_later' | 'retry_once' | 'retry_always' | 'upgrade',
  ) => {
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
