/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

interface ProviderDialogProps {
  onSelect: (provider: string | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
}

export function ProviderDialog({
  onSelect,
  settings,
}: ProviderDialogProps): React.JSX.Element {
  const items = [
    {
      label: 'OpenRouter',
      value: 'openrouter',
    },
    {
      label: 'Google',
      value: 'google',
    },
  ];

  const initialProviderIndex = items.findIndex(
    (item) => item.value === settings.merged.mcpServers?.['openrouter']?.description,
  );

  const handleProviderSelect = (provider: string) => {
    onSelect(provider, SettingScope.User);
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select a provider</Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialProviderIndex}
          onSelect={handleProviderSelect}
          isFocused={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
    </Box>
  );
}
