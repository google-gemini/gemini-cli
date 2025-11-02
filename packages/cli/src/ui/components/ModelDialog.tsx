/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  ModelService,
  type ModelInfo,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';

interface ModelDialogProps {
  onClose: () => void;
}

const FALLBACK_MODEL_OPTIONS = [
  {
    value: DEFAULT_GEMINI_MODEL_AUTO,
    title: 'Auto (recommended)',
    description: 'Let the system choose the best model for your task',
    key: DEFAULT_GEMINI_MODEL_AUTO,
  },
  {
    value: DEFAULT_GEMINI_MODEL,
    title: 'Pro',
    description: 'For complex tasks that require deep reasoning and creativity',
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

const AUTO_OPTION: ModelInfo = {
  value: DEFAULT_GEMINI_MODEL_AUTO,
  title: 'Auto (recommended)',
  description: 'Let the system choose the best model for your task',
  key: DEFAULT_GEMINI_MODEL_AUTO,
};

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const [isLoading, setIsLoading] = useState(true);
  const [modelOptions, setModelOptions] = useState<ModelInfo[]>(
    FALLBACK_MODEL_OPTIONS,
  );

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

  // Fetch available models from the API
  useEffect(() => {
    const fetchModels = async () => {
      if (!config) {
        setIsLoading(false);
        return;
      }

      try {
        const contentGenerator = config.getContentGenerator();
        const availableModels =
          await ModelService.fetchAvailableModels(contentGenerator);

        if (availableModels.length > 0) {
          // Add the Auto option at the top
          setModelOptions([AUTO_OPTION, ...availableModels]);
        } else {
          // If no models returned, use fallback
          setModelOptions(FALLBACK_MODEL_OPTIONS);
        }
      } catch (error) {
        console.error('Error fetching models:', error);
        // Use fallback on error
        setModelOptions(FALLBACK_MODEL_OPTIONS);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchModels();
  }, [config]);

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
      {isLoading ? (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>Loading available models...</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <DescriptiveRadioButtonSelect
            items={modelOptions}
            onSelect={handleSelect}
            initialIndex={initialIndex}
            showNumbers={true}
          />
        </Box>
      )}
      <Box flexDirection="column">
        <Text color={theme.text.secondary}>
          {'> To use a specific Gemini model on startup, use the --model flag.'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
