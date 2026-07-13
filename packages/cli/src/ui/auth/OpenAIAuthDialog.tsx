/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import type { OpenAICredentials } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface OpenAIAuthDialogProps {
  onSubmit: (credentials: OpenAICredentials) => void;
  onCancel: () => void;
  error?: string | null;
  defaultValue?: OpenAICredentials;
}

type Field = 'baseUrl' | 'apiKey' | 'model';

export function OpenAIAuthDialog({
  onSubmit,
  onCancel,
  error,
  defaultValue,
}: OpenAIAuthDialogProps): React.JSX.Element {
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;
  const [field, setField] = useState<Field>('baseUrl');

  const defaultBaseUrl = defaultValue?.baseUrl ?? '';
  const defaultApiKey = defaultValue?.apiKey ?? '';
  const defaultModel = defaultValue?.model ?? '';
  const commonBufferOptions = {
    viewport: { width: viewportWidth, height: 1 },
    inputFilter: (text: string) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  };
  const baseUrl = useTextBuffer({
    ...commonBufferOptions,
    initialText: defaultBaseUrl,
    initialCursorOffset: defaultBaseUrl.length,
  });
  const apiKey = useTextBuffer({
    ...commonBufferOptions,
    initialText: defaultApiKey,
    initialCursorOffset: defaultApiKey.length,
  });
  const model = useTextBuffer({
    ...commonBufferOptions,
    initialText: defaultModel,
    initialCursorOffset: defaultModel.length,
  });

  const submitBaseUrl = (value: string) => {
    try {
      new URL(value);
      setField('apiKey');
    } catch {
      // Submission validation in AppContainer provides the visible error.
      onSubmit({ baseUrl: value, apiKey: apiKey.text, model: model.text });
    }
  };

  const submitApiKey = () => setField('model');
  const submitModel = () =>
    onSubmit({
      baseUrl: baseUrl.text.trim(),
      apiKey: apiKey.text.trim() || undefined,
      model: model.text.trim(),
    });

  const fields: Array<{
    key: Field;
    label: string;
    placeholder: string;
    buffer: typeof baseUrl;
    onSubmit: (value: string) => void;
  }> = [
    {
      key: 'baseUrl',
      label: 'Base URL',
      placeholder: 'https://api.openai.com/v1',
      buffer: baseUrl,
      onSubmit: submitBaseUrl,
    },
    {
      key: 'apiKey',
      label: 'API key (optional for local providers)',
      placeholder: 'sk-...',
      buffer: apiKey,
      onSubmit: submitApiKey,
    },
    {
      key: 'model',
      label: 'Model',
      placeholder: 'gpt-4.1',
      buffer: model,
      onSubmit: submitModel,
    },
  ];

  return (
    <Box
      borderStyle="round"
      borderColor={theme.ui.focus}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        Configure OpenAI-compatible API
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          Enter the endpoint credentials. They will be securely stored in your
          system keychain.
        </Text>
      </Box>
      {fields.map((item) => (
        <Box key={item.key} marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>{item.label}</Text>
          <Box
            borderStyle="round"
            borderColor={
              field === item.key ? theme.ui.focus : theme.border.default
            }
            paddingX={1}
          >
            <TextInput
              buffer={item.buffer}
              focus={field === item.key}
              onSubmit={item.onSubmit}
              onCancel={onCancel}
              placeholder={item.placeholder}
            />
          </Box>
        </Box>
      ))}
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to continue, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
