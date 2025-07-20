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
  DEFAULT_GEMINI_MODEL, 
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_BEDROCK_MODEL,
  DEFAULT_BEDROCK_SMALL_FAST_MODEL,
  DEFAULT_BEDROCK_OPUS_MODEL,
  DEFAULT_BEDROCK_SONNET_4_MODEL,
  DEFAULT_BEDROCK_CLAUDE_35_SONNET_V2_MODEL
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
  if (authType === AuthType.USE_AWS_BEDROCK) {
    return [
      {
        label: 'Claude Sonnet 4 (Latest)',
        value: DEFAULT_BEDROCK_SONNET_4_MODEL,
        description: 'Latest and most capable Claude model'
      },
      {
        label: 'Claude 4 Opus (Most Powerful)',
        value: DEFAULT_BEDROCK_OPUS_MODEL,
        description: 'Most capable model, highest cost'
      },
      {
        label: 'Claude 3.7 Sonnet (Default)',
        value: DEFAULT_BEDROCK_MODEL,
        description: 'Default Claude model with enhanced reasoning'
      },
      {
        label: 'Claude 3.5 Sonnet V2',
        value: DEFAULT_BEDROCK_CLAUDE_35_SONNET_V2_MODEL,
        description: 'Improved 3.5 Sonnet with better performance'
      },
      {
        label: 'Claude 3.5 Haiku (Fast)',
        value: DEFAULT_BEDROCK_SMALL_FAST_MODEL,
        description: 'Fast responses with good capability'
      }
    ];
  }

  // Default Gemini models
  return [
    {
      label: 'Gemini 2.5 Pro',
      value: DEFAULT_GEMINI_MODEL,
      description: 'Most capable Gemini model'
    },
    {
      label: 'Gemini 2.5 Flash',
      value: DEFAULT_GEMINI_FLASH_MODEL,
      description: 'Fast and efficient'
    }
  ];
}

export function ModelDialog({ onSelect, config }: ModelDialogProps): React.JSX.Element {
  const authType = config.getContentGeneratorConfig()?.authType;
  const currentModel = config.getModel();
  const models = getModelsForAuthType(authType);
  
  const items = models.map(model => ({
    label: `${model.label}${model.value === currentModel ? ' (current)' : ''}`,
    value: model.value,
  }));

  const initialIndex = models.findIndex(model => model.value === currentModel);
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
        <Text>Choose a model compatible with {authType === AuthType.USE_AWS_BEDROCK ? 'Amazon Bedrock' : 'your current auth method'}:</Text>
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
          <Text color={Colors.Gray}>
            {selectedModel.description}
          </Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use arrow keys to navigate, Enter to select, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}