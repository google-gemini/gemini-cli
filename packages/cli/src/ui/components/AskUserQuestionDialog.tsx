/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { Question } from '@google/gemini-cli-core';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';

interface AskUserQuestionDialogProps {
  questions: Question[];
  onSubmit: (answers: { [questionIndex: string]: string }) => void;
  onCancel: () => void;
}

interface QuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onEditingOther?: (editing: boolean) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

interface QuestionProgressHeaderProps {
  questions: Question[];
  currentIndex: number;
  answeredIndices: Set<number>;
}

const QuestionProgressHeader: React.FC<QuestionProgressHeaderProps> = ({
  questions,
  currentIndex,
  answeredIndices,
}) => {
  if (questions.length <= 1) return null;

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Text color={theme.text.secondary}>{'← '}</Text>
      {questions.map((q, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color={theme.text.secondary}>{' │ '}</Text>}
          <Text color={theme.text.secondary}>
            {answeredIndices.has(i) ? '✓' : '□'}{' '}
          </Text>
          <Text
            color={
              i === currentIndex ? theme.text.accent : theme.text.secondary
            }
            bold={i === currentIndex}
          >
            {q.header}
          </Text>
        </React.Fragment>
      ))}
      <Text color={theme.text.secondary}>{' →'}</Text>
    </Box>
  );
};

interface OptionItem {
  key: string;
  label: string;
  description: string;
  type: 'option' | 'other' | 'done';
  index: number;
}

const QuestionView: React.FC<QuestionViewProps> = ({
  question,
  onAnswer,
  onEditingOther,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  // Initialize state from initialAnswer if returning to a previously answered question
  const initialState = useMemo(() => {
    if (!initialAnswer) {
      return {
        selectedIndices: new Set<number>(),
        otherText: '',
        isOtherSelected: false,
      };
    }

    // Check if initialAnswer matches any option labels
    const selectedIndices = new Set<number>();
    let otherText = '';
    let isOtherSelected = false;

    if (question.multiSelect) {
      const answers = initialAnswer.split(', ');
      answers.forEach((answer) => {
        const index = question.options.findIndex((opt) => opt.label === answer);
        if (index !== -1) {
          selectedIndices.add(index);
        } else {
          otherText = answer;
          isOtherSelected = true;
        }
      });
    } else {
      const index = question.options.findIndex(
        (opt) => opt.label === initialAnswer,
      );
      if (index !== -1) {
        selectedIndices.add(index);
      } else {
        otherText = initialAnswer;
        isOtherSelected = true;
      }
    }

    return { selectedIndices, otherText, isOtherSelected };
  }, [initialAnswer, question.options, question.multiSelect]);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    initialState.selectedIndices,
  );
  const [otherText, setOtherText] = useState(initialState.otherText);
  const [isOtherSelected, setIsOtherSelected] = useState(
    initialState.isOtherSelected,
  );
  const [isOtherFocused, setIsOtherFocused] = useState(false);

  // Handle inline typing when "Other" is focused
  const handleOtherTyping = useCallback(
    (key: Key) => {
      if (!isOtherFocused) return;

      // Handle backspace
      if (key.name === 'backspace' || key.name === 'delete') {
        setOtherText((prev) => prev.slice(0, -1));
        if (otherText.length <= 1) {
          setIsOtherSelected(false);
        }
        return;
      }

      // Handle printable characters (ignore control keys)
      if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        key.sequence.charCodeAt(0) >= 32
      ) {
        setOtherText((prev) => prev + key.sequence);
        // Only mark as selected in multi-select mode (for single-select, green/checkmark
        // should only appear for previously submitted answers from initialAnswer)
        if (question.multiSelect) {
          setIsOtherSelected(true);
        }
        onEditingOther?.(true);
      }
    },
    [isOtherFocused, otherText.length, onEditingOther, question.multiSelect],
  );

  useKeypress(handleOtherTyping, { isActive: isOtherFocused });

  const options = useMemo((): Array<SelectionListItem<OptionItem>> => {
    const list: Array<SelectionListItem<OptionItem>> = question.options.map(
      (opt, i) => {
        const item: OptionItem = {
          key: `opt-${i}`,
          label: opt.label,
          description: opt.description,
          type: 'option',
          index: i,
        };
        return { key: item.key, value: item };
      },
    );

    const otherItem: OptionItem = {
      key: 'other',
      label: otherText || '',
      description: '',
      type: 'other',
      index: list.length,
    };
    list.push({ key: otherItem.key, value: otherItem });

    if (question.multiSelect) {
      const doneItem: OptionItem = {
        key: 'done',
        label: 'Done',
        description: 'Finish selection',
        type: 'done',
        index: list.length,
      };
      list.push({ key: doneItem.key, value: doneItem, hideNumber: true });
    }

    return list;
  }, [question, otherText]);

  const handleHighlight = useCallback(
    (itemValue: OptionItem) => {
      const nowFocusingOther = itemValue.type === 'other';
      setIsOtherFocused(nowFocusingOther);
      // Notify parent when we stop focusing Other (so navigation can resume)
      if (!nowFocusingOther) {
        onEditingOther?.(false);
      }
    },
    [onEditingOther],
  );

  const handleSelect = useCallback(
    (itemValue: OptionItem) => {
      if (question.multiSelect) {
        if (itemValue.type === 'option') {
          setSelectedIndices((prev) => {
            const next = new Set(prev);
            if (next.has(itemValue.index)) {
              next.delete(itemValue.index);
            } else {
              next.add(itemValue.index);
            }
            return next;
          });
        } else if (itemValue.type === 'other') {
          // Toggle other selection
          if (otherText.trim()) {
            setIsOtherSelected((prev) => !prev);
          }
        } else if (itemValue.type === 'done') {
          const answers: string[] = [];
          question.options.forEach((opt, i) => {
            if (selectedIndices.has(i)) {
              answers.push(opt.label);
            }
          });
          if (isOtherSelected && otherText.trim()) {
            answers.push(otherText.trim());
          }
          onAnswer(answers.join(', '));
        }
      } else {
        if (itemValue.type === 'option') {
          onAnswer(itemValue.label);
        } else if (itemValue.type === 'other') {
          // Submit the other text if it has content
          if (otherText.trim()) {
            onAnswer(otherText.trim());
          }
        }
      }
    },
    [question, selectedIndices, isOtherSelected, otherText, onAnswer],
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      borderColor={theme.border.default}
    >
      {progressHeader}
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          {question.question}
        </Text>
      </Box>
      {question.multiSelect && (
        <Text color={theme.text.secondary} italic>
          {' '}
          (Select all that apply)
        </Text>
      )}

      <BaseSelectionList<OptionItem>
        items={options}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        selectedColor={theme.text.accent}
        renderItem={(item, context) => {
          const optionItem = item.value;
          const isChecked =
            selectedIndices.has(optionItem.index) ||
            (optionItem.type === 'other' && isOtherSelected);
          const showCheck =
            question.multiSelect &&
            (optionItem.type === 'option' || optionItem.type === 'other');

          // Render inline text input for "Other" option
          if (optionItem.type === 'other') {
            const displayText = otherText || '';
            const placeholder = 'Enter a custom value';
            const showPlaceholder = !displayText && context.isSelected;
            const showCursor = context.isSelected;
            return (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  {showCheck && (
                    <Text
                      color={
                        isChecked ? theme.text.accent : theme.text.secondary
                      }
                    >
                      [{isChecked ? 'x' : ' '}]
                    </Text>
                  )}
                  <Text color={theme.text.primary}> </Text>
                  {showPlaceholder ? (
                    <Text color={theme.text.secondary} italic>
                      <Text color={theme.text.accent}>
                        {showCursor ? '▌' : ''}
                      </Text>
                      {placeholder}
                    </Text>
                  ) : (
                    <Text
                      color={
                        isChecked && !question.multiSelect
                          ? theme.status.success
                          : displayText
                            ? theme.text.primary
                            : theme.text.secondary
                      }
                    >
                      {displayText || (context.isSelected ? '' : placeholder)}
                      {showCursor && <Text color={theme.text.accent}>▌</Text>}
                    </Text>
                  )}
                  {isChecked && !question.multiSelect && (
                    <Text color={theme.status.success}> ✓</Text>
                  )}
                </Box>
              </Box>
            );
          }

          // Determine label color: checked (previously answered) uses success, selected uses accent, else primary
          const labelColor =
            isChecked && !question.multiSelect
              ? theme.status.success
              : context.isSelected
                ? context.titleColor
                : theme.text.primary;

          return (
            <Box flexDirection="column">
              <Box flexDirection="row">
                {showCheck && (
                  <Text
                    color={isChecked ? theme.text.accent : theme.text.secondary}
                  >
                    [{isChecked ? 'x' : ' '}]
                  </Text>
                )}
                <Text color={labelColor} bold={optionItem.type === 'done'}>
                  {' '}
                  {optionItem.label}
                </Text>
                {isChecked && !question.multiSelect && (
                  <Text color={theme.status.success}> ✓</Text>
                )}
              </Box>
              {optionItem.description && (
                <Text color={theme.text.secondary} wrap="wrap">
                  {' '}
                  {optionItem.description}
                </Text>
              )}
            </Box>
          );
        }}
      />
      {keyboardHints}
    </Box>
  );
};

export const AskUserQuestionDialog: React.FC<AskUserQuestionDialogProps> = ({
  questions,
  onSubmit,
  onCancel,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [editingOther, setEditingOther] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Use ref for synchronous check to prevent race conditions during unmount
  const submittedRef = useRef(false);

  // Handle Escape or Ctrl+C to cancel
  const handleCancel = useCallback(
    (key: Key) => {
      if (submittedRef.current) return;
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        onCancel();
      }
    },
    [onCancel],
  );

  useKeypress(handleCancel, {
    isActive: !submitted,
  });

  // Bidirectional navigation between questions using custom useKeypress for consistency
  const handleNavigation = useCallback(
    (key: Key) => {
      if (editingOther || submittedRef.current) return;

      if (key.name === 'tab' || key.name === 'right') {
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex((prev) => prev + 1);
        }
      } else if (key.name === 'left') {
        if (currentQuestionIndex > 0) {
          setCurrentQuestionIndex((prev) => prev - 1);
        }
      }
    },
    [editingOther, currentQuestionIndex, questions.length],
  );

  useKeypress(handleNavigation, {
    isActive: questions.length > 1 && !submitted,
  });

  const handleAnswer = useCallback(
    (answer: string) => {
      if (submittedRef.current) return;

      const newAnswers = { ...answers, [currentQuestionIndex]: answer };
      setAnswers(newAnswers);
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
      } else {
        // Set ref first (synchronous) to prevent any further input handling
        submittedRef.current = true;
        setSubmitted(true);
        onSubmit(newAnswers);
      }
    },
    [currentQuestionIndex, questions.length, answers, onSubmit],
  );

  const answeredIndices = useMemo(
    () => new Set(Object.keys(answers).map(Number)),
    [answers],
  );

  const currentQuestion = questions[currentQuestionIndex];

  if (!currentQuestion) return null;

  const progressHeader =
    questions.length > 1 ? (
      <QuestionProgressHeader
        questions={questions}
        currentIndex={currentQuestionIndex}
        answeredIndices={answeredIndices}
      />
    ) : null;

  const keyboardHints = (
    <Box marginTop={1}>
      <Text color={theme.text.secondary}>
        {questions.length > 1
          ? 'Enter to select · ←/→ to switch questions · Esc to cancel'
          : 'Enter to select · ↑/↓ to navigate · Esc to cancel'}
      </Text>
    </Box>
  );

  return (
    <QuestionView
      key={currentQuestionIndex}
      question={currentQuestion}
      onAnswer={handleAnswer}
      onEditingOther={setEditingOther}
      initialAnswer={answers[currentQuestionIndex]}
      progressHeader={progressHeader}
      keyboardHints={keyboardHints}
    />
  );
};
