import { AuthType } from '@google/gemini-cli-core';
import { Box, Text, useInput } from 'ink';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useState } from 'react';
import { validateAuthMethod } from '../../config/auth.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { Colors } from '../colors.js';
import { ApiKeyInput } from './ApiKeyInput.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
  onStatusMessage?: (message: string, type: 'info' | 'warning' | 'error') => void;
}

// Clean up terminal escape sequences from pasted input
function cleanApiKey(apiKey: string): string {
  // Remove bracketed paste mode sequences
  return apiKey
    .replace(/^\[?200~/, '')  // Remove start sequence
    .replace(/\[?201~$/, '')  // Remove end sequence
    .replace(/\x1b\[200~/, '') // Remove ANSI escape sequences
    .replace(/\x1b\[201~/, '')
    .trim();
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
  onStatusMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<AuthType | null>(null);
  
  const items = [
    { label: 'Login with Google', value: AuthType.LOGIN_WITH_GOOGLE },
    { label: 'Gemini API Key (AI Studio)', value: AuthType.USE_GEMINI },
    { label: 'Vertex AI', value: AuthType.USE_VERTEX_AI },
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
      if ((authMethod === AuthType.USE_GEMINI && !process.env.GEMINI_API_KEY) ||
          (authMethod === AuthType.USE_VERTEX_AI && !process.env.GOOGLE_API_KEY && 
           (!process.env.GOOGLE_CLOUD_PROJECT || !process.env.GOOGLE_CLOUD_LOCATION))) {
        setSelectedAuthMethod(authMethod);
        setShowApiKeyInput(true);
        setErrorMessage(null);
      } else {
        setErrorMessage(error);
      }
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleApiKeySubmit = (apiKey: string) => {
    // Clean the API key from any terminal escape sequences
    const cleanedApiKey = cleanApiKey(apiKey);
    
    // Set the API key in the environment
    const keyName = selectedAuthMethod === AuthType.USE_VERTEX_AI ? 'GOOGLE_API_KEY' : 'GEMINI_API_KEY';
    process.env[keyName] = cleanedApiKey;
    
    // Save to secure location in home directory
    try {
      const homeDir = os.homedir();
      const geminiDir = path.join(homeDir, '.gemini');
      const credentialsPath = path.join(geminiDir, 'credentials');
      
      // Ensure .gemini directory exists with proper permissions
      if (!fs.existsSync(geminiDir)) {
        fs.mkdirSync(geminiDir, { mode: 0o700 }); // rwx------
      }
      
      // Read existing credentials or create new object
      let credentials: Record<string, string> = {};
      if (fs.existsSync(credentialsPath)) {
        try {
          const parsed = dotenv.parse(fs.readFileSync(credentialsPath, 'utf8'));
          credentials = parsed;
        } catch (parseError) {
          // If parsing fails, start fresh
          credentials = {};
        }
      }
      
      // Update the key
      credentials[keyName] = cleanedApiKey;
      
      // Write back using dotenv format (handles special characters properly)
      const envContent = Object.entries(credentials)
        .map(([key, value]) => {
          // Quote values that contain spaces or special characters
          if (/[\s"'`${}()#]/.test(value)) {
            // Escape quotes in the value and wrap in double quotes
            const escapedValue = value.replace(/"/g, '\\"');
            return `${key}="${escapedValue}"`;
          }
          return `${key}=${value}`;
        })
        .join('\n') + '\n';
      
      // Write file with restrictive permissions
      fs.writeFileSync(credentialsPath, envContent, { mode: 0o600 }); // rw-------
      
      if (onStatusMessage) {
        onStatusMessage(
          `API key saved securely to ~/.gemini/credentials (${cleanedApiKey.length} characters)`,
          'info'
        );
      }
      
      // Also check if .env exists in current directory for backward compatibility
      const localEnvPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(localEnvPath)) {
        try {
          // Load and update local .env
          const localEnv = dotenv.parse(fs.readFileSync(localEnvPath, 'utf8'));
          localEnv[keyName] = cleanedApiKey;
          
          const localEnvContent = Object.entries(localEnv)
            .map(([key, value]) => {
              if (/[\s"'`${}()#]/.test(value)) {
                const escapedValue = value.replace(/"/g, '\\"');
                return `${key}="${escapedValue}"`;
              }
              return `${key}=${value}`;
            })
            .join('\n') + '\n';
          
          fs.writeFileSync(localEnvPath, localEnvContent);
          
          if (onStatusMessage) {
            onStatusMessage('Also updated local .env file', 'info');
          }
        } catch (e) {
          // Ignore local .env update errors
          if (onStatusMessage) {
            onStatusMessage('Could not update local .env file', 'warning');
          }
        }
      }
    } catch (e) {
      // If we can't write to file, continue anyway since we have it in memory
      if (onStatusMessage) {
        onStatusMessage(
          `Could not save ${keyName} to file: ${e instanceof Error ? e.message : String(e)}`,
          'warning'
        );
      }
    }
    
    setShowApiKeyInput(false);
    if (selectedAuthMethod) {
      onSelect(selectedAuthMethod, SettingScope.User);
    }
  };

  const handleApiKeyCancel = () => {
    setShowApiKeyInput(false);
    setSelectedAuthMethod(null);
  };

  useInput((_input, key) => {
    if (key.escape) {
      if (showApiKeyInput) {
        handleApiKeyCancel();
        return;
      }
      
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

  if (showApiKeyInput) {
    const keyType = selectedAuthMethod === AuthType.USE_VERTEX_AI 
      ? 'Google API Key (for Vertex AI Express Mode)' 
      : 'Gemini API Key';
      
    return (
      <ApiKeyInput
        keyType={keyType}
        onSubmit={handleApiKeySubmit}
        onCancel={handleApiKeyCancel}
      />
    );
  }

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
    </Box>
  );
}
