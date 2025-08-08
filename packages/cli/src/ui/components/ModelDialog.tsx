/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface ModelDialogProps {
  onSelect: (modelName: string | undefined) => void;
  currentModel: string;
  availableModels: string[];
}

export function ModelDialog({
  onSelect,
  currentModel,
  availableModels,
}: ModelDialogProps): React.JSX.Element {
  useInput((input, key) => {
    if (key.escape) {
      onSelect(undefined);
    }
  });

  const modelItems = availableModels.map((model) => ({
    label: model,
    value: model,
    isSelectedIndicator:
      model === currentModel ? '(already selected)' : undefined,
  }));

  const initialModelIndex = modelItems.findIndex(
    (item) => item.value === currentModel,
  );

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select a Model</Text>
      <RadioButtonSelect
        items={modelItems}
        initialIndex={initialModelIndex >= 0 ? initialModelIndex : 0}
        onSelect={onSelect}
        isFocused={true}
        showNumbers={true}
      />
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
    </Box>
  );
}
