/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box, useInput, useFocus } from 'ink';
import TextInput from 'ink-text-input';
import { Colors } from '../colors.js';

interface InputPromptProps {
  onSubmit: (value: string) => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({ onSubmit }) => {
  const [value, setValue] = React.useState(
    "I'd like to update my web fetch tool to be a little smarter about the content it fetches from web pages. Instead of returning the entire HTML to the LLM I was extract the body text and other important information to reduce the amount of tokens we need to use.",
  );
  // const [value, setValue] = React.useState('Add "Hello World" to the top of README.md');
  // const [value, setValue] = React.useState('show me "Hello World" in as many langauges as you can think of');

  const { isFocused } = useFocus({ autoFocus: true });

  useInput(
    (input, key) => {
      if (key.return) {
        if (value.trim()) {
          onSubmit(value);
          setValue('');
        }
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box borderStyle="round" borderColor={Colors.AccentBlue} paddingX={1}>
      <Text color={Colors.AccentPurple}>&gt; </Text>
      <Box flexGrow={1}>
        <TextInput
          value={value}
          onChange={setValue}
          placeholder="Enter your message or use tools..."
          onSubmit={() => {
            /* Empty to prevent double submission */
          }}
        />
      </Box>
    </Box>
  );
};
