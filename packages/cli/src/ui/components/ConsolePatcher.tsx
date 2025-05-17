/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Key } from 'react';
import { Box, Text } from 'ink';
import util from 'util';

interface ConsoleMessage {
  id: Key;
  type: 'log' | 'warn' | 'error' | 'debug';
  content: string;
}

// Using a module-level counter for unique IDs.
// This ensures IDs are unique across messages.
let messageIdCounter = 0;

interface ConsoleOutputProps {
  debugMode: boolean;
}

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ debugMode }) => {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);

  useEffect(() => {
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    const originalConsoleDebug = console.debug;

    const formatArgs = (args: unknown[]): string => util.format(...args);
    const addMessage = (
      type: 'log' | 'warn' | 'error' | 'debug',
      args: unknown[],
    ) => {
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: `console-msg-${messageIdCounter++}`,
          type,
          content: formatArgs(args),
        },
      ]);
    };

    // It's patching time
    console.log = (...args: unknown[]) => addMessage('log', args);
    console.warn = (...args: unknown[]) => addMessage('warn', args);
    console.error = (...args: unknown[]) => addMessage('error', args);
    console.debug = (...args: unknown[]) => addMessage('debug', args);

    return () => {
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
      console.debug = originalConsoleDebug;
    };
  }, []);

  return (
    <Box flexDirection="column">
      {messages.map((msg) => {
        if (msg.type === 'debug' && !debugMode) {
          return null;
        }

        const textProps: { color?: string } = {};
        let prefix = '';

        switch (msg.type) {
          case 'warn':
            textProps.color = 'yellow';
            prefix = 'WARN: ';
            break;
          case 'error':
            textProps.color = 'red';
            prefix = 'ERROR: ';
            break;
          case 'debug':
            textProps.color = 'gray';
            prefix = 'DEBUG: ';
            break;
          case 'log':
          default:
            prefix = 'LOG: ';
            break;
        }

        return (
          <Box key={msg.id}>
            <Text {...textProps}>
              {prefix}
              {msg.content}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
