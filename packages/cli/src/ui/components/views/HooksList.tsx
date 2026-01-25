/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
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
  if (hooks.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Box marginTop={1}>
          <Text>No hooks configured.</Text>
        </Box>
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
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.status.warning} bold underline>
          ⚠️ Security Warning:
        </Text>
        <Text color={theme.status.warning}>
          Hooks can execute arbitrary commands on your system. Only use hooks
          from sources you trust. Review hook scripts carefully.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          Learn more:{' '}
          <Text color={theme.text.link}>https://geminicli.com/docs/hooks</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Configured Hooks:</Text>
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
                const statusText = hook.enabled ? 'enabled' : 'disabled';

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
                        Source: {hook.source}
                        {hook.config.name &&
                          hook.config.command &&
                          ` | Command: ${hook.config.command}`}
                        {hook.matcher && ` | Matcher: ${hook.matcher}`}
                        {hook.sequential && ` | Sequential`}
                        {hook.config.timeout &&
                          ` | Timeout: ${hook.config.timeout}s`}
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
        <Text dimColor>
          Tip: Use <Text bold>/hooks enable {'<hook-name>'}</Text> or{' '}
          <Text bold>/hooks disable {'<hook-name>'}</Text> to toggle individual
          hooks. Use <Text bold>/hooks enable-all</Text> or{' '}
          <Text bold>/hooks disable-all</Text> to toggle all hooks at once.
        </Text>
      </Box>
    </Box>
  );
};
