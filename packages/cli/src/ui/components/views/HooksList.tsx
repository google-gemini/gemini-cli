/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../../semantic-colors.js';

interface HooksListProps {
  hooks: ReadonlyArray<{
    config: {
      command?: string;
      type: string;
      name?: string;
      description?: string;
      timeout?: number;
    };
    source: string;
    eventName: string;
    matcher?: string;
    sequential?: boolean;
    enabled: boolean;
  }>;
}

export const HooksList: React.FC<HooksListProps> = ({ hooks }) => {
  const { t } = useTranslation('ui');
  if (hooks.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text>{t('hooksList.noHooks')}</Text>
      </Box>
    );
  }

  // Group hooks by event name for better organization
  const hooksByEvent = hooks.reduce(
    (acc, hook) => {
      if (!acc[hook.eventName]) {
        acc[hook.eventName] = [];
      }
      acc[hook.eventName].push(hook);
      return acc;
    },
    {} as Record<string, Array<(typeof hooks)[number]>>,
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column">
        <Text color={theme.status.warning} bold underline>
          {t('hooksList.securityWarning.title')}
        </Text>
        <Text color={theme.status.warning}>
          {t('hooksList.securityWarning.body')}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          {t('hooksList.learnMore')}
          <Text color={theme.text.link}>https://geminicli.com/docs/hooks</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>{t('hooksList.configuredHooks')}</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={2} marginTop={1}>
        {Object.entries(hooksByEvent).map(([eventName, eventHooks]) => (
          <Box key={eventName} flexDirection="column" marginBottom={1}>
            <Text color={theme.text.accent} bold>
              {eventName}:
            </Text>
            <Box flexDirection="column" paddingLeft={2}>
              {eventHooks.map((hook, index) => {
                const hookName =
                  hook.config.name || hook.config.command || 'unknown';
                const statusColor = hook.enabled
                  ? theme.status.success
                  : theme.text.secondary;
                const statusText = hook.enabled
                  ? t('hooksList.status.enabled')
                  : t('hooksList.status.disabled');

                return (
                  <Box key={`${eventName}-${index}`} flexDirection="column">
                    <Box>
                      <Text>
                        <Text color={theme.text.accent}>{hookName}</Text>
                        <Text color={statusColor}>{` [${statusText}]`}</Text>
                      </Text>
                    </Box>
                    <Box paddingLeft={2} flexDirection="column">
                      {hook.config.description && (
                        <Text italic>{hook.config.description}</Text>
                      )}
                      <Text dimColor>
                        {t('hooksList.labels.source')}
                        {hook.source}
                        {hook.config.name &&
                          hook.config.command &&
                          `${t('hooksList.labels.command')}${hook.config.command}`}
                        {hook.matcher &&
                          `${t('hooksList.labels.matcher')}${hook.matcher}`}
                        {hook.sequential && t('hooksList.labels.sequential')}
                        {hook.config.timeout &&
                          t('hooksList.labels.timeout', {
                            seconds: hook.config.timeout,
                          })}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{t('hooksList.tip')}</Text>
      </Box>
    </Box>
  );
};
