
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface PasswordPromptProps {
  prompt: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPrompt({ prompt, onSubmit, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = useCallback(() => {
    if (password.trim() !== '') {
      onSubmit(password);
    }
  }, [password, onSubmit]);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1} borderColor="yellow">
      <Text>{prompt}</Text>
      <Box marginTop={1}>
        <Text>Password: </Text>
        <TextInput
          value={password}
          onChange={setPassword}
          onSubmit={handleSubmit}
          mask="*"
        />
      </Box>
      <Box marginTop={1}>
       <Text color="gray">(Press Enter to submit, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}
