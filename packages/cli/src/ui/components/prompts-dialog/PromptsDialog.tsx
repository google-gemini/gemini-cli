/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, PredefinedPrompt } from '@google/gemini-cli-core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { Colors } from '../../colors.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { PromptItem } from './PromptItem.js';

interface PromptsDialogProps {
  config: Config;
  onSubmit: (query: string) => void;
  onEscape?: () => void;
}

export function PromptsDialog({
  config,
  onSubmit,
  onEscape,
}: PromptsDialogProps): React.JSX.Element {
  const [selectedPrompt, setSelectedPrompt] = useState<PredefinedPrompt | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const prompts = config.getPredefinedPrompts() || [];

  const items = prompts.map((prompt) => ({
    label: prompt.name,
    value: prompt.name,
  }));

  const handleSelect = (value: string) => {
    const prompt = prompts.find((prompt) => prompt.name === value);

    if (!prompt) {
      setErrorMessage(`Invalid prompt selected "${value}".`);
    } else {
      setErrorMessage(null);
      setSelectedPrompt(prompt);
    }
  };

  const handleSubmit = (query: string) => {
    if (!query) {
      setErrorMessage('Query cannot be empty.');
      setSelectedPrompt(null); // Reset to selection screen to show error
      return;
    }

    setErrorMessage(null);
    setSelectedPrompt(null);
    onSubmit(query);
  };

  useInput((_input, key) => {
    if (key.escape && onEscape) {
      onEscape();
    }
  });

  if (selectedPrompt) {
    return (
      <PromptItem
        prompt={selectedPrompt}
        onSubmit={handleSubmit}
        setErrorMessage={setErrorMessage}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Prompt</Text>

      <RadioButtonSelect
        items={items}
        initialIndex={0}
        onSelect={handleSelect}
        isFocused={true}
      />

      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
    </Box>
  );
}
