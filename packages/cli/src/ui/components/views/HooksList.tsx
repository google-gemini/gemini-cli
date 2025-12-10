/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';

interface HooksListProps {
  hooks: ReadonlyArray<{
    config: { command?: string; type: string; timeout?: number };
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
      <Box marginTop={1} marginBottom={1}>
        <Text>No hooks configured.</Text>
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
      <Text bold>Configured Hooks:</Text>
      <Box flexDirection="column" paddingLeft={2} marginTop={1}>
        {Object.entries(hooksByEvent).map(([eventName, eventHooks]) => (
          <Box key={eventName} flexDirection="column" marginBottom={1}>
            <Text color="cyan" bold>
              {eventName}:
            </Text>
            <Box flexDirection="column" paddingLeft={2}>
              {eventHooks.map((hook, index) => {
                const hookName = hook.config.command || 'unknown';
                const statusColor = hook.enabled ? 'green' : 'gray';
                const statusText = hook.enabled ? 'enabled' : 'disabled';

                return (
                  <Box key={`${eventName}-${index}`} flexDirection="column">
                    <Box>
                      <Text>
                        <Text color="yellow">{hookName}</Text>
                        <Text color={statusColor}>{` [${statusText}]`}</Text>
                      </Text>
                    </Box>
                    <Box paddingLeft={2} flexDirection="column">
                      <Text dimColor>
                        Source: {hook.source}
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
          Tip: Use `/hooks enable {'<hook-name>'}` or `/hooks disable{' '}
          {'<hook-name>'}` to toggle hooks
        </Text>
      </Box>
    </Box>
  );
};
