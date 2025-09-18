/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';

interface ModelDialogProps {
  onClose: () => void;
}

const MODEL_OPTIONS = [
  {
    value: 'gemini-auto',
    title: 'Auto (recommended)',
    description: 'Let the system choose the best model for your task',
  },
  {
    value: 'gemini-2.5-pro',
    title: 'Gemini 2.5 Pro ($$$)',
    description: 'For complex tasks that require deep reasoning and creativity',
  },
  {
    value: 'gemini-2.5-flash',
    title: 'Flash ($$)',
    description: 'For tasks that need a balance of speed and reasoning',
  },
  {
    value: 'gemini-2.5-lite',
    title: 'Flash lite ($)',
    description: 'For simple tasks that need to be done quickly',
  },
];

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
      height="100%"
    >
      <Text bold>Select Model</Text>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={MODEL_OPTIONS}
          onSelect={setSelectedModel}
          initialIndex={MODEL_OPTIONS.findIndex(
            (option) => option.value === selectedModel,
          )}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
