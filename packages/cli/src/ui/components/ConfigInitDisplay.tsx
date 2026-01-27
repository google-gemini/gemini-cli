/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text } from 'ink';
import {
  CoreEvent,
  coreEvents,
  type McpClient,
  MCPServerStatus,
} from '@google/gemini-cli-core';
import { GeminiSpinner } from './GeminiRespondingSpinner.js';
import { theme } from '../semantic-colors.js';

export const ConfigInitDisplay = ({
  message: initialMessage,
}: {
  message?: string;
}) => {
  const { t } = useTranslation('ui');
  const defaultInitialMessage = t('configInit.initializing');
  const actualInitialMessage = initialMessage ?? defaultInitialMessage;
  const [message, setMessage] = useState(actualInitialMessage);

  useEffect(() => {
    const onChange = (clients?: Map<string, McpClient>) => {
      if (!clients || clients.size === 0) {
        setMessage(actualInitialMessage);
        return;
      }
      let connected = 0;
      const connecting: string[] = [];
      for (const [name, client] of clients.entries()) {
        if (client.getStatus() === MCPServerStatus.CONNECTED) {
          connected++;
        } else {
          connecting.push(name);
        }
      }

      if (connecting.length > 0) {
        const maxDisplay = 3;
        const displayedServers = connecting.slice(0, maxDisplay).join(', ');
        const remaining = connecting.length - maxDisplay;
        const suffix =
          remaining > 0
            ? t('configInit.moreServers', { count: remaining })
            : '';
        const mcpMessage =
          t('configInit.connectingMcp', {
            connected,
            total: clients.size,
          }) +
          t('configInit.waitingFor', { servers: displayedServers + suffix });
        setMessage(
          initialMessage && initialMessage !== defaultInitialMessage
            ? `${initialMessage} (${mcpMessage})`
            : mcpMessage,
        );
      } else {
        const mcpMessage = t('configInit.connectingMcp', {
          connected,
          total: clients.size,
        });
        setMessage(
          initialMessage && initialMessage !== defaultInitialMessage
            ? `${initialMessage} (${mcpMessage})`
            : mcpMessage,
        );
      }
    };

    coreEvents.on(CoreEvent.McpClientUpdate, onChange);
    return () => {
      coreEvents.off(CoreEvent.McpClientUpdate, onChange);
    };
  }, [actualInitialMessage, initialMessage, defaultInitialMessage, t]);

  return (
    <Box marginTop={1}>
      <Text>
        <GeminiSpinner /> <Text color={theme.text.primary}>{message}</Text>
      </Text>
    </Box>
  );
};
