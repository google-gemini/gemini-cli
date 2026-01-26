/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo } from 'react';
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
  message: initialMessage = 'Initializing...',
}: {
  message?: string;
}) => {
  const [clients, setClients] = useState<Map<string, McpClient>>();

  useEffect(() => {
    const onUpdate = (newClients?: Map<string, McpClient>) => {
      setClients(newClients);
    };

    coreEvents.on(CoreEvent.McpClientUpdate, onUpdate);
    return () => {
      coreEvents.off(CoreEvent.McpClientUpdate, onUpdate);
    };
  }, []);

  const displayMessage = useMemo(() => {
    if (!clients || clients.size === 0) {
      return initialMessage;
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

    let mcpMessage = '';
    if (connecting.length > 0) {
      const maxDisplay = 3;
      const displayedServers = connecting.slice(0, maxDisplay).join(', ');
      const remaining = connecting.length - maxDisplay;
      const suffix = remaining > 0 ? `, +${remaining} more` : '';
      mcpMessage = `Connecting to MCP servers... (${connected}/${clients.size}) - Waiting for: ${displayedServers}${suffix}`;
    } else {
      mcpMessage = `Connecting to MCP servers... (${connected}/${clients.size})`;
    }

    return initialMessage && initialMessage !== 'Initializing...'
      ? `${initialMessage} (${mcpMessage})`
      : mcpMessage;
  }, [initialMessage, clients]);

  return (
    <Box marginTop={1}>
      <Text>
        <GeminiSpinner />{' '}
        <Text color={theme.text.primary}>{displayMessage}</Text>
      </Text>
    </Box>
  );
};
