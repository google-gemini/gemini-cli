/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, useInput } from 'ink';
import figures from 'figures';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface Props {
  currentModel: string;
  fallbackModel: string;
  onSelect: (confirmed: boolean) => void;
}

export function FallbackConfirmationDialog({ currentModel, fallbackModel, onSelect }: Props) {
  useInput((_input, key) => {
    if (key.escape) {
      onSelect(false);
    }
  });

  const items = [
    { label: `Yes, switch to Flash model (${fallbackModel})`, value: true },
    { label: `No, wait for current model (${currentModel})`, value: false },
  ];

  return (
    <Box borderStyle="round" borderColor={Colors.Gray} padding={1} flexDirection="column">
      <Box>
        <Text color={Colors.AccentYellow}>{figures.warning} </Text>
        <Text>Model <Text bold>{currentModel}</Text> is currently busy.</Text>
      </Box>
      <Text>Would you like to temporarily switch to <Text bold>{fallbackModel}</Text> to continue?</Text>
      <Box marginTop={1}>
        <RadioButtonSelect<boolean>
          items={items}
          onSelect={onSelect}
          isFocused={true}
        />
      </Box>
       <Box marginTop={1}>
         <Text color={Colors.Gray}>(Use Enter to select, Esc to cancel)</Text>
       </Box>
    </Box>
  );
}