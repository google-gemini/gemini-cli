/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import {
  Config,
  AuthType,
  getModelsByProvider,
} from '@google/gemini-cli-core';

interface ModelDialogProps {
  onSelect: (model: string | undefined) => void;
  config: Config;
}

interface ModelOption {
  label: string;
  value: string;
  description?: string;
}

function getModelsForAuthType(authType: AuthType | undefined): ModelOption[] {
  const provider = authType === AuthType.USE_AWS_BEDROCK ? 'bedrock' : 'gemini';
  const models = getModelsByProvider(provider);
  
  // Filter to only show models with descriptions (main models)
  const mainModels = models.filter(m => m.description);
  
  // Sort models by category and capability for better UX
  const sortedModels = mainModels.sort((a, b) => {
    // Put powerful models first, then default, then fast
    const categoryOrder = { powerful: 0, default: 1, fast: 2 };
    const aOrder = categoryOrder[a.category || 'default'];
    const bOrder = categoryOrder[b.category || 'default'];
    
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    
    // Within same category, sort by display name
    return a.displayName.localeCompare(b.displayName);
  });
  
  return sortedModels.map(model => ({
    label: model.displayName,
    value: model.id,
    description: model.description,
  }));
}

export function ModelDialog({
  onSelect,
  config,
}: ModelDialogProps): React.JSX.Element {
  const authType = config.getContentGeneratorConfig()?.authType;
  const currentModel = config.getModel();
  const models = getModelsForAuthType(authType);

  const items = models.map((model) => ({
    label: `${model.label}${model.value === currentModel ? ' (current)' : ''}`,
    value: model.value,
  }));

  const initialIndex = models.findIndex(
    (model) => model.value === currentModel,
  );
  const selectedIndex = initialIndex >= 0 ? initialIndex : 0;
  const selectedModel = models[selectedIndex];

  const handleModelSelect = (model: string) => {
    onSelect(model);
  };

  useInput((_input, key) => {
    if (key.escape) {
      onSelect(undefined);
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Model</Text>
      <Box marginTop={1}>
        <Text>
          Choose a model compatible with{' '}
          {authType === AuthType.USE_AWS_BEDROCK
            ? 'Amazon Bedrock'
            : 'your current auth method'}
          :
        </Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={selectedIndex}
          onSelect={handleModelSelect}
          isFocused={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {selectedModel?.description && (
          <Text color={Colors.Gray}>{selectedModel.description}</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          (Use arrow keys to navigate, Enter to select, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
