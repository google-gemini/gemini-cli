/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { TextInput } from '../shared/TextInput.js';
import { useTextBuffer } from '../shared/text-buffer.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { validateMatcher } from './types.js';

interface MatcherInputProps {
  initialValue?: string;
  onSubmit: (matcher: string) => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

export function MatcherInput({
  initialValue = '',
  onSubmit,
  onBack,
  onCancel,
  isFocused = true,
}: MatcherInputProps): React.JSX.Element {
  const [error, setError] = useState<string | undefined>();

  const buffer = useTextBuffer({
    initialText: initialValue,
    viewport: { width: 60, height: 1 },
    isValidPath: () => false,
    singleLine: true,
  });

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      const validation = validateMatcher(trimmed);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
      setError(undefined);
      onSubmit(trimmed);
    },
    [onSubmit],
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onBack();
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Step 2: Configure Matcher (Optional)
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>
          Enter a pattern to match specific tool names or contexts.
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>Leave empty to match all.</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor={error ? theme.status.error : theme.border.default}
        paddingX={1}
        marginBottom={1}
      >
        <TextInput
          buffer={buffer}
          placeholder="e.g., read_file, /read_.*/, or * for all"
          onSubmit={handleSubmit}
          onCancel={onCancel}
          focus={isFocused}
        />
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color={theme.status.error}>✗ {error}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.secondary} bold>
          Examples:
        </Text>
        <Text color={theme.text.secondary}>
          • <Text color={theme.text.accent}>read_file</Text> - exact tool name
          match
        </Text>
        <Text color={theme.text.secondary}>
          • <Text color={theme.text.accent}>/read_.*/</Text> - regex pattern
        </Text>
        <Text color={theme.text.secondary}>
          • <Text color={theme.text.accent}>*</Text> or empty - match all
        </Text>
      </Box>

      <Box>
        <Text color={theme.text.secondary}>
          (Enter to continue, Esc to go back)
        </Text>
      </Box>
    </Box>
  );
}
