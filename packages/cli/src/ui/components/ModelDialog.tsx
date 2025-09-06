/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface ModelDialogProps {
  /** Callback function when a model is selected */
  onSelect: (modelName: string) => void;
  /** Callback function when dialog should be closed */
  onClose?: () => void;
  /** Current model name */
  currentModel?: string;
}

const GEMINI_2_5_PRO = 'gemini-2.5-pro';
const GEMINI_2_5_FLASH = 'gemini-2.5-flash';
const GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite';

const AVAILABLE_MODELS = [
  {
    name: GEMINI_2_5_PRO,
    alias: 'pro',
    description: 'Most capable model',
    displayName: 'Gemini 2.5 Pro (pro)',
  },
  {
    name: GEMINI_2_5_FLASH,
    alias: 'flash',
    description: 'Fast and efficient',
    displayName: 'Gemini 2.5 Flash (flash)',
  },
  {
    name: GEMINI_2_5_FLASH_LITE,
    alias: 'lite',
    description: 'Lightest and fastest',
    displayName: 'Gemini 2.5 Flash Lite (lite)',
  },
] as const;

export function ModelDialog({
  onSelect,
  onClose,
  currentModel,
}: ModelDialogProps): React.JSX.Element {
  const modelItems = AVAILABLE_MODELS.map((model) => ({
    label: model.displayName,
    value: model.name,
    description: model.description,
  }));

  // Find the index of the current model
  const currentModelIndex = modelItems.findIndex(
    (item) => item.value === currentModel,
  );
  const initialIndex = currentModelIndex >= 0 ? currentModelIndex : 0;

  const handleModelSelect = (modelName: string) => {
    onSelect(modelName);
  };

  // Handle escape key to close dialog
  useKeypress(
    (key) => {
      if (key.name === 'escape' && onClose) {
        onClose();
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>🤖 Select Gemini Model</Text>
      <Text color={Colors.Gray}>
        Choose a model for conversation. Current: {currentModel || 'unknown'}
      </Text>
      <Box marginTop={1} />

      <RadioButtonSelect
        items={modelItems}
        initialIndex={initialIndex}
        onSelect={handleModelSelect}
        isFocused={true}
        showNumbers={true}
        maxItemsToShow={10}
      />

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Use ↑↓ to navigate, Enter to select, Esc to close
        </Text>
      </Box>

      {/* Model descriptions */}
      <Box marginTop={1} flexDirection="column">
        <Text color={Colors.AccentCyan} bold>
          Model Details:
        </Text>
        {AVAILABLE_MODELS.map((model, index) => (
          <Text key={model.name} color={Colors.Gray}>
            {index + 1}. {model.displayName} - {model.description}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
