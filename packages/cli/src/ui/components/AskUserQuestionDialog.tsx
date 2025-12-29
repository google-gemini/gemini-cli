/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { Question, QuestionOption } from '@google/gemini-cli-core';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import type { DescriptiveRadioSelectItem } from './shared/DescriptiveRadioButtonSelect.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';

export interface AskUserQuestionDialogProps {
  questions: Question[];
  onComplete: (answers: Record<string, string | string[]>) => void;
  isFocused?: boolean;
}

interface ExtendedOption extends QuestionOption {
  value: string;
}

export const AskUserQuestionDialog: React.FC<AskUserQuestionDialogProps> = ({
  questions,
  onComplete,
  isFocused = true,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState('');
  const [selectedMultiOptions, setSelectedMultiOptions] = useState<Set<string>>(
    new Set(),
  );
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

  const currentQuestion = questions[currentQuestionIndex];
  const questionId = `question_${currentQuestionIndex + 1}`;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  // Prepare options with "Other" appended
  const optionsWithOther: ExtendedOption[] = [
    ...currentQuestion.options.map((opt: QuestionOption) => ({
      ...opt,
      value: opt.label,
    })),
    {
      label: 'Other',
      description: 'Provide custom input',
      value: 'Other',
    },
  ];

  // Convert to DescriptiveRadioSelectItem format
  const radioItems: Array<DescriptiveRadioSelectItem<string>> = optionsWithOther.map(
    (opt: ExtendedOption, index: number) => ({
      key: `option-${index}`,
      title: opt.label,
      description: opt.description,
      value: opt.value,
    }),
  );

  const handleSingleSelection = (value: string) => {
    if (value === 'Other') {
      setShowOtherInput(true);
      setCustomInputValue('');
      return;
    }

    // Record answer
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);

    // Move to next question or complete
    if (isLastQuestion) {
      onComplete(newAnswers);
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowOtherInput(false);
    }
  };

  const handleCustomInputKeypress = useCallback(
    (key: Key) => {
      if (key.name === 'escape') {
        // Cancel custom input, go back to options
        setShowOtherInput(false);
        setCustomInputValue('');
        return;
      }

      if (key.name === 'return') {
        // Submit custom input
        if (customInputValue.trim()) {
          const newAnswers = { ...answers, [questionId]: customInputValue };
          setAnswers(newAnswers);

          if (isLastQuestion) {
            onComplete(newAnswers);
          } else {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setShowOtherInput(false);
            setCustomInputValue('');
          }
        }
        return;
      }

      if (key.name === 'backspace') {
        setCustomInputValue(customInputValue.slice(0, -1));
        return;
      }

      // Regular character input
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setCustomInputValue(customInputValue + key.sequence);
      }
    },
    [
      customInputValue,
      answers,
      questionId,
      isLastQuestion,
      onComplete,
      currentQuestionIndex,
    ],
  );

  const handleMultiSelectToggle = useCallback(() => {
    if (!highlightedValue) return;

    const newSelected = new Set(selectedMultiOptions);
    if (newSelected.has(highlightedValue)) {
      newSelected.delete(highlightedValue);
    } else {
      newSelected.add(highlightedValue);
    }
    setSelectedMultiOptions(newSelected);
  }, [highlightedValue, selectedMultiOptions]);

  const handleMultiSelectConfirm = useCallback(() => {
    if (selectedMultiOptions.size === 0) {
      // Require at least one selection
      return;
    }

    const selectedArray = Array.from(selectedMultiOptions);
    const newAnswers = { ...answers, [questionId]: selectedArray };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      onComplete(newAnswers);
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedMultiOptions(new Set());
      setShowOtherInput(false);
    }
  }, [
    selectedMultiOptions,
    answers,
    questionId,
    isLastQuestion,
    onComplete,
    currentQuestionIndex,
  ]);

  const handleMultiSelectKeypress = useCallback(
    (key: Key) => {
      if (key.name === 'space') {
        handleMultiSelectToggle();
        return;
      }

      if (key.name === 'return') {
        handleMultiSelectConfirm();
        return;
      }
    },
    [handleMultiSelectToggle, handleMultiSelectConfirm],
  );

  // Activate custom input keypress handler when showing other input
  useKeypress(handleCustomInputKeypress, {
    isActive: showOtherInput && isFocused,
  });

  // Activate multi-select keypress handler when in multi-select mode
  useKeypress(handleMultiSelectKeypress, {
    isActive:
      currentQuestion.multiSelect === true && !showOtherInput && isFocused,
  });

  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={theme.ui.symbol}
    >
      {/* Header chip */}
      <Box marginBottom={1}>
        <Text bold color={theme.ui.symbol}>
          [{currentQuestion.header}]
        </Text>
        <Text dimColor>
          {' '}
          Question {currentQuestionIndex + 1} of {questions.length}
        </Text>
      </Box>

      {/* Question text */}
      <Box marginBottom={1}>
        <Text>{currentQuestion.question}</Text>
      </Box>

      {/* Input area */}
      {showOtherInput ? (
        <Box flexDirection="column">
          <Text color={theme.text.secondary}>
            Enter custom input (Esc to cancel):
          </Text>
          <Box marginTop={1}>
            <Text>{customInputValue}</Text>
            <Text inverse> </Text>
          </Box>
          {customInputValue.trim() && (
            <Text color={theme.text.secondary}>(Press Enter to submit)</Text>
          )}
        </Box>
      ) : currentQuestion.multiSelect ? (
        <Box flexDirection="column">
          <Text color={theme.text.secondary}>
            Select one or more options (↑/↓ to navigate, Space to toggle, Enter
            to confirm):
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {radioItems.map((item, index) => {
              const isSelected = selectedMultiOptions.has(item.value);
              const checkbox = isSelected ? '[x]' : '[ ]';

              return (
                <Box
                  key={item.key}
                  flexDirection="column"
                  marginBottom={index < radioItems.length - 1 ? 1 : 0}
                >
                  <Text>
                    <Text color={theme.ui.symbol}>{checkbox}</Text>{' '}
                    <Text bold={isSelected}>{item.title}</Text>
                  </Text>
                  <Text color={theme.text.secondary}> {item.description}</Text>
                </Box>
              );
            })}
          </Box>
          <DescriptiveRadioButtonSelect
            items={radioItems}
            onSelect={(value) => {
              if (value === 'Other') {
                setShowOtherInput(true);
                setCustomInputValue('');
              }
            }}
            onHighlight={setHighlightedValue}
            isFocused={isFocused}
            showNumbers={false}
          />
          {selectedMultiOptions.size > 0 && (
            <Text color={theme.text.secondary}>
              {selectedMultiOptions.size} selected (Press Enter to confirm)
            </Text>
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color={theme.text.secondary}>
            Select an option (↑/↓ to navigate, Enter to select):
          </Text>
          <DescriptiveRadioButtonSelect
            items={radioItems}
            onSelect={handleSingleSelection}
            isFocused={isFocused}
            showNumbers={true}
          />
        </Box>
      )}
    </Box>
  );
};
