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
  type: 'log' | 'warn' | 'error';
  content: string;
}

// Using a module-level counter for unique IDs.
// This ensures IDs are unique across messages.
let messageIdCounter = 0;

export const ConsoleOutput: React.FC = () => {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);

  useEffect(() => {
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    const formatArgs = (args: unknown[]): string => util.format(...args);
    const addMessage = (type: 'log' | 'warn' | 'error', args: unknown[]) => {
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

    return () => {
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
    };
  }, []);

  return (
    <Box flexDirection="column">
      {messages.map((msg) => {
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
