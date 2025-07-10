/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, PromptFromFile } from '@google/gemini-cli-core';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input'; // You'll need to install 'ink-text-input'
import React, { useMemo, useState } from 'react';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { PromptFromFileItemDisplay as PromptFromFileItem } from './PromptFromFileItemDisplay.js';

interface PromptsDialogProps {
  config: Config;
  onSubmit: (query: string) => void;
  onEscape?: () => void;
}

export function PromptsFromFilesDialog({
  config,
  onSubmit,
  onEscape,
}: PromptsDialogProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<PromptFromFile | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const prompts = useMemo(() => config.getPromptsFromFiles() || [], [config]);

  const filteredItems = useMemo(
    () =>
      prompts
        .filter((prompt) =>
          prompt.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        .slice(0, 10)
        .map((prompt) => ({
          label: prompt.name,
          value: prompt.id,
        })),
    [prompts, searchQuery],
  );

  const handleSelect = (value: string) => {
    const prompt = prompts.find((p) => p.id === value);
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
      setSelectedPrompt(null);
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
      <PromptFromFileItem
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

      <Box marginBottom={1}>
        <Text color={Colors.Gray}>Search: </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type to filter prompts"
        />
      </Box>

      <RadioButtonSelect
        items={filteredItems}
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
        <Text color={Colors.Gray}>(Use Enter to select, Esc to exit)</Text>
      </Box>
    </Box>
  );
}
