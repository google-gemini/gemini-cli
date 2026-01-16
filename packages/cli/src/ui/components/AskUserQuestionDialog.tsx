/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
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
  onActiveTextInputChange?: (active: boolean) => void;
}

interface QuestionProgressHeaderProps {
  questions: Question[];
  currentIndex: number;
  answeredIndices: Set<number>;
  showReviewTab?: boolean;
  isOnReviewTab?: boolean;
}

const QuestionProgressHeader: React.FC<QuestionProgressHeaderProps> = ({
  questions,
  currentIndex,
  answeredIndices,
  showReviewTab = false,
  isOnReviewTab = false,
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
              i === currentIndex && !isOnReviewTab
                ? theme.text.accent
                : theme.text.secondary
            }
            bold={i === currentIndex && !isOnReviewTab}
          >
            {q.header}
          </Text>
        </React.Fragment>
      ))}
      {showReviewTab && (
        <>
          <Text color={theme.text.secondary}>{' │ '}</Text>
          <Text color={theme.text.secondary}>{'≡'} </Text>
          <Text
            color={isOnReviewTab ? theme.text.accent : theme.text.secondary}
            bold={isOnReviewTab}
          >
            Review
          </Text>
        </>
      )}
      <Text color={theme.text.secondary}>{' →'}</Text>
    </Box>
  );
};

interface ReviewViewProps {
  questions: Question[];
  answers: { [key: string]: string };
  onSubmit: () => void;
  progressHeader?: React.ReactNode;
}

const ReviewView: React.FC<ReviewViewProps> = ({
  questions,
  answers,
  onSubmit,
  progressHeader,
}) => {
  const unansweredCount = questions.length - Object.keys(answers).length;
  const hasUnanswered = unansweredCount > 0;

  // Handle Enter to submit
  useKeypress(
    (key: Key) => {
      if (key.name === 'return') {
        onSubmit();
      }
    },
    { isActive: true },
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
          Review your answers:
        </Text>
      </Box>

      {hasUnanswered && (
        <Box marginBottom={1}>
          <Text color={theme.status.warning}>
            ⚠ You have {unansweredCount} unanswered question
            {unansweredCount > 1 ? 's' : ''}
          </Text>
        </Box>
      )}

      {questions.map((q, i) => (
        <Box key={i} marginBottom={0}>
          <Text color={theme.text.secondary}>{q.header}</Text>
          <Text color={theme.text.secondary}> → </Text>
          <Text color={answers[i] ? theme.text.primary : theme.status.warning}>
            {answers[i] || '(not answered)'}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Enter to submit · ←/→ to edit answers · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

// ============== Text Question View ==============

interface TextQuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onSelectionChange?: (answer: string) => void;
  onEditingOther?: (editing: boolean) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const TextQuestionView: React.FC<TextQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingOther,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const [textValue, setTextValue] = useState(initialAnswer || '');

  const handleTextTyping = useCallback(
    (key: Key) => {
      // Handle Ctrl+C to clear all text
      if (key.ctrl && key.name === 'c') {
        setTextValue('');
        onSelectionChange?.('');
        return;
      }

      // Handle backspace
      if (key.name === 'backspace' || key.name === 'delete') {
        const newText = textValue.slice(0, -1);
        setTextValue(newText);
        onSelectionChange?.(newText);
        return;
      }

      // Handle Enter to submit
      if (key.name === 'return') {
        if (textValue.trim()) {
          onAnswer(textValue.trim());
        }
        return;
      }

      // Handle printable characters
      if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        key.sequence.charCodeAt(0) >= 32
      ) {
        const newText = textValue + key.sequence;
        setTextValue(newText);
        onSelectionChange?.(newText);
        onEditingOther?.(true);
      }
    },
    [textValue, onAnswer, onSelectionChange, onEditingOther],
  );

  useKeypress(handleTextTyping, { isActive: true });

  // Notify parent that we're in text input mode (for Ctrl+C handling)
  useEffect(() => {
    onEditingOther?.(true);
    return () => {
      onEditingOther?.(false);
    };
  }, [onEditingOther]);

  const placeholder = question.placeholder || 'Enter your response';
  const showPlaceholder = !textValue;

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

      <Box flexDirection="row" marginBottom={1}>
        <Text color={theme.text.accent}>{'> '}</Text>
        {showPlaceholder ? (
          <Text color={theme.text.secondary} italic>
            <Text color={theme.text.accent}>{'|'}</Text>
            {placeholder}
          </Text>
        ) : (
          <Text color={theme.text.primary}>
            {textValue}
            <Text color={theme.text.accent}>{'|'}</Text>
          </Text>
        )}
      </Box>

      {keyboardHints}
    </Box>
  );
};

// ============== Choice Question View ==============

interface OptionItem {
  key: string;
  label: string;
  description: string;
  type: 'option' | 'other' | 'done';
  index: number;
}

interface ChoiceQuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onSelectionChange?: (answer: string) => void;
  onEditingOther?: (editing: boolean) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const ChoiceQuestionView: React.FC<ChoiceQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingOther,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const questionOptions = useMemo(
    () => question.options ?? [],
    [question.options],
  );

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
        const index = questionOptions.findIndex((opt) => opt.label === answer);
        if (index !== -1) {
          selectedIndices.add(index);
        } else {
          otherText = answer;
          isOtherSelected = true;
        }
      });
    } else {
      const index = questionOptions.findIndex(
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
  }, [initialAnswer, questionOptions, question.multiSelect]);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    initialState.selectedIndices,
  );
  const [otherText, setOtherText] = useState(initialState.otherText);
  const [isOtherSelected, setIsOtherSelected] = useState(
    initialState.isOtherSelected,
  );
  const [isOtherFocused, setIsOtherFocused] = useState(false);

  // Helper to build answer string from selections
  const buildAnswerString = useCallback(
    (indices: Set<number>, includeOther: boolean, other: string) => {
      const answers: string[] = [];
      questionOptions.forEach((opt, i) => {
        if (indices.has(i)) {
          answers.push(opt.label);
        }
      });
      if (includeOther && other.trim()) {
        answers.push(other.trim());
      }
      return answers.join(', ');
    },
    [questionOptions],
  );

  // Handle inline typing when "Other" is focused
  const handleOtherTyping = useCallback(
    (key: Key) => {
      if (!isOtherFocused) return;

      // Handle Ctrl+C to clear all text
      if (key.ctrl && key.name === 'c') {
        setOtherText('');
        setIsOtherSelected(false);
        // Save for multi-select
        if (question.multiSelect) {
          onSelectionChange?.(buildAnswerString(selectedIndices, false, ''));
        }
        return;
      }

      // Handle backspace
      if (key.name === 'backspace' || key.name === 'delete') {
        const newText = otherText.slice(0, -1);
        setOtherText(newText);
        const newIsOtherSelected = newText.length > 0;
        if (!newIsOtherSelected) {
          setIsOtherSelected(false);
        }
        // Save for multi-select
        if (question.multiSelect) {
          onSelectionChange?.(
            buildAnswerString(selectedIndices, newIsOtherSelected, newText),
          );
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
        const newText = otherText + key.sequence;
        setOtherText(newText);
        // Only mark as selected in multi-select mode (for single-select, green/checkmark
        // should only appear for previously submitted answers from initialAnswer)
        if (question.multiSelect) {
          setIsOtherSelected(true);
          // Save immediately so navigation preserves it
          onSelectionChange?.(
            buildAnswerString(selectedIndices, true, newText),
          );
        }
        onEditingOther?.(true);
      }
    },
    [
      isOtherFocused,
      otherText,
      onEditingOther,
      question.multiSelect,
      onSelectionChange,
      buildAnswerString,
      selectedIndices,
    ],
  );

  useKeypress(handleOtherTyping, { isActive: isOtherFocused });

  const selectionItems = useMemo((): Array<SelectionListItem<OptionItem>> => {
    const list: Array<SelectionListItem<OptionItem>> = questionOptions.map(
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
  }, [questionOptions, question.multiSelect, otherText]);

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
          const newIndices = new Set(selectedIndices);
          if (newIndices.has(itemValue.index)) {
            newIndices.delete(itemValue.index);
          } else {
            newIndices.add(itemValue.index);
          }
          setSelectedIndices(newIndices);
          // Save selection immediately so navigation preserves it
          onSelectionChange?.(
            buildAnswerString(newIndices, isOtherSelected, otherText),
          );
        } else if (itemValue.type === 'other') {
          // Toggle other selection
          if (otherText.trim()) {
            const newIsOtherSelected = !isOtherSelected;
            setIsOtherSelected(newIsOtherSelected);
            // Save selection immediately
            onSelectionChange?.(
              buildAnswerString(selectedIndices, newIsOtherSelected, otherText),
            );
          }
        } else if (itemValue.type === 'done') {
          // Done just triggers navigation, selections already saved
          onAnswer(
            buildAnswerString(selectedIndices, isOtherSelected, otherText),
          );
        }
      } else {
        if (itemValue.type === 'option') {
          onAnswer(itemValue.label);
        } else if (itemValue.type === 'other') {
          // Submit the other text if it has content
          if (otherText.trim()) {
            // Reset editing state before submitting so navigation works on next question
            onEditingOther?.(false);
            onAnswer(otherText.trim());
          }
        }
      }
    },
    [
      question.multiSelect,
      selectedIndices,
      isOtherSelected,
      otherText,
      onAnswer,
      onEditingOther,
      onSelectionChange,
      buildAnswerString,
    ],
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
        items={selectionItems}
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
  onActiveTextInputChange,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [editingOther, setEditingOther] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Use refs for synchronous checks to prevent race conditions
  const submittedRef = useRef(false);
  const editingOtherRef = useRef(false);
  editingOtherRef.current = editingOther;

  // Sync editingOther state with parent for global keypress handling
  // Clean up on unmount to ensure Ctrl+C works normally after dialog closes
  useEffect(() => {
    onActiveTextInputChange?.(editingOther);
    return () => {
      onActiveTextInputChange?.(false);
    };
  }, [editingOther, onActiveTextInputChange]);

  // Handle Escape or Ctrl+C to cancel (but not Ctrl+C when editing Other)
  const handleCancel = useCallback(
    (key: Key) => {
      if (submittedRef.current) return;
      if (key.name === 'escape') {
        onCancel();
      } else if (key.ctrl && key.name === 'c' && !editingOtherRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  useKeypress(handleCancel, {
    isActive: !submitted,
  });

  // Review tab is at index questions.length (after all questions)
  const reviewTabIndex = questions.length;
  const isOnReviewTab = currentQuestionIndex === reviewTabIndex;

  // Bidirectional navigation between questions using custom useKeypress for consistency
  const handleNavigation = useCallback(
    (key: Key) => {
      // Allow navigation for text-type questions even when "editing"
      // (editingOther blocks navigation for choice-type "Other" field, not text-type questions)
      const currentQuestionIsText =
        questions[currentQuestionIndex]?.type === 'text';
      if ((editingOther && !currentQuestionIsText) || submittedRef.current)
        return;

      if (key.name === 'tab' || key.name === 'right') {
        // Allow navigation up to Review tab for multi-question flows
        const maxIndex =
          questions.length > 1 ? reviewTabIndex : questions.length - 1;
        if (currentQuestionIndex < maxIndex) {
          setCurrentQuestionIndex((prev) => prev + 1);
        }
      } else if (key.name === 'left') {
        if (currentQuestionIndex > 0) {
          setCurrentQuestionIndex((prev) => prev - 1);
        }
      }
    },
    [editingOther, currentQuestionIndex, questions, reviewTabIndex],
  );

  useKeypress(handleNavigation, {
    isActive: questions.length > 1 && !submitted,
  });

  const handleAnswer = useCallback(
    (answer: string) => {
      if (submittedRef.current) return;

      // Only record non-empty answers
      const hasAnswer = answer && answer.trim();
      const newAnswers = hasAnswer
        ? { ...answers, [currentQuestionIndex]: answer }
        : answers;
      if (hasAnswer) {
        setAnswers(newAnswers);
      }

      // For single questions, submit directly (no review tab)
      if (questions.length === 1) {
        submittedRef.current = true;
        setSubmitted(true);
        onSubmit(newAnswers);
        return;
      }

      // For multi-questions, advance to next question or Review tab
      if (currentQuestionIndex < reviewTabIndex) {
        setCurrentQuestionIndex((prev) => prev + 1);
      }
    },
    [currentQuestionIndex, questions.length, answers, onSubmit, reviewTabIndex],
  );

  // Submit from Review tab
  const handleReviewSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    onSubmit(answers);
  }, [answers, onSubmit]);

  // Save multi-select selections without triggering navigation
  const handleSelectionChange = useCallback(
    (answer: string) => {
      if (submittedRef.current) return;
      const hasAnswer = answer && answer.trim();
      if (hasAnswer) {
        setAnswers((prev) => ({ ...prev, [currentQuestionIndex]: answer }));
      } else {
        // Remove empty answer from state
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[currentQuestionIndex];
          return next;
        });
      }
    },
    [currentQuestionIndex],
  );

  const answeredIndices = useMemo(
    () => new Set(Object.keys(answers).map(Number)),
    [answers],
  );

  const currentQuestion = questions[currentQuestionIndex];

  const progressHeader =
    questions.length > 1 ? (
      <QuestionProgressHeader
        questions={questions}
        currentIndex={currentQuestionIndex}
        answeredIndices={answeredIndices}
        showReviewTab={true}
        isOnReviewTab={isOnReviewTab}
      />
    ) : null;

  // Render Review tab when on it
  if (isOnReviewTab) {
    return (
      <ReviewView
        questions={questions}
        answers={answers}
        onSubmit={handleReviewSubmit}
        progressHeader={progressHeader}
      />
    );
  }

  // Safeguard for invalid question index
  if (!currentQuestion) return null;

  const keyboardHints = (
    <Box marginTop={1}>
      <Text color={theme.text.secondary}>
        {currentQuestion.type === 'text'
          ? questions.length > 1
            ? 'Enter to submit · ←/→ to switch questions · Esc to cancel'
            : 'Enter to submit · Esc to cancel'
          : questions.length > 1
            ? 'Enter to select · ←/→ to switch questions · Esc to cancel'
            : 'Enter to select · ↑/↓ to navigate · Esc to cancel'}
      </Text>
    </Box>
  );

  // Render text-type or choice-type question view
  if (currentQuestion.type === 'text') {
    return (
      <TextQuestionView
        key={currentQuestionIndex}
        question={currentQuestion}
        onAnswer={handleAnswer}
        onSelectionChange={handleSelectionChange}
        onEditingOther={setEditingOther}
        initialAnswer={answers[currentQuestionIndex]}
        progressHeader={progressHeader}
        keyboardHints={keyboardHints}
      />
    );
  }

  return (
    <ChoiceQuestionView
      key={currentQuestionIndex}
      question={currentQuestion}
      onAnswer={handleAnswer}
      onSelectionChange={handleSelectionChange}
      onEditingOther={setEditingOther}
      initialAnswer={answers[currentQuestionIndex]}
      progressHeader={progressHeader}
      keyboardHints={keyboardHints}
    />
  );
};
