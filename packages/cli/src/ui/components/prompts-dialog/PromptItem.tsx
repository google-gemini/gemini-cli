/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PredefinedPrompt,
  PredefinedPromptVariable,
} from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import { UncontrolledTextInput } from 'ink-text-input';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { renderPromptTemplate } from '../../../config/prompt.js';
import { Colors } from '../../colors.js';

interface Props {
  prompt: PredefinedPrompt;
  onSubmit: (query: string) => void;
  setErrorMessage: (message: string | null) => void;
}

interface InputValue {
  name: string;
  value: string;
}

export function PromptItem({ prompt, onSubmit, setErrorMessage }: Props) {
  const variables = useMemo(() => prompt.variables || [], [prompt.variables]);

  const [inputValues, setInputValues] = useState<InputValue[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const isCompleted = inputValues.length === variables.length;

  useEffect(() => {
    if (variables.length === 0) {
      onSubmit(prompt.template);
    }
  }, [variables.length, prompt.template, onSubmit]);

  const handleInputSubmit = useCallback(
    (name: string, value: string) => {
      const trimmedValue = value.trim();

      if (!trimmedValue) {
        setErrorMessage('Input cannot be empty');
        return;
      }

      setErrorMessage(null);
      const newInputValues = [...inputValues, { name, value: trimmedValue }];
      setInputValues(newInputValues);
      setCurrentStep((prev) => prev + 1);

      // Check if all variables are filled
      if (newInputValues.length === variables.length) {
        const variableMap = newInputValues.reduce(
          (acc: Record<string, string>, input: InputValue) => {
            acc[input.name] = input.value;
            return acc;
          },
          {} as Record<string, string>,
        );

        try {
          const query = renderPromptTemplate(prompt.template, variableMap);
          onSubmit(query);
        } catch (renderError) {
          console.error('Error rendering prompt template:', renderError);
          setErrorMessage('Failed to generate prompt from template');
        }
      }
    },
    [inputValues, variables.length, prompt.template, onSubmit, setErrorMessage],
  );

  const getCompletedValue = useCallback(
    (variableName: string): string =>
      inputValues.find((input) => input.name === variableName)?.value || '',
    [inputValues],
  );

  const renderVariable = useCallback(
    (variable: PredefinedPromptVariable, index: number) => {
      if (index > currentStep) {
        return null;
      }

      if (index < currentStep) {
        return (
          <Box marginTop={1} key={variable.name}>
            <Text color={Colors.Gray}>
              {variable.name}:{' '}
              <Text color="white">{getCompletedValue(variable.name)}</Text>
            </Text>
          </Box>
        );
      }

      return (
        <Box marginTop={1} key={variable.name}>
          <Box marginRight={1}>
            <Text>Enter {variable.name}:</Text>
          </Box>

          <UncontrolledTextInput
            onSubmit={(value) => handleInputSubmit(variable.name, value)}
          />
        </Box>
      );
    },
    [currentStep, getCompletedValue, handleInputSubmit],
  );

  if (variables.length === 0) {
    return null;
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box flexDirection="column">
        <Text bold color="cyan">
          {prompt.name}
        </Text>

        {prompt.description && (
          <Box marginTop={1}>
            <Text color={Colors.Gray}>{prompt.description}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {variables.map(renderVariable)}
        </Box>

        {isCompleted && (
          <Box marginTop={1}>
            <Text color="green">
              ✓ All variables completed. Submitting prompt...
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
