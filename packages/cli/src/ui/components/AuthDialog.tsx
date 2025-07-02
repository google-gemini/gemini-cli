/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { Box, Text, useInput } from 'ink';
import * as fs from 'node:fs';
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
    
    // Try to save to .env file
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';
      
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        // Check if key already exists
        const lines = envContent.split('\n');
        const keyExists = lines.some(line => line.startsWith(`${keyName}=`));
        
        if (keyExists) {
          // Update existing key while preserving comments and formatting
          envContent = lines.map(line => {
            // Match the key at the beginning of the line
            const keyPattern = new RegExp(`^${keyName}=`);
            if (keyPattern.test(line)) {
              // Replace only the value, preserving any comments
              const commentIndex = line.indexOf('#');
              if (commentIndex > -1) {
                // Preserve inline comments
                const beforeComment = line.substring(0, commentIndex).trimEnd();
                const comment = line.substring(commentIndex);
                return `${keyName}=${cleanedApiKey} ${comment}`;
              } else {
                // No comments, just replace the line
                return `${keyName}=${cleanedApiKey}`;
              }
            }
            return line;
          }).join('\n');
        } else {
          // Add new key
          envContent = envContent.trim() + `\n${keyName}=${cleanedApiKey}\n`;
        }
      } else {
        // Create new .env file
        envContent = `${keyName}=${cleanedApiKey}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(`\nAPI key saved to .env file (${cleanedApiKey.length} characters)`);
    } catch (e) {
      // If we can't write to .env, continue anyway since we have it in memory
      console.warn(`Could not save ${keyName} to .env file:`, e);
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
