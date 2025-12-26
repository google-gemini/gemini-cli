/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { TextInput } from '../shared/TextInput.js';
import { useTextBuffer } from '../shared/text-buffer.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import {
  validateCommand,
  validateName,
  validateTimeout,
  DEFAULT_HOOK_TIMEOUT,
} from './types.js';

interface HookDetailsFormProps {
  initialCommand?: string;
  initialName?: string;
  initialDescription?: string;
  initialTimeout?: number;
  onSubmit: (details: HookDetails) => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

export interface HookDetails {
  command: string;
  name?: string;
  description?: string;
  timeout?: number;
}

type Field = 'command' | 'name' | 'description' | 'timeout';

const FIELDS: Field[] = ['command', 'name', 'description', 'timeout'];

export function HookDetailsForm({
  initialCommand = '',
  initialName = '',
  initialDescription = '',
  initialTimeout,
  onSubmit,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: HookDetailsFormProps): React.JSX.Element {
  const [activeField, setActiveField] = useState<Field>('command');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const commandBuffer = useTextBuffer({
    initialText: initialCommand,
    viewport: { width: 60, height: 1 },
    isValidPath: () => false,
    singleLine: true,
  });

  const nameBuffer = useTextBuffer({
    initialText: initialName,
    viewport: { width: 60, height: 1 },
    isValidPath: () => false,
    singleLine: true,
  });

  const descriptionBuffer = useTextBuffer({
    initialText: initialDescription,
    viewport: { width: 60, height: 1 },
    isValidPath: () => false,
    singleLine: true,
  });

  const timeoutBuffer = useTextBuffer({
    initialText: initialTimeout?.toString() || '',
    viewport: { width: 20, height: 1 },
    isValidPath: () => false,
    singleLine: true,
  });

  useEffect(() => {
    setErrors((prev) => ({ ...prev, command: undefined }));
  }, [commandBuffer.text]);

  useEffect(() => {
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, [nameBuffer.text]);

  useEffect(() => {
    setErrors((prev) => ({ ...prev, timeout: undefined }));
  }, [timeoutBuffer.text]);

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<Field, string>> = {};

    const cmdValidation = validateCommand(commandBuffer.text);
    if (!cmdValidation.valid) {
      newErrors.command = cmdValidation.error;
    }

    const nameValidation = validateName(nameBuffer.text);
    if (!nameValidation.valid) {
      newErrors.name = nameValidation.error;
    }

    const timeoutValue = timeoutBuffer.text.trim()
      ? parseInt(timeoutBuffer.text.trim(), 10)
      : undefined;
    const timeoutValidation = validateTimeout(timeoutValue);
    if (!timeoutValidation.valid) {
      newErrors.timeout = timeoutValidation.error;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [commandBuffer.text, nameBuffer.text, timeoutBuffer.text]);

  const handleSubmit = useCallback(() => {
    if (!validateAll()) {
      const firstErrorField = FIELDS.find((f) => errors[f]);
      if (firstErrorField) {
        setActiveField(firstErrorField);
      }
      return;
    }

    const timeoutValue = timeoutBuffer.text.trim()
      ? parseInt(timeoutBuffer.text.trim(), 10)
      : undefined;

    onSubmit({
      command: commandBuffer.text.trim(),
      name: nameBuffer.text.trim() || undefined,
      description: descriptionBuffer.text.trim() || undefined,
      timeout: timeoutValue,
    });
  }, [
    validateAll,
    errors,
    onSubmit,
    commandBuffer.text,
    nameBuffer.text,
    descriptionBuffer.text,
    timeoutBuffer.text,
  ]);

  const navigateField = useCallback(
    (direction: 'up' | 'down') => {
      const currentIndex = FIELDS.indexOf(activeField);
      if (direction === 'up') {
        setActiveField(FIELDS[Math.max(0, currentIndex - 1)]);
      } else {
        setActiveField(FIELDS[Math.min(FIELDS.length - 1, currentIndex + 1)]);
      }
    },
    [activeField],
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onBack();
        return;
      }
      if (key.name === 'tab' || (key.ctrl && key.name === 'n')) {
        navigateField('down');
        return;
      }
      if (key.shift && key.name === 'tab') {
        navigateField('up');
        return;
      }
      if (key.ctrl && key.name === 'return') {
        handleSubmit();
        return;
      }
    },
    { isActive: isFocused },
  );

  const renderField = (
    field: Field,
    label: string,
    buffer: ReturnType<typeof useTextBuffer>,
    placeholder: string,
    required: boolean = false,
    helpText?: string,
  ) => {
    const isActive = activeField === field;
    const hasError = !!errors[field];

    return (
      <Box flexDirection="column" marginBottom={1} key={field}>
        <Box>
          <Text color={isActive ? theme.text.primary : theme.text.secondary}>
            {isActive ? '▸ ' : '  '}
            {label}
            {required && <Text color={theme.status.error}>*</Text>}:
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor={
            hasError
              ? theme.status.error
              : isActive
                ? theme.border.focused
                : theme.border.default
          }
          paddingX={1}
          marginLeft={2}
        >
          <TextInput
            buffer={buffer}
            placeholder={placeholder}
            onSubmit={() => {
              if (field === 'timeout') {
                handleSubmit();
              } else {
                navigateField('down');
              }
            }}
            onCancel={onBack}
            focus={isActive && isFocused}
          />
        </Box>
        {hasError && (
          <Box marginLeft={2}>
            <Text color={theme.status.error}>✗ {errors[field]}</Text>
          </Box>
        )}
        {helpText && !hasError && (
          <Box marginLeft={2}>
            <Text color={theme.text.secondary} dimColor>
              {helpText}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Step 3: Hook Details
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>
          Configure the hook command and optional metadata.
        </Text>
      </Box>

      {renderField(
        'command',
        'Command',
        commandBuffer,
        '/path/to/script.sh or executable',
        true,
        'Shell command or script path. Supports $GEMINI_PROJECT_DIR.',
      )}

      {renderField(
        'name',
        'Name',
        nameBuffer,
        'my-hook (for enable/disable)',
        false,
        'Unique identifier for /hooks enable|disable commands.',
      )}

      {renderField(
        'description',
        'Description',
        descriptionBuffer,
        'What this hook does',
        false,
      )}

      {renderField(
        'timeout',
        'Timeout (ms)',
        timeoutBuffer,
        `${DEFAULT_HOOK_TIMEOUT} (default)`,
        false,
        'Maximum execution time in milliseconds.',
      )}

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Tab to navigate, Enter to continue, Ctrl+Enter to submit, Esc to go
          back)
        </Text>
      </Box>
    </Box>
  );
}
