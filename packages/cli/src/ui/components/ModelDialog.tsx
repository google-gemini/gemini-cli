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
  GEMINI_2_5_PRO_THINKING,
  GEMINI_2_5_DEEP_RESEARCH,
  GEMINI_3_PRO,
  GEMINI_3_THINKING,
  ModelSlashCommandEvent,
  logModelSlashCommand,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';

interface ModelDialogProps {
  onClose: () => void;
}

const MODEL_OPTIONS = [
  {
    value: DEFAULT_GEMINI_MODEL_AUTO,
    title: 'Auto (recommended)',
    description: 'Let the system choose the best model for your task',
    key: DEFAULT_GEMINI_MODEL_AUTO,
  },
  {
    value: DEFAULT_GEMINI_MODEL,
    title: 'Gemini 2.5 Pro',
    description: 'For complex tasks that require deep reasoning and creativity',
    key: DEFAULT_GEMINI_MODEL,
  },
  {
    value: GEMINI_2_5_PRO_THINKING,
    title: 'Gemini 2.5 Pro Thinking',
    description: 'Extended reasoning with visible thought process',
    key: GEMINI_2_5_PRO_THINKING,
  },
  {
    value: GEMINI_2_5_DEEP_RESEARCH,
    title: 'Gemini 2.5 Deep Research',
    description: 'Research-optimized model with extended analysis capabilities',
    key: GEMINI_2_5_DEEP_RESEARCH,
  },
  {
    value: GEMINI_3_PRO,
    title: 'Gemini 3.0 Pro',
    description: 'Next-generation model with advanced capabilities',
    key: GEMINI_3_PRO,
  },
  {
    value: GEMINI_3_THINKING,
    title: 'Gemini 3.0 Thinking',
    description: 'Next-gen with extended reasoning and thought process',
    key: GEMINI_3_THINKING,
  },
  {
    value: DEFAULT_GEMINI_FLASH_MODEL,
    title: 'Gemini 2.5 Flash',
    description: 'For tasks that need a balance of speed and reasoning',
    key: DEFAULT_GEMINI_FLASH_MODEL,
  },
  {
    value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
    title: 'Gemini 2.5 Flash-Lite',
    description: 'For simple tasks that need to be done quickly',
    key: DEFAULT_GEMINI_FLASH_LITE_MODEL,
  },
];

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

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
    () => MODEL_OPTIONS.findIndex((option) => option.value === preferredModel),
    [preferredModel],
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
          items={MODEL_OPTIONS}
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
