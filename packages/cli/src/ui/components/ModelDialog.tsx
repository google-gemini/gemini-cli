/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { MCPServerConfig } from '@google/gemini-cli-core';

interface ModelDialogProps {
  onSelect: (model: string | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
}

async function getModels(
  provider: MCPServerConfig | undefined,
): Promise<string[]> {
  if (!provider || !provider.url) {
    return [];
  }

  try {
    const response = await fetch(`${provider.url}/models`, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
    });
    const data = await response.json();
    return data.data.map((model: any) => model.id);
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

export function ModelDialog({
  onSelect,
  settings,
}: ModelDialogProps): React.JSX.Element {
  const [models, setModels] = useState<string[]>([]);
  const [selectedProvider] = useState<MCPServerConfig | undefined>(
    settings.merged.mcpServers?.['openrouter'],
  );

  useEffect(() => {
    getModels(selectedProvider).then(setModels);
  }, [selectedProvider]);

  const items = models.map((model) => ({
    label: model,
    value: model,
  }));

  const initialModelIndex = items.findIndex(
    (item) => item.value === settings.merged.mcpServers?.['openrouter']?.model,
  );

  const handleModelSelect = (model: string) => {
    onSelect(model, SettingScope.User);
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select a model</Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialModelIndex}
          onSelect={handleModelSelect}
          isFocused={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
    </Box>
  );
}
