/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { Config, AuthType, DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FLASH_MODEL } from '@google/gemini-cli-core';

// Bedrock model constants
const DEFAULT_BEDROCK_MODEL = 'anthropic.claude-3-sonnet-20240229-v1:0';
const DEFAULT_BEDROCK_SMALL_FAST_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';
const DEFAULT_BEDROCK_OPUS_MODEL = 'anthropic.claude-3-opus-20240229-v1:0';

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
        label: 'Claude 3 Sonnet',
        value: DEFAULT_BEDROCK_MODEL,
        description: 'Balanced performance and cost'
      },
      {
        label: 'Claude 3 Haiku (Fast)',
        value: DEFAULT_BEDROCK_SMALL_FAST_MODEL,
        description: 'Fastest responses, lower cost'
      },
      {
        label: 'Claude 3 Opus (Powerful)',
        value: DEFAULT_BEDROCK_OPUS_MODEL,
        description: 'Most capable, higher cost'
      },
      {
        label: 'Claude 3.5 Sonnet (Latest)',
        value: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        description: 'Latest model with best performance'
      },
      {
        label: 'Claude 3.5 Haiku (Latest Fast)',
        value: 'anthropic.claude-3-5-haiku-20241022-v1:0',
        description: 'Latest fast model'
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
          initialIndex={initialIndex >= 0 ? initialIndex : 0}
          onSelect={handleModelSelect}
          isFocused={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {models.map((model, index) => (
          model.value === items[initialIndex >= 0 ? initialIndex : 0].value && model.description ? (
            <Text key={index} color={Colors.Gray}>
              {model.description}
            </Text>
          ) : null
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use arrow keys to navigate, Enter to select, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}