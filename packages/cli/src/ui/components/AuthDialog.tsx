/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import { CustomTextInput } from './shared/CustomTextInput.js';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { AuthType } from '@google/gemini-cli-core';
import {
  validateAuthMethod,
  saveGeminiApiKeyToEnvFile,
} from '../../config/auth.js';
import { useKeypress } from '../hooks/useKeypress.js';
import Link from 'ink-link';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

function parseDefaultAuthType(
  defaultAuthType: string | undefined,
): AuthType | null {
  if (
    defaultAuthType &&
    Object.values(AuthType).includes(defaultAuthType as AuthType)
  ) {
    return defaultAuthType as AuthType;
  }
  return null;
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (initialErrorMessage) {
      return initialErrorMessage;
    }

    const defaultAuthType = parseDefaultAuthType(
      process.env['GEMINI_DEFAULT_AUTH_TYPE'],
    );

    if (process.env['GEMINI_DEFAULT_AUTH_TYPE'] && defaultAuthType === null) {
      return (
        `Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "${process.env['GEMINI_DEFAULT_AUTH_TYPE']}". ` +
        `Valid values are: ${Object.values(AuthType).join(', ')}.`
      );
    }

    if (
      process.env['GEMINI_API_KEY'] &&
      (!defaultAuthType || defaultAuthType === AuthType.USE_GEMINI)
    ) {
      return 'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it.';
    }
    return null;
  });
  const [isEnteringApiKey, setIsEnteringApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const items = [
    {
      label: 'Login with Google',
      value: AuthType.LOGIN_WITH_GOOGLE,
    },
    ...(process.env['CLOUD_SHELL'] === 'true'
      ? [
          {
            label: 'Use Cloud Shell user credentials',
            value: AuthType.CLOUD_SHELL,
          },
        ]
      : []),
    {
      label: 'Use Gemini API Key',
      value: AuthType.USE_GEMINI,
    },
    { label: 'Vertex AI', value: AuthType.USE_VERTEX_AI },
  ];

  const initialAuthIndex = items.findIndex((item) => {
    if (settings.merged.security?.auth?.selectedType) {
      return item.value === settings.merged.security.auth.selectedType;
    }

    const defaultAuthType = parseDefaultAuthType(
      process.env['GEMINI_DEFAULT_AUTH_TYPE'],
    );
    if (defaultAuthType) {
      return item.value === defaultAuthType;
    }

    if (process.env['GEMINI_API_KEY']) {
      return item.value === AuthType.USE_GEMINI;
    }

    return item.value === AuthType.LOGIN_WITH_GOOGLE;
  });

  const handleAuthSelect = (authMethod: AuthType) => {
    const error = validateAuthMethod(authMethod);
    if (error) {
      if (authMethod === AuthType.USE_GEMINI) {
        setIsEnteringApiKey(true);
        setErrorMessage(null);
      } else {
        setErrorMessage(error);
      }
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleApiKeySubmit = () => {
    if (!apiKey) {
      setErrorMessage('API Key cannot be empty.');
      return;
    }
    const saved = saveGeminiApiKeyToEnvFile(apiKey);
    if (saved) {
      // Manually set the environment variable for the current process
      process.env['GEMINI_API_KEY'] = apiKey;
      setErrorMessage(null);
      setIsEnteringApiKey(false);
      onSelect(AuthType.USE_GEMINI, SettingScope.User);
    } else {
      setErrorMessage(
        'Failed to save API Key. Please try again or set it up manually by creating a `.env` file with `GEMINI_API_KEY="YOUR_API_KEY"` or by exporting it in your shell: `export GEMINI_API_KEY="YOUR_API_KEY"`',
      );
    }
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (isEnteringApiKey) {
          setIsEnteringApiKey(false);
          setErrorMessage(null);
          return;
        }

        // Prevent exit if there is an error message.
        // This means they user is not authenticated yet.
        if (errorMessage) {
          return;
        }
        if (settings.merged.security?.auth?.selectedType === undefined) {
          // Prevent exiting if no auth method is set
          setErrorMessage(
            'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
          );
          return;
        }
        onSelect(undefined, SettingScope.User);
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
      <Text bold>Get started</Text>
      <Box marginTop={1}>
        <Text>
          {isEnteringApiKey
            ? 'Enter your Gemini API Key'
            : 'How would you like to authenticate for this project?'}
        </Text>
      </Box>
      <Box marginTop={1}>
        {isEnteringApiKey ? (
          <Box flexDirection="column">
            <Box>
              <Text>
                Create an API key at{' '}
                <Link url="https://aistudio.google.com/app/apikey">
                  <Text color={Colors.AccentBlue}>
                    https://aistudio.google.com/app/apikey
                  </Text>
                </Link>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                Your API key will be stored in a local .env file in your
                project.
              </Text>
            </Box>
            <Box>
              <Text>Enter your Gemini API Key here: </Text>
              <CustomTextInput
                value={apiKey}
                onChange={setApiKey}
                onSubmit={handleApiKeySubmit}
                mask="*"
              />
            </Box>
          </Box>
        ) : (
          <RadioButtonSelect
            items={items}
            initialIndex={initialAuthIndex}
            onSelect={handleAuthSelect}
          />
        )}
      </Box>
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          {isEnteringApiKey
            ? '(Use Enter to submit, Esc to go back)'
            : '(Use Enter to select)'}
        </Text>
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
    </Box>
  );
}
