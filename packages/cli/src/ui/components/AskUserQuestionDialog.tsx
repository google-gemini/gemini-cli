/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type {
  Question,
  QuestionOption,
} from '@google/gemini-cli-core';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import type { DescriptiveRadioSelectItem } from './shared/DescriptiveRadioButtonSelect.js';

export interface AskUserQuestionDialogProps {
  questions: Question[];
  onComplete: (answers: Record<string, string | string[]>) => void;
  isFocused?: boolean;
}

interface ExtendedOption extends QuestionOption {
  value: string;
}

export const AskUserQuestionDialog: React.FC<
  AskUserQuestionDialogProps
> = ({ questions, onComplete, isFocused = true }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [showOtherInput, setShowOtherInput] = useState(false);

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
  const radioItems: DescriptiveRadioSelectItem<string>[] = optionsWithOther.map(
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


  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="round" borderColor={theme.ui.symbol}>
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
          <Text color={theme.status.warning}>
            Note: Custom "Other" input not yet implemented in Phase 1.
          </Text>
          <Text dimColor>
            Press any key to go back and select a predefined option.
          </Text>
        </Box>
      ) : currentQuestion.multiSelect ? (
        <Box flexDirection="column">
          <Text color={theme.text.secondary}>
            Select one or more options (↑/↓ to navigate, Space to toggle, Enter to confirm):
          </Text>
          {/* TODO: Implement checkbox selection */}
          <Text color={theme.status.warning}>
            Multi-select not yet implemented - using single select
          </Text>
          <DescriptiveRadioButtonSelect
            items={radioItems}
            onSelect={handleSingleSelection}
            isFocused={isFocused}
            showNumbers={true}
          />
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
