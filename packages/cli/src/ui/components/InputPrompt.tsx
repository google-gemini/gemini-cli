/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { globalConfig } from '../../config/config.js';

interface InputPromptProps {
  query: string;
  setQuery: (value: string) => void;
  onSubmit: (value: string) => void;
  isActive: boolean;
  forceKey?: number;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  query,
  setQuery,
  onSubmit,
  isActive,
  forceKey,
}) => {
  const model = globalConfig.getModel();

  return (
    <Box marginTop={1} borderStyle="round" borderColor={'white'} paddingX={1}>
      <Text color={'white'}>&gt; </Text>
      <Box flexGrow={1}>
        <TextInput
          key={forceKey?.toString()}
          value={query}
          onChange={setQuery}
          onSubmit={onSubmit}
          showCursor={true}
          focus={isActive}
          placeholder={`Ask Gemini (${model})... (try "/init" or "/help")`}
        />
      </Box>
    </Box>
  );
};
