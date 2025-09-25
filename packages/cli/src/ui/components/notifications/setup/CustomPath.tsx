/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NotificationEventType } from '../../../../notifications/types.js';

interface CustomPathProps {
  eventType: NotificationEventType;
  onSubmit: (path: string) => void;
  error: string | null;
}

export const CustomPath: React.FC<CustomPathProps> = ({
  eventType,
  onSubmit,
  error,
}) => {
  const [input, setInput] = useState('');

  useInput((char, key) => {
    if (key.return) {
      onSubmit(input);
    } else if (key.backspace || key.delete) {
      setInput(input.slice(0, -1));
    } else if (!key.meta && !key.ctrl) {
      setInput(input + char);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Audio Notification Setup</Text>
      <Box marginTop={1}>
        <Text>
          Enter the path to your custom sound file for &quot;{eventType}
          &quot;:
        </Text>
      </Box>
      <Box>
        <Text>{input}</Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
};
