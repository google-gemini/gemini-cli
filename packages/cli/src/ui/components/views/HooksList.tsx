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
  terminalWidth: number;
}

export const HooksList: React.FC<HooksListProps> = ({
  hooks,
  terminalWidth,
}) => {
  if (hooks.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
        marginY={1}
        width={terminalWidth}
        flexShrink={0}
      >
        <Text color={theme.text.primary}>No hooks configured.</Text>
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
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      marginY={1}
      width={terminalWidth}
      flexShrink={0}
      flexGrow={0}
    >
      {/* Security Warning */}
      <Box marginBottom={1} flexDirection="column">
        <Text color={theme.status.warning} bold underline>
          ⚠️ Security Warning:
        </Text>
        <Text color={theme.status.warning} wrap="wrap">
          Hooks can execute arbitrary commands on your system. Only use hooks
          from sources you trust. Review hook scripts carefully.
        </Text>
      </Box>

      {/* Learn more link */}
      <Box marginBottom={1}>
        <Text wrap="wrap">
          Learn more:{' '}
          <Text color={theme.text.link}>https://geminicli.com/docs/hooks</Text>
        </Text>
      </Box>

      {/* Configured Hooks heading */}
      <Box marginBottom={1}>
        <Text bold color={theme.text.accent}>
          Configured Hooks
        </Text>
      </Box>

      {/* Hooks list */}
      <Box flexDirection="column">
        {Object.entries(hooksByEvent).map(([eventName, eventHooks]) => (
          <Box key={eventName} flexDirection="column" marginBottom={1}>
            <Text color={theme.text.accent} bold>
              {eventName}:
            </Text>
            <Box flexDirection="column" paddingLeft={2}>
              {eventHooks.map((hook) => {
                const hookName =
                  hook.config.name || hook.config.command || 'unknown';
                const statusColor = hook.enabled
                  ? theme.status.success
                  : theme.text.secondary;
                const statusText = hook.enabled ? 'enabled' : 'disabled';
                // Create a stable, unique key from hook properties
                const hookKey = `${eventName}:${hook.source}:${hook.config.name ?? ''}:${hook.config.command ?? ''}`;

                return (
                  <Box key={hookKey} flexDirection="column" marginBottom={1}>
                    <Box flexDirection="row">
                      <Text color={theme.text.accent} bold>
                        {hookName}
                      </Text>
                      <Text color={statusColor}>{` [${statusText}]`}</Text>
                    </Box>
                    <Box paddingLeft={2} flexDirection="column">
                      {hook.config.description && (
                        <Text color={theme.text.primary} italic wrap="wrap">
                          {hook.config.description}
                        </Text>
                      )}
                      <Text color={theme.text.secondary} wrap="wrap">
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
        <Text color={theme.text.secondary} wrap="wrap">
          Tip: Use <Text bold>/hooks enable {'<hook-name>'}</Text> or{' '}
          <Text bold>/hooks disable {'<hook-name>'}</Text> to toggle individual
          hooks. Use <Text bold>/hooks enable-all</Text> or{' '}
          <Text bold>/hooks disable-all</Text> to toggle all hooks at once.
        </Text>
      </Box>
    </Box>
  );
};
