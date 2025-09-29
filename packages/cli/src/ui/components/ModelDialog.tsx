/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  OPENROUTER_X_AI_GROK_CODE_FAST_1,
  OPENROUTER_GOOGLE_GEMINI_2_5_PRO,
  OPENROUTER_ANTHROPIC_CLAUDE_3_7_SONNET,
  OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  AuthType,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';

interface ModelDialogProps {
  onClose: () => void;
}

function getModelOptions(authType?: string) {
  const baseOptions = [
    {
      value: DEFAULT_GEMINI_MODEL_AUTO,
      title: 'Auto (recommended)',
      description: 'Let the system choose the best model for your task',
      key: DEFAULT_GEMINI_MODEL_AUTO,
    },
  ];

  if (authType === AuthType.USE_OPENROUTER) {
    return [
      ...baseOptions,
      {
        value: OPENROUTER_X_AI_GROK_CODE_FAST_1,
        title: 'Grok Code Fast',
        description: 'xAI Grok model optimized for code tasks',
        key: OPENROUTER_X_AI_GROK_CODE_FAST_1,
      },
      {
        value: OPENROUTER_GOOGLE_GEMINI_2_5_PRO,
        title: 'Gemini 2.5 Pro (OpenRouter)',
        description: 'Google Gemini 2.5 Pro via OpenRouter',
        key: OPENROUTER_GOOGLE_GEMINI_2_5_PRO,
      },
      {
        value: OPENROUTER_ANTHROPIC_CLAUDE_3_7_SONNET,
        title: 'Claude 3.7 Sonnet',
        description: 'Anthropic Claude 3.7 Sonnet via OpenRouter',
        key: OPENROUTER_ANTHROPIC_CLAUDE_3_7_SONNET,
      },
      {
        value: OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4,
        title: 'Claude Sonnet 4',
        description: 'Anthropic Claude Sonnet 4 via OpenRouter',
        key: OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4,
      },
    ];
  }

  // Default Gemini models
  return [
    ...baseOptions,
    {
      value: DEFAULT_GEMINI_MODEL,
      title: 'Pro',
      description:
        'For complex tasks that require deep reasoning and creativity',
      key: DEFAULT_GEMINI_MODEL,
    },
    {
      value: DEFAULT_GEMINI_FLASH_MODEL,
      title: 'Flash',
      description: 'For tasks that need a balance of speed and reasoning',
      key: DEFAULT_GEMINI_FLASH_MODEL,
    },
    {
      value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      title: 'Flash-Lite',
      description: 'For simple tasks that need to be done quickly',
      key: DEFAULT_GEMINI_FLASH_LITE_MODEL,
    },
  ];
}

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

  // Get current auth type to determine available models
  const authType = config?.getContentGeneratorConfig()?.authType;
  const modelOptions = getModelOptions(authType);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
      }
    },
    { isActive: true },
  );

  // Calculate the initial index based on the preferred model.
  const initialIndex = useMemo(
    () => modelOptions.findIndex((option) => option.value === preferredModel),
    [preferredModel, modelOptions],
  );

  // Handle selection internally (Autonomous Dialog).
  const handleSelect = useCallback(
    (model: string) => {
      if (config) {
        config.setModel(model);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
      onClose();
    },
    [config, onClose],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Model</Text>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={modelOptions}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box flexDirection="column">
        <Text color={theme.text.secondary}>
          {'> To use a specific Gemini model, use the --model flag.'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
