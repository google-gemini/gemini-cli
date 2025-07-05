/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType } from '@google/gemini-cli-core';
import { validateAuthMethod } from '../../config/auth.js';
import TextInput from 'ink-text-input';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [copilotEndpoint, setCopilotEndpoint] = useState(
    settings.merged.copilotAgentEndpoint || '',
  );
  const [copilotApiKey, setCopilotApiKey] = useState(
    settings.merged.copilotAgentApiKey || '',
  );
  const items = [
    { label: 'Login with Google', value: AuthType.LOGIN_WITH_GOOGLE },
    { label: 'Gemini API Key (AI Studio)', value: AuthType.USE_GEMINI },
    { label: 'Vertex AI', value: AuthType.USE_VERTEX_AI },
    { label: 'GitHub Copilot Agent', value: AuthType.USE_COPILOT_AGENT },
  ];

  let initialAuthIndex = items.findIndex(
    (item) => item.value === settings.merged.selectedAuthType,
  );

  if (initialAuthIndex === -1) {
    initialAuthIndex = 0;
  }

  const handleAuthSelect = (authMethod: AuthType) => {
    const error = validateAuthMethod(authMethod);
    if (error) {
      setErrorMessage(error);
    } else {
      setErrorMessage(null);
      if (authMethod === AuthType.USE_COPILOT_AGENT) {
        settings.setValue(SettingScope.User, 'copilotAgentEndpoint', copilotEndpoint);
        settings.setValue(SettingScope.User, 'copilotAgentApiKey', copilotApiKey);
      }
      onSelect(authMethod, SettingScope.User);
    }
  };

  useInput((_input, key) => {
    if (key.escape) {
      if (settings.merged.selectedAuthType === undefined) {
        // Prevent exiting if no auth method is set
        setErrorMessage(
          'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
        );
        return;
      }
      onSelect(undefined, SettingScope.User);
    }
  });

  // Show Copilot fields if selected
  const showCopilotFields = items[initialAuthIndex].value === AuthType.USE_COPILOT_AGENT;

  const handleCopilotEndpointChange = (value: string) => setCopilotEndpoint(value);
  const handleCopilotApiKeyChange = (value: string) => setCopilotApiKey(value);

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Auth Method</Text>
      <RadioButtonSelect
        items={items}
        initialIndex={initialAuthIndex}
        onSelect={handleAuthSelect}
        isFocused={true}
      />
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Gemini CLI</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {
            'https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md'
          }
        </Text>
      </Box>
      {showCopilotFields && (
        <>
          <Box marginTop={1} flexDirection="column">
            <Text>Copilot Agent Endpoint:</Text>
            <TextInput
              value={copilotEndpoint}
              onChange={handleCopilotEndpointChange}
              placeholder="http://localhost:3000/api/agent"
            />
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text>Copilot Agent API Key (optional):</Text>
            <TextInput
              value={copilotApiKey}
              onChange={handleCopilotApiKeyChange}
              placeholder="sk-..."
              mask="*"
            />
          </Box>
        </>
      )}
    </Box>
  );
}
